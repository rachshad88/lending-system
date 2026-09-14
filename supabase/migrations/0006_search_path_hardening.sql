-- ============================================================================
-- 0006 — search_path hardening
--
-- 0002 added `set search_path = public, pg_temp` to every function it
-- redefined, but nine functions from 0001 that it never touched were missed:
-- biz_today, dashboard_kpis, income_series, flag_write_off_candidates,
-- confirm_write_off, dismiss_write_off, reopen_loan, delete_payment and
-- run_maintenance. None of these are SECURITY DEFINER and all are already
-- gated behind is_admin(), so this closes a defense-in-depth gap rather than
-- a live hole. No logic changes: bodies are identical to what is deployed.
-- ============================================================================

create or replace function public.biz_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

create or replace function public.dashboard_kpis()
returns json
language sql
stable
set search_path = public, pg_temp
as $$
  with income as (
    select coalesce(sum(interest_portion + penalty_portion), 0) as gross,
           coalesce(sum(principal_portion), 0) as principal_recovered,
           coalesce(sum(amount), 0) as collected
    from payments
  ),
  losses as (
    select coalesce(sum(principal_loss), 0) as principal_loss,
           coalesce(sum(balance_loss), 0) as balance_loss,
           count(*) as confirmed_count
    from write_offs where status = 'confirmed'
  ),
  book as (
    select coalesce(sum(principal), 0) as principal_released,
           count(*) filter (where status = 'active') as active_loans,
           count(*) filter (where status = 'completed') as completed_loans,
           count(*) filter (where status = 'written_off') as written_off_loans
    from loans
  ),
  outstanding as (
    select coalesce(sum(principal_balance), 0) as principal_outstanding,
           coalesce(sum(balance), 0) as balance_outstanding,
           count(*) filter (where is_overdue) as overdue_loans,
           coalesce(sum(case when is_overdue then balance else 0 end), 0) as overdue_balance,
           coalesce(sum(arrears), 0) as total_arrears
    from loan_balances where status = 'active'
  ),
  today as (
    select count(*) as expected,
           count(*) filter (where paid_today) as paid,
           count(*) filter (where not paid_today) as unpaid
    from loan_balances
    where status = 'active' and balance > 0 and start_date < public.biz_today()
  ),
  today_money as (
    select coalesce(sum(amount), 0) as collected,
           coalesce(sum(interest_portion + penalty_portion), 0) as income,
           count(*) as payments
    from payments where payment_date = public.biz_today()
  )
  select json_build_object(
    'principal_outstanding', o.principal_outstanding,
    'principal_released', b.principal_released,
    'principal_recovered', i.principal_recovered,
    'balance_outstanding', o.balance_outstanding,
    'gross_income', i.gross,
    'net_income', i.gross - l.principal_loss,
    'writeoff_principal_loss', l.principal_loss,
    'writeoff_balance_loss', l.balance_loss,
    'writeoff_count', l.confirmed_count,
    'total_collected', i.collected,
    'active_loans', b.active_loans,
    'completed_loans', b.completed_loans,
    'written_off_loans', b.written_off_loans,
    'overdue_loans', o.overdue_loans,
    'overdue_balance', o.overdue_balance,
    'total_arrears', o.total_arrears,
    'members_total', (select count(*) from members),
    'expected_today', t.expected,
    'paid_today', t.paid,
    'unpaid_today', t.unpaid,
    'collected_today', tm.collected,
    'income_today', tm.income,
    'payments_today', tm.payments,
    'flagged_pending', (select count(*) from write_offs where status = 'flagged')
  )
  from income i, losses l, book b, outstanding o, today t, today_money tm;
$$;

