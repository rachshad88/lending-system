-- ============================================================================
-- DRL Lending Cooperative — schema, security and money logic
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admin gate. Only user ids listed in admin_users can touch any data, so a
-- stray public signup cannot read the books even with the anon key.
-- ---------------------------------------------------------------------------
create table if not exists admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from admin_users a where a.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- "Today" in the shop's own timezone. Postgres runs in UTC on Supabase, so
-- current_date would roll over at 8am Manila time and put the first eight hours
-- of every collection day on the wrong date.
-- ---------------------------------------------------------------------------
create or replace function public.biz_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

-- ---------------------------------------------------------------------------
-- Configurable business rules (single row)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'DRL Lending Cooperative',
  interest_rate numeric(6, 3) not null default 20,       -- flat %, on principal
  penalty_rate numeric(6, 3) not null default 10,        -- one-time %, on remaining balance
  default_term_days integer not null default 40,
  writeoff_threshold_days integer not null default 90,   -- days past maturity before flagging
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_number text,
  address text,
  toda text,
  collateral text,
  spouse_name text,
  referred_by text,
  vehicle_number text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists members_created_at_idx on members (created_at desc);
create index if not exists members_name_idx on members (lower(name));

-- ---------------------------------------------------------------------------
-- Loans
-- ---------------------------------------------------------------------------
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete restrict,
  principal numeric(14, 2) not null check (principal > 0),
  interest_rate numeric(6, 3) not null,
  interest_amount numeric(14, 2) not null,
  term_days integer not null check (term_days > 0),
  start_date date not null,
  maturity_date date not null,
  penalty_rate numeric(6, 3) not null,
  penalty_applied boolean not null default false,
  penalty_amount numeric(14, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'written_off')),
  completed_at timestamptz,
  written_off_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists loans_member_idx on loans (member_id);
create index if not exists loans_status_idx on loans (status);
create index if not exists loans_start_date_idx on loans (start_date);
create index if not exists loans_maturity_idx on loans (maturity_date);
create index if not exists loans_completed_at_idx on loans (completed_at);

-- ---------------------------------------------------------------------------
-- Amortization schedule. One row per collection day, plus at most one
-- 'penalty' row if the loan matures unpaid.
-- ---------------------------------------------------------------------------
create table if not exists amortization_schedule (
  id bigserial primary key,
  loan_id uuid not null references loans (id) on delete cascade,
  seq integer not null,
  kind text not null default 'installment' check (kind in ('installment', 'penalty')),
  due_date date not null,
  principal_due numeric(14, 2) not null default 0,
  interest_due numeric(14, 2) not null default 0,
  penalty_due numeric(14, 2) not null default 0,
  total_due numeric(14, 2) not null,
  paid_principal numeric(14, 2) not null default 0,
  paid_interest numeric(14, 2) not null default 0,
  paid_penalty numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid')),
  unique (loan_id, seq)
);

create index if not exists sched_loan_idx on amortization_schedule (loan_id);
create index if not exists sched_due_date_idx on amortization_schedule (due_date);
create index if not exists sched_open_idx on amortization_schedule (loan_id, due_date, seq)
  where status <> 'paid';

