-- ============================================================================
-- 0004 — Risk signals
--
-- The book was only telling you a loan had gone bad once it was 90 days past
-- maturity: about 130 days after the cash left the drawer, or three full
-- lending cycles. These are the pieces that let the same data warn earlier.
--
--   settings.gone_quiet_days           how many silent days counts as a worry
--   settings.max_exposure_per_member   ceiling on what one member may owe
--   member_reliability()               a member's track record across loans
--   portfolio_at_risk()                PAR-7 / PAR-30, the standard measure
--
-- Nothing here changes a balance. They are all read-only signals.
-- ============================================================================

alter table settings
  add column if not exists gone_quiet_days integer not null default 3
    check (gone_quiet_days > 0);

-- null means no ceiling
alter table settings
  add column if not exists max_exposure_per_member numeric(14, 2)
    check (max_exposure_per_member is null or max_exposure_per_member > 0);

-- ---------------------------------------------------------------------------
-- A member's track record, for the moment they ask to borrow again.
--
-- `longest_gap_days` is the worst silence anywhere in their history: between
-- two payments, waiting for the first one, or running right now on a live loan.
-- It is the number that separates a slow payer from one who disappears.
-- ---------------------------------------------------------------------------
create or replace function public.member_reliability(p_member_id uuid)
returns table (
  loans_total integer,
  loans_completed integer,
  loans_written_off integer,
  loans_active integer,
  avg_days_to_complete numeric,
  avg_term_days numeric,
  completed_within_term integer,
  penalties_incurred integer,
  longest_gap_days integer,
  largest_completed_principal numeric,
  current_exposure numeric,
  first_loan_date date
)
language sql
stable
set search_path = public, pg_temp
as $$
  with my_loans as (
    select id, principal, term_days, start_date, status, completed_at, penalty_applied
    from loans
    where member_id = p_member_id
  ),
  pay as (
    select loan_id,
           payment_date,
           lag(payment_date) over (partition by loan_id order by payment_date) as prev_date
    from payments
    where loan_id in (select id from my_loans)
  ),
  loan_gap as (
    select greatest(
             coalesce((select max(p.payment_date - p.prev_date)
                       from pay p where p.loan_id = l.id and p.prev_date is not null), 0),
             coalesce((select min(p.payment_date) from pay p where p.loan_id = l.id)
                      - l.start_date, 0),
             case when l.status = 'active'
                  then public.biz_today()
                       - coalesce((select max(p.payment_date) from pay p where p.loan_id = l.id),
                                  l.start_date)
                  else 0 end
           ) as gap_days
    from my_loans l
  )
  select
    count(*)::integer,
    count(*) filter (where status = 'completed')::integer,
    count(*) filter (where status = 'written_off')::integer,
    count(*) filter (where status = 'active')::integer,
    round(avg(case when status = 'completed' and completed_at is not null
                   then completed_at::date - start_date end), 1),
    round(avg(term_days), 1),
    count(*) filter (where status = 'completed' and completed_at is not null
                     and completed_at::date - start_date <= term_days)::integer,
    count(*) filter (where penalty_applied)::integer,
    coalesce((select max(gap_days) from loan_gap), 0)::integer,
    coalesce(max(principal) filter (where status = 'completed'), 0),
    coalesce((select sum(lb.balance) from loan_balances lb
              where lb.member_id = p_member_id and lb.status = 'active'), 0),
    min(start_date)
  from my_loans;
$$;

-- ---------------------------------------------------------------------------
-- Portfolio at Risk. The share of money on the street that has gone quiet for
-- N days or more, by value — the figure a bank or investor will ask for.
--
-- "Quiet" is counted from the last payment, or from release if none has ever
-- landed, which suits daily collection better than days-past-maturity: a
-- 40-day loan that stops paying on day 10 is in trouble long before maturity.
-- ---------------------------------------------------------------------------
create or replace function public.portfolio_at_risk()
returns table (
  total_outstanding numeric,
  loans_outstanding integer,
  par7_amount numeric,
  par7_loans integer,
  par30_amount numeric,
  par30_loans integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  with live as (
    select lb.balance,
           public.biz_today() - coalesce(lb.last_payment_date, lb.start_date) as quiet_days
    from loan_balances lb
    where lb.status = 'active' and lb.balance > 0
  )
  select
    coalesce(sum(balance), 0),
    count(*)::integer,
    coalesce(sum(balance) filter (where quiet_days >= 7), 0),
    count(*) filter (where quiet_days >= 7)::integer,
    coalesce(sum(balance) filter (where quiet_days >= 30), 0),
    count(*) filter (where quiet_days >= 30)::integer
  from live;
$$;

-- ============================================================================
-- Grants, matching every other function
-- ============================================================================
revoke all on function public.member_reliability(uuid) from public, anon;
revoke all on function public.portfolio_at_risk() from public, anon;

grant execute on function public.member_reliability(uuid) to authenticated;
grant execute on function public.portfolio_at_risk() to authenticated;
