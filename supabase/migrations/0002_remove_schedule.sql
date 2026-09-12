-- ============================================================================
-- Drop the fixed daily schedule and move to a running balance.
--
-- The old model wrote one amortization_schedule row per collection day and
-- allocated every payment FIFO across those rows. That made the day the unit of
-- account, which is wrong for how the business actually collects: a member can
-- hand over money whenever they have it — twice in a morning, a little at noon,
-- the rest at night. Nothing about the money changes here; what a loan owes is
-- still principal + interest (+ a one-time penalty if it goes past maturity).
-- The daily figure survives as a target computed on the fly, not as rows.
-- ============================================================================

drop view if exists loan_balances;
drop function if exists public.allocate_to_schedule(uuid, numeric);
drop table if exists amortization_schedule;

-- ---------------------------------------------------------------------------
-- Splits one payment into principal / interest / penalty.
--
-- A late penalty settles first (it is a charge added on top, not part of the
-- plan the borrower agreed to). Whatever is left splits in the loan's own
-- principal:interest ratio, so every collection shows how much was your money
-- coming back and how much was earnings. The parts always sum to the exact
-- amount handed over — principal absorbs the rounding centavo.
-- ---------------------------------------------------------------------------
create or replace function public.split_payment(p_loan_id uuid, p_amount numeric)
returns table (principal_part numeric, interest_part numeric, penalty_part numeric)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_loan loans;
  v_paid_p numeric(14, 2);
  v_paid_i numeric(14, 2);
  v_paid_pen numeric(14, 2);
  v_rem_p numeric(14, 2);
  v_rem_i numeric(14, 2);
  v_rem_pen numeric(14, 2);
  v_left numeric(14, 2);
  v_base numeric(14, 2);
begin
  select * into v_loan from loans where id = p_loan_id;

  select coalesce(sum(principal_portion), 0),
         coalesce(sum(interest_portion), 0),
         coalesce(sum(penalty_portion), 0)
  into v_paid_p, v_paid_i, v_paid_pen
  from payments where loan_id = p_loan_id;

  v_rem_p := greatest(v_loan.principal - v_paid_p, 0);
  v_rem_i := greatest(v_loan.interest_amount - v_paid_i, 0);
  v_rem_pen := greatest(v_loan.penalty_amount - v_paid_pen, 0);

  penalty_part := least(p_amount, v_rem_pen);
  v_left := p_amount - penalty_part;

  v_base := v_loan.principal + v_loan.interest_amount;
  interest_part := case when v_base > 0
                        then round(v_left * v_loan.interest_amount / v_base, 2)
                        else 0 end;
  interest_part := least(interest_part, v_rem_i);
  principal_part := v_left - interest_part;

  -- a final payment can overshoot principal by a centavo of rounding
  if principal_part > v_rem_p then
    interest_part := interest_part + (principal_part - v_rem_p);
    principal_part := v_rem_p;
  end if;

  return next;
end;
$$;