-- ---------------------------------------------------------------------------
-- Payments + audit trail
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans (id) on delete cascade,
  member_id uuid not null references members (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  principal_portion numeric(14, 2) not null default 0,
  interest_portion numeric(14, 2) not null default 0,
  penalty_portion numeric(14, 2) not null default 0,
  payment_date date not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists payments_loan_idx on payments (loan_id);
create index if not exists payments_member_idx on payments (member_id);
create index if not exists payments_date_idx on payments (payment_date);
create index if not exists payments_loan_order_idx on payments (loan_id, payment_date, created_at);

-- payment_id is deliberately not a foreign key: the trail must outlive deletes.
create table if not exists payment_audit (
  id bigserial primary key,
  payment_id uuid not null,
  loan_id uuid not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid()
);

create index if not exists payment_audit_loan_idx on payment_audit (loan_id, changed_at desc);
create index if not exists payment_audit_payment_idx on payment_audit (payment_id);

-- ---------------------------------------------------------------------------
-- Write-offs (auto-flagged, manually confirmed)
-- ---------------------------------------------------------------------------
create table if not exists write_offs (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null unique references loans (id) on delete cascade,
  flagged_at timestamptz not null default now(),
  days_overdue_at_flag integer not null default 0,
  balance_at_flag numeric(14, 2) not null default 0,
  status text not null default 'flagged' check (status in ('flagged', 'confirmed', 'dismissed')),
  principal_loss numeric(14, 2),
  balance_loss numeric(14, 2),
  resolved_at timestamptz,
  reason text
);

create index if not exists write_offs_status_idx on write_offs (status);
create index if not exists write_offs_resolved_idx on write_offs (resolved_at);

-- ============================================================================
-- Derived view: one row per loan with balances and arrears
-- security_invoker keeps row level security on the base tables in force.
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
),
sched as (
  select loan_id,
         sum(total_due) as total_obligation,
         sum(case when due_date <= public.biz_today() then total_due else 0 end) as due_to_date,
         min(case when status <> 'paid' then due_date end) as next_due_date
  from amortization_schedule
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
       coalesce(s.total_obligation, 0) as total_obligation,
       coalesce(p.paid_total, 0) as paid_total,
       coalesce(p.paid_principal, 0) as paid_principal,
       coalesce(p.paid_interest, 0) as paid_interest,
       coalesce(p.paid_penalty, 0) as paid_penalty,
       coalesce(p.payments_count, 0) as payments_count,
       p.last_payment_date,
       s.next_due_date,
       coalesce(s.total_obligation, 0) - coalesce(p.paid_total, 0) as balance,
       l.principal - coalesce(p.paid_principal, 0) as principal_balance,
       -- the scheduled daily amount, deliberately excluding any late penalty so
       -- it stays the figure the borrower agreed to
       round((l.principal + l.interest_amount) / nullif(l.term_days, 0), 2) as daily_due,
       greatest(0, coalesce(s.due_to_date, 0) - coalesce(p.paid_total, 0)) as arrears,
       greatest(0, public.biz_today() - l.maturity_date) as days_past_maturity,
       (l.status = 'active'
        and public.biz_today() > l.maturity_date
        and coalesce(s.total_obligation, 0) - coalesce(p.paid_total, 0) > 0) as is_overdue,
       exists (
         select 1 from payments px
         where px.loan_id = l.id and px.payment_date = public.biz_today()
       ) as paid_today
from loans l
join members m on m.id = l.member_id
left join pay p on p.loan_id = l.id
left join sched s on s.loan_id = l.id;

-- ============================================================================
-- Money logic. Kept in the database so every write is one atomic transaction.
-- ============================================================================

-- Applies `p_amount` to the oldest unpaid schedule rows (FIFO) and returns how
-- much of it landed on principal, interest and penalty. Shared by new payments
-- and by the replay used when a payment is edited or deleted.
create or replace function public.allocate_to_schedule(p_loan_id uuid, p_amount numeric)
returns table (principal_part numeric, interest_part numeric, penalty_part numeric)
language plpgsql
as $$
declare
  r record;
  v_left numeric(14, 2) := p_amount;
  v_row_open numeric(14, 2);
  v_applied numeric(14, 2);
  v_open_p numeric(14, 2);
  v_open_i numeric(14, 2);
  v_open_pen numeric(14, 2);
  v_ap numeric(14, 2);
  v_ai numeric(14, 2);
  v_apen numeric(14, 2);
begin
  principal_part := 0;
  interest_part := 0;
  penalty_part := 0;

  for r in
    select * from amortization_schedule
    where loan_id = p_loan_id and paid_amount < total_due
    order by due_date, seq
    for update
  loop
    exit when v_left <= 0;

    v_row_open := r.total_due - r.paid_amount;
    v_applied := least(v_left, v_row_open);
    v_open_p := r.principal_due - r.paid_principal;
    v_open_i := r.interest_due - r.paid_interest;
    v_open_pen := r.penalty_due - r.paid_penalty;

    if v_applied >= v_row_open then
      v_ap := v_open_p;
      v_ai := v_open_i;
      v_apen := v_open_pen;
    else
      -- split a partial payment across the row's own components
      v_ai := round(v_applied * v_open_i / v_row_open, 2);
      v_apen := round(v_applied * v_open_pen / v_row_open, 2);
      v_ap := v_applied - v_ai - v_apen;
    end if;

    update amortization_schedule
    set paid_principal = paid_principal + v_ap,
        paid_interest = paid_interest + v_ai,
        paid_penalty = paid_penalty + v_apen,
        paid_amount = paid_amount + v_applied,
        status = case when paid_amount + v_applied >= total_due then 'paid' else 'partial' end
    where id = r.id;

    principal_part := principal_part + v_ap;
    interest_part := interest_part + v_ai;
    penalty_part := penalty_part + v_apen;
    v_left := v_left - v_applied;
  end loop;

  return next;
end;
$$;

-- Rebuilds a loan's schedule allocation from its payment history. Used after an
-- edit or delete so the books never drift.
create or replace function public.replay_loan_payments(p_loan_id uuid)
returns void
language plpgsql
as $$
declare
  pmt record;
  alloc record;
begin
  update amortization_schedule
  set paid_principal = 0, paid_interest = 0, paid_penalty = 0,
      paid_amount = 0, status = 'pending'
  where loan_id = p_loan_id;

  for pmt in
    select id, amount from payments
    where loan_id = p_loan_id
    order by payment_date, created_at
  loop
    select * into alloc from public.allocate_to_schedule(p_loan_id, pmt.amount);
    update payments
    set principal_portion = alloc.principal_part,
        interest_portion = alloc.interest_part,
        penalty_portion = alloc.penalty_part
    where id = pmt.id;
  end loop;
end;
$$;

-- Marks a loan completed or back to active depending on its balance.
create or replace function public.sync_loan_status(p_loan_id uuid)
returns void
language plpgsql
as $$
declare
  v_balance numeric(14, 2);
  v_status text;
begin
  select status into v_status from loans where id = p_loan_id;
  if v_status = 'written_off' then
    return;
  end if;

  select coalesce(sum(total_due), 0) - coalesce((
           select sum(amount) from payments where loan_id = p_loan_id
         ), 0)
  into v_balance
  from amortization_schedule where loan_id = p_loan_id;

  if v_balance <= 0 then
    update loans set status = 'completed',
                     completed_at = coalesce(completed_at, now())
    where id = p_loan_id and status <> 'completed';
  else
    update loans set status = 'active', completed_at = null
    where id = p_loan_id and status <> 'active';
  end if;
end;
$$;

-- Creates a loan and its full daily schedule in one transaction.
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
as $$
declare
  cfg settings;
  v_term integer;
  v_rate numeric(6, 3);
  v_start date;
  v_interest numeric(14, 2);
  v_day_principal numeric(14, 2);
  v_day_interest numeric(14, 2);
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

  -- truncate the per-day shares, then let the final day absorb the remainder so
  -- the schedule sums to exactly principal + interest
  v_day_principal := trunc(p_principal / v_term, 2);
  v_day_interest := trunc(v_interest / v_term, 2);

  insert into amortization_schedule (loan_id, seq, due_date, principal_due, interest_due, total_due)
  select v_loan_id, d.seq, v_start + d.seq, d.pd, d.ii, d.pd + d.ii
  from (
    select i as seq,
           case when i < v_term then v_day_principal
                else round(p_principal - v_day_principal * (v_term - 1), 2) end as pd,
           case when i < v_term then v_day_interest
                else round(v_interest - v_day_interest * (v_term - 1), 2) end as ii
    from generate_series(1, v_term) i
  ) d;

  return v_loan_id;
end;
$$;

-- Records a collection. Partial amounts are fine: the shortfall simply stays on
-- the schedule, and an overpayment eats into future days.
create or replace function public.record_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_payment_date date default null,
  p_note text default null
)
returns json
language plpgsql
as $$
declare
  v_loan loans;
  v_member uuid;
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

  select coalesce(sum(total_due), 0) - coalesce((
           select sum(amount) from payments where loan_id = p_loan_id
         ), 0)
  into v_balance
  from amortization_schedule where loan_id = p_loan_id;

  if v_balance <= 0 then
    raise exception 'This loan is already fully paid';
  end if;
  if p_amount > v_balance then
    raise exception 'Amount exceeds the remaining balance. Full payoff is %', to_char(v_balance, 'FM999999990.00');
  end if;

  select * into alloc from public.allocate_to_schedule(p_loan_id, p_amount);

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