create or replace function public.income_series(
  p_from date,
  p_to date,
  p_granularity text default 'day'
)
returns table (bucket date, income numeric, collected numeric, payments integer)
language sql
stable
set search_path = public, pg_temp
as $$
  with buckets as (
    select generate_series(
             date_trunc(case when p_granularity = 'month' then 'month' else 'day' end, p_from::timestamp),
             date_trunc(case when p_granularity = 'month' then 'month' else 'day' end, p_to::timestamp),
             case when p_granularity = 'month' then interval '1 month' else interval '1 day' end
           )::date as bucket
  ),
  data as (
    select date_trunc(case when p_granularity = 'month' then 'month' else 'day' end,
                      payment_date::timestamp)::date as bucket,
           sum(interest_portion + penalty_portion) as income,
           sum(amount) as collected,
           count(*)::integer as payments
    from payments
    where payment_date between p_from and p_to
    group by 1
  )
  select b.bucket,
         coalesce(d.income, 0) as income,
         coalesce(d.collected, 0) as collected,
         coalesce(d.payments, 0) as payments
  from buckets b
  left join data d on d.bucket = b.bucket
  order by b.bucket;
$$;

create or replace function public.flag_write_off_candidates()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_threshold integer;
  v_count integer := 0;
begin
  select writeoff_threshold_days into v_threshold from settings where id = 1;

  with candidates as (
    select lb.loan_id, lb.days_past_maturity, lb.balance
    from loan_balances lb
    join loans l on l.id = lb.loan_id
    where l.status = 'active'
      and lb.balance > 0
      and lb.days_past_maturity >= v_threshold
  )
  insert into write_offs (loan_id, days_overdue_at_flag, balance_at_flag)
  select loan_id, days_past_maturity, balance from candidates
  on conflict (loan_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.confirm_write_off(p_loan_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_balance numeric(14, 2);
  v_principal numeric(14, 2);
begin
  select balance, principal_balance into v_balance, v_principal
  from loan_balances where loan_id = p_loan_id;

  if v_balance is null then
    raise exception 'Loan not found';
  end if;

  insert into write_offs (loan_id, balance_at_flag, days_overdue_at_flag)
  values (p_loan_id, v_balance, 0)
  on conflict (loan_id) do nothing;

  update write_offs
  set status = 'confirmed',
      resolved_at = now(),
      reason = coalesce(p_reason, reason),
      principal_loss = v_principal,
      balance_loss = v_balance
  where loan_id = p_loan_id;

  update loans
  set status = 'written_off', written_off_at = now()
  where id = p_loan_id;
end;
$$;

create or replace function public.dismiss_write_off(p_loan_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update write_offs
  set status = 'dismissed', resolved_at = now(), reason = coalesce(p_reason, reason)
  where loan_id = p_loan_id;
end;
$$;

create or replace function public.reopen_loan(p_loan_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update write_offs
  set status = 'dismissed', resolved_at = now(), principal_loss = null, balance_loss = null
  where loan_id = p_loan_id;

  update loans set status = 'active', written_off_at = null where id = p_loan_id;
  perform public.sync_loan_status(p_loan_id);
end;
$$;

create or replace function public.delete_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old payments;
begin
  select * into v_old from payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  insert into payment_audit (payment_id, loan_id, action, old_values, new_values)
  values (p_payment_id, v_old.loan_id, 'deleted',
          json_build_object('amount', v_old.amount, 'payment_date', v_old.payment_date,
                            'note', v_old.note,
                            'principal_portion', v_old.principal_portion,
                            'interest_portion', v_old.interest_portion,
                            'penalty_portion', v_old.penalty_portion),
          json_build_object('reason', p_reason));

  delete from payments where id = p_payment_id;

  perform public.replay_loan_payments(v_old.loan_id);
  perform public.sync_loan_status(v_old.loan_id);
end;
$$;

create or replace function public.run_maintenance()
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_penalties integer;
  v_flags integer;
begin
  v_penalties := public.apply_due_penalties();
  v_flags := public.flag_write_off_candidates();
  return json_build_object('penalties_applied', v_penalties, 'loans_flagged', v_flags);
end;
$$;