-- Recomputes every split on a loan from its payment history, oldest first.
-- Still needed after an edit or delete so the books never drift.
create or replace function public.replay_loan_payments(p_loan_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pmt record;
  alloc record;
begin
  update payments
  set principal_portion = 0, interest_portion = 0, penalty_portion = 0
  where loan_id = p_loan_id;

  for pmt in
    select id, amount from payments
    where loan_id = p_loan_id
    order by payment_date, created_at
  loop
    select * into alloc from public.split_payment(p_loan_id, pmt.amount);
    update payments
    set principal_portion = alloc.principal_part,
        interest_portion = alloc.interest_part,
        penalty_portion = alloc.penalty_part
    where id = pmt.id;
  end loop;
end;
$$;

create or replace function public.sync_loan_status(p_loan_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_loan loans;
  v_paid numeric(14, 2);
begin
  select * into v_loan from loans where id = p_loan_id;
  if v_loan.status = 'written_off' then
    return;
  end if;

  select coalesce(sum(amount), 0) into v_paid from payments where loan_id = p_loan_id;

  if v_paid >= v_loan.principal + v_loan.interest_amount + v_loan.penalty_amount then
    update loans set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_loan_id and status <> 'completed';
  else
    update loans set status = 'active', completed_at = null
    where id = p_loan_id and status <> 'active';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Loan creation: no schedule rows, just the agreed terms.
-- ---------------------------------------------------------------------------
create or replace function public.create_loan(
  p_member_id uuid,
  p_principal numeric,
  p_term_days integer default null,
  p_start_date date default null,
  p_interest_rate numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cfg settings;
  v_term integer;
  v_rate numeric(6, 3);
  v_start date;
  v_interest numeric(14, 2);
  v_loan_id uuid;
begin
  select * into cfg from settings where id = 1;

  v_term := coalesce(p_term_days, cfg.default_term_days);
  v_rate := coalesce(p_interest_rate, cfg.interest_rate);
  v_start := coalesce(p_start_date, public.biz_today());

  if p_principal is null or p_principal <= 0 then
    raise exception 'Principal must be greater than zero';
  end if;
  if v_term <= 0 then
    raise exception 'Term must be at least one day';
  end if;

  v_interest := round(p_principal * v_rate / 100.0, 2);

  insert into loans (member_id, principal, interest_rate, interest_amount, term_days,
                     start_date, maturity_date, penalty_rate, note)
  values (p_member_id, p_principal, v_rate, v_interest, v_term,
          v_start, v_start + v_term, cfg.penalty_rate, p_note)
  returning id into v_loan_id;

  return v_loan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Collections. Any amount, any number of times a day.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_payment_date date default null,
  p_note text default null
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_loan loans;
  v_paid numeric(14, 2);
  v_balance numeric(14, 2);
  v_date date := coalesce(p_payment_date, public.biz_today());
  alloc record;
  v_payment_id uuid;
  v_result json;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.status = 'written_off' then
    raise exception 'This loan is written off. Reopen it before recording payments.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select coalesce(sum(amount), 0) into v_paid from payments where loan_id = p_loan_id;
  v_balance := v_loan.principal + v_loan.interest_amount + v_loan.penalty_amount - v_paid;

  if v_balance <= 0 then
    raise exception 'This loan is already fully paid';
  end if;
  if p_amount > v_balance then
    raise exception 'Amount exceeds the remaining balance. Full payoff is %',
      to_char(v_balance, 'FM999999990.00');
  end if;

  select * into alloc from public.split_payment(p_loan_id, p_amount);

  insert into payments (loan_id, member_id, amount, principal_portion, interest_portion,
                        penalty_portion, payment_date, note)
  values (p_loan_id, v_loan.member_id, p_amount, alloc.principal_part, alloc.interest_part,
          alloc.penalty_part, v_date, p_note)
  returning id into v_payment_id;

  perform public.sync_loan_status(p_loan_id);

  select json_build_object(
           'id', p.id, 'amount', p.amount, 'principal_portion', p.principal_portion,
           'interest_portion', p.interest_portion, 'penalty_portion', p.penalty_portion,
           'payment_date', p.payment_date, 'balance_after', v_balance - p.amount
         )
  into v_result
  from payments p where p.id = v_payment_id;

  insert into payment_audit (payment_id, loan_id, action, new_values)
  values (v_payment_id, p_loan_id, 'created', v_result);

  return v_result;
end;
$$;

create or replace function public.update_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_payment_date date default null,
  p_note text default null
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old payments;
  v_loan loans;
  v_obligation numeric(14, 2);
  v_other_payments numeric(14, 2);
  v_new json;
begin
  select * into v_old from payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_loan from loans where id = v_old.loan_id;
  v_obligation := v_loan.principal + v_loan.interest_amount + v_loan.penalty_amount;

  select coalesce(sum(amount), 0) into v_other_payments
  from payments where loan_id = v_old.loan_id and id <> p_payment_id;

  if v_other_payments + p_amount > v_obligation then
    raise exception 'That amount would overpay the loan. Most it can be is %',
      to_char(v_obligation - v_other_payments, 'FM999999990.00');
  end if;

  update payments
  set amount = p_amount,
      payment_date = coalesce(p_payment_date, payment_date),
      note = p_note
  where id = p_payment_id;

  perform public.replay_loan_payments(v_old.loan_id);
  perform public.sync_loan_status(v_old.loan_id);

  select json_build_object(
           'id', p.id, 'amount', p.amount, 'principal_portion', p.principal_portion,
           'interest_portion', p.interest_portion, 'penalty_portion', p.penalty_portion,
           'payment_date', p.payment_date, 'note', p.note
         )
  into v_new
  from payments p where p.id = p_payment_id;

  insert into payment_audit (payment_id, loan_id, action, old_values, new_values)
  values (p_payment_id, v_old.loan_id, 'updated',
          json_build_object('amount', v_old.amount, 'payment_date', v_old.payment_date,
                            'note', v_old.note,
                            'principal_portion', v_old.principal_portion,
                            'interest_portion', v_old.interest_portion,
                            'penalty_portion', v_old.penalty_portion),
          v_new);

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- One-time late penalty: now just a figure on the loan, no schedule row.
-- ---------------------------------------------------------------------------
create or replace function public.apply_due_penalties()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
  v_penalty numeric(14, 2);
  v_count integer := 0;
begin
  for r in
    select lb.loan_id, lb.balance, l.penalty_rate
    from loan_balances lb
    join loans l on l.id = lb.loan_id
    where l.status = 'active'
      and l.penalty_applied = false
      and public.biz_today() > l.maturity_date
      and lb.balance > 0
  loop
    v_penalty := round(r.balance * r.penalty_rate / 100.0, 2);
    continue when v_penalty <= 0;

    update loans
    set penalty_applied = true, penalty_amount = v_penalty
    where id = r.loan_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================================
-- The view, rebuilt on arithmetic instead of schedule rows.
--
-- daily_due is what the borrower agreed to pay each day; due_to_date is that
-- figure times the days elapsed, so "behind schedule" still means the same
-- thing it always did — it is simply no longer stored one row at a time.
-- ============================================================================
create or replace view loan_balances with (security_invoker = true) as
with pay as (
  select loan_id,
         sum(amount) as paid_total,
         sum(principal_portion) as paid_principal,
         sum(interest_portion) as paid_interest,
         sum(penalty_portion) as paid_penalty,
         count(*) as payments_count,
         max(payment_date) as last_payment_date
  from payments
  group by loan_id
)
select l.id as loan_id,
       l.member_id,
       m.name as member_name,
       m.contact_number,
       m.toda,
       l.principal,
       l.interest_rate,
       l.interest_amount,
       l.penalty_amount,
       l.penalty_applied,
       l.term_days,
       l.start_date,
       l.maturity_date,
       l.status,
       l.created_at,
       l.principal + l.interest_amount + l.penalty_amount as total_obligation,
       coalesce(p.paid_total, 0) as paid_total,
       coalesce(p.paid_principal, 0) as paid_principal,
       coalesce(p.paid_interest, 0) as paid_interest,
       coalesce(p.paid_penalty, 0) as paid_penalty,
       coalesce(p.payments_count, 0) as payments_count,
       p.last_payment_date,
       l.principal + l.interest_amount + l.penalty_amount
         - coalesce(p.paid_total, 0) as balance,
       l.principal - coalesce(p.paid_principal, 0) as principal_balance,
       round((l.principal + l.interest_amount) / nullif(l.term_days, 0), 2) as daily_due,
       greatest(
         0,
         least(
           round((l.principal + l.interest_amount) / nullif(l.term_days, 0), 2)
             * least(greatest(public.biz_today() - l.start_date, 0), l.term_days),
           l.principal + l.interest_amount
         )
         + case when l.penalty_applied and public.biz_today() > l.maturity_date
                then l.penalty_amount else 0 end
         - coalesce(p.paid_total, 0)
       ) as arrears,
       greatest(0, public.biz_today() - l.maturity_date) as days_past_maturity,
       (l.status = 'active'
        and public.biz_today() > l.maturity_date
        and l.principal + l.interest_amount + l.penalty_amount
            - coalesce(p.paid_total, 0) > 0) as is_overdue,
       exists (
         select 1 from payments px
         where px.loan_id = l.id and px.payment_date = public.biz_today()
       ) as paid_today
from loans l
join members m on m.id = l.member_id
left join pay p on p.loan_id = l.id;

-- ---------------------------------------------------------------------------
-- Period reporting: what was due in the window, worked out from the terms.
-- ---------------------------------------------------------------------------
create or replace function public.period_stats(p_from date, p_to date)
returns json
language sql
stable
set search_path = public, pg_temp
as $$
  with collected as (
    select coalesce(sum(amount), 0) as collected,
           coalesce(sum(principal_portion), 0) as principal_collected,
           coalesce(sum(interest_portion + penalty_portion), 0) as income,
           count(*) as payments_count,
           count(distinct loan_id) as loans_paid,
           count(distinct member_id) as members_paid
    from payments
    where payment_date between p_from and p_to
  ),
  scheduled as (
    select coalesce(sum(
             greatest(0, least(l.maturity_date, p_to) - greatest(l.start_date + 1, p_from) + 1)
             * round((l.principal + l.interest_amount) / nullif(l.term_days, 0), 2)
           ), 0) as scheduled_due
    from loans l
    where l.start_date < p_to and l.maturity_date >= p_from
  ),
  new_loans as (
    select count(*) as cnt, coalesce(sum(principal), 0) as principal
    from loans where start_date between p_from and p_to
  ),
  finished as (
    select count(*) as cnt
    from loans
    where status = 'completed'
      and (completed_at at time zone 'Asia/Manila')::date between p_from and p_to
  ),
  new_members as (
    select count(*) as cnt from members
    where (created_at at time zone 'Asia/Manila')::date between p_from and p_to
  ),
  wrote_off as (
    select count(*) as cnt, coalesce(sum(principal_loss), 0) as loss
    from write_offs
    where status = 'confirmed'
      and (resolved_at at time zone 'Asia/Manila')::date between p_from and p_to
  )
  select json_build_object(
    'from', p_from,
    'to', p_to,
    'collected', c.collected,
    'principal_collected', c.principal_collected,
    'income', c.income,
    'payments_count', c.payments_count,
    'loans_paid', c.loans_paid,
    'members_paid', c.members_paid,
    'scheduled_due', s.scheduled_due,
    'unpaid', greatest(0, s.scheduled_due - c.collected),
    'collection_rate', case when s.scheduled_due > 0
                            then round(least(1, c.collected / s.scheduled_due) * 100, 1)
                            else null end,
    'new_loans', nl.cnt,
    'new_loans_principal', nl.principal,
    'finished_loans', f.cnt,
    'new_members', nm.cnt,
    'write_offs', wo.cnt,
    'write_off_loss', wo.loss
  )
  from collected c, scheduled s, new_loans nl, finished f, new_members nm, wrote_off wo;
$$;

-- ---------------------------------------------------------------------------
-- Grants. A dropped-and-recreated view loses them, so restate here.
-- ---------------------------------------------------------------------------
grant select on loan_balances to authenticated;

revoke all on function public.split_payment(uuid, numeric) from public, anon;
revoke all on function public.replay_loan_payments(uuid) from public, anon;
revoke all on function public.sync_loan_status(uuid) from public, anon;
revoke all on function public.create_loan(uuid, numeric, integer, date, numeric, text) from public, anon;
revoke all on function public.record_payment(uuid, numeric, date, text) from public, anon;
revoke all on function public.update_payment(uuid, numeric, date, text) from public, anon;
revoke all on function public.apply_due_penalties() from public, anon;
revoke all on function public.period_stats(date, date) from public, anon;

grant execute on function public.create_loan(uuid, numeric, integer, date, numeric, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, date, text) to authenticated;
grant execute on function public.update_payment(uuid, numeric, date, text) to authenticated;
grant execute on function public.period_stats(date, date) to authenticated;

-- record_payment/update_payment call these internally, and Postgres checks
-- EXECUTE on every function in the call chain, not just the one the client
-- calls directly — these were missed on first pass.
grant execute on function public.split_payment(uuid, numeric) to authenticated;
grant execute on function public.replay_loan_payments(uuid) to authenticated;
grant execute on function public.sync_loan_status(uuid) to authenticated;

-- Pre-existing gap from 0001: run_maintenance() calls these internally too.
grant execute on function public.apply_due_penalties() to authenticated;
grant execute on function public.flag_write_off_candidates() to authenticated;