-- Edits a payment, then replays the loan so every split stays consistent.
create or replace function public.update_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_payment_date date default null,
  p_note text default null
)
returns json
language plpgsql
as $$
declare
  v_old payments;
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

  select coalesce(sum(total_due), 0) into v_obligation
  from amortization_schedule where loan_id = v_old.loan_id;

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

create or replace function public.delete_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
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

-- One-time penalty: adds penalty_rate % of the balance still owed once a loan
-- passes its maturity date. Guarded by penalty_applied so it can never stack.
create or replace function public.apply_due_penalties()
returns integer
language plpgsql
as $$
declare
  r record;
  v_penalty numeric(14, 2);
  v_count integer := 0;
begin
  for r in
    select lb.loan_id, lb.balance, l.penalty_rate, l.term_days, l.maturity_date
    from loan_balances lb
    join loans l on l.id = lb.loan_id
    where l.status = 'active'
      and l.penalty_applied = false
      and public.biz_today() > l.maturity_date
      and lb.balance > 0
  loop
    v_penalty := round(r.balance * r.penalty_rate / 100.0, 2);
    continue when v_penalty <= 0;

    insert into amortization_schedule (loan_id, seq, kind, due_date, penalty_due, total_due)
    values (r.loan_id, r.term_days + 1, 'penalty', r.maturity_date, v_penalty, v_penalty);

    update loans
    set penalty_applied = true, penalty_amount = v_penalty
    where id = r.loan_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Flags loans that are far enough past maturity to be worth writing off. The
-- admin still has to confirm before anything hits net income.
create or replace function public.flag_write_off_candidates()
returns integer
language plpgsql
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

-- Called once when the dashboard loads: keeps penalties and flags current
-- without needing a scheduler.
create or replace function public.run_maintenance()
returns json
language plpgsql
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

create or replace function public.confirm_write_off(p_loan_id uuid, p_reason text default null)
returns void
language plpgsql
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
as $$
begin
  update write_offs
  set status = 'dismissed', resolved_at = now(), reason = coalesce(p_reason, reason)
  where loan_id = p_loan_id;
end;
$$;

-- Puts a written-off loan back in play (e.g. the borrower resurfaced).
create or replace function public.reopen_loan(p_loan_id uuid)
returns void
language plpgsql
as $$
begin
  update write_offs
  set status = 'dismissed', resolved_at = now(), principal_loss = null, balance_loss = null
  where loan_id = p_loan_id;

  update loans set status = 'active', written_off_at = null where id = p_loan_id;
  perform public.sync_loan_status(p_loan_id);
end;
$$;

-- ============================================================================
-- Reporting. Aggregated in SQL so the client never downloads raw ledgers.
-- ============================================================================

-- All-time headline figures plus today's collection standing.
create or replace function public.dashboard_kpis()
returns json
language sql
stable
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

-- Everything that moved inside a date range.
create or replace function public.period_stats(p_from date, p_to date)
returns json
language sql
stable
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
    select coalesce(sum(total_due), 0) as scheduled_due
    from amortization_schedule
    where due_date between p_from and p_to
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

-- Income/collection series for the chart. Gaps are filled so the line is continuous.
create or replace function public.income_series(
  p_from date,
  p_to date,
  p_granularity text default 'day'
)
returns table (bucket date, income numeric, collected numeric, payments integer)
language sql
stable
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

-- ============================================================================
-- Row level security: nothing is readable or writable unless you are the admin
-- ============================================================================
alter table admin_users enable row level security;
alter table settings enable row level security;
alter table members enable row level security;
alter table loans enable row level security;
alter table amortization_schedule enable row level security;
alter table payments enable row level security;
alter table payment_audit enable row level security;
alter table write_offs enable row level security;

drop policy if exists admin_users_self_read on admin_users;
create policy admin_users_self_read on admin_users
  for select using (user_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array['settings', 'members', 'loans', 'amortization_schedule',
                           'payments', 'payment_audit', 'write_offs']
  loop
    execute format('drop policy if exists %I_admin_all on %I', t, t);
    execute format(
      'create policy %I_admin_all on %I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t, t);
  end loop;
end;
$$;

-- Table grants: the anon key gets nothing at all.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on members, loans, amortization_schedule,
  payments, payment_audit, write_offs, settings to authenticated;
grant select on admin_users, loan_balances to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Function grants: only signed-in admins may call the money logic.
revoke all on function public.create_loan(uuid, numeric, integer, date, numeric, text) from public, anon;
revoke all on function public.record_payment(uuid, numeric, date, text) from public, anon;
revoke all on function public.update_payment(uuid, numeric, date, text) from public, anon;
revoke all on function public.delete_payment(uuid, text) from public, anon;
revoke all on function public.apply_due_penalties() from public, anon;
revoke all on function public.flag_write_off_candidates() from public, anon;
revoke all on function public.run_maintenance() from public, anon;
revoke all on function public.confirm_write_off(uuid, text) from public, anon;
revoke all on function public.dismiss_write_off(uuid, text) from public, anon;
revoke all on function public.reopen_loan(uuid) from public, anon;
revoke all on function public.dashboard_kpis() from public, anon;
revoke all on function public.period_stats(date, date) from public, anon;
revoke all on function public.income_series(date, date, text) from public, anon;
revoke all on function public.allocate_to_schedule(uuid, numeric) from public, anon;
revoke all on function public.replay_loan_payments(uuid) from public, anon;
revoke all on function public.sync_loan_status(uuid) from public, anon;

grant execute on function public.create_loan(uuid, numeric, integer, date, numeric, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, date, text) to authenticated;
grant execute on function public.update_payment(uuid, numeric, date, text) to authenticated;
grant execute on function public.delete_payment(uuid, text) to authenticated;
grant execute on function public.run_maintenance() to authenticated;
grant execute on function public.confirm_write_off(uuid, text) to authenticated;
grant execute on function public.dismiss_write_off(uuid, text) to authenticated;
grant execute on function public.reopen_loan(uuid) to authenticated;
grant execute on function public.dashboard_kpis() to authenticated;
grant execute on function public.period_stats(date, date) to authenticated;
grant execute on function public.income_series(date, date, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.biz_today() to authenticated, anon;

-- ============================================================================
-- Last step, run it yourself after creating your login in Authentication -> Users:
--
--   insert into admin_users (user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
--
-- Also turn OFF "Allow new users to sign up" in Authentication -> Providers.
-- ============================================================================
