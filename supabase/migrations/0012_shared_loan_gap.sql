-- ============================================================================
-- 0012 — One shared, window-function loan-gap calculation
--
-- member_reliability() (0004) and member_reliability_bulk() (0009) each had
-- their own copy of the "longest silence" formula (worst inter-payment gap,
-- wait for the first payment, or live silence on an open loan). Two problems:
--
-- 1. Duplication risk — the next change to how silence is judged has to be
--    made in two places, and it's easy to update one and miss the other,
--    which would make the Members-list badge and the member-detail grade
--    silently disagree for the same member.
-- 2. The bulk version's copy used three correlated subqueries per loan,
--    each re-scanning the shared `pay` CTE — fine for member_reliability's
--    one member's handful of loans, but member_reliability_bulk runs that
--    per-loan re-scan against a `pay` set sized to the whole batch (up to
--    20 members' full payment history on the Members list).
--
-- Both are now one function, computed with window aggregates in a single
-- pass over `payments` instead of N correlated re-scans per loan.
-- ============================================================================

create or replace function public.loan_payment_gap_days(p_loan_ids uuid[])
returns table (loan_id uuid, gap_days integer)
language sql
stable
set search_path = public, pg_temp
as $$
  with pay as (
    select p.loan_id,
           p.payment_date,
           lag(p.payment_date) over (partition by p.loan_id order by p.payment_date) as prev_date
    from payments p
    where p.loan_id = any(p_loan_ids)
  ),
  agg as (
    select loan_id,
           max(payment_date - prev_date) filter (where prev_date is not null) as max_inner_gap,
           min(payment_date) as first_payment,
           max(payment_date) as last_payment
    from pay
    group by loan_id
  )
  select l.id,
         greatest(
           coalesce(a.max_inner_gap, 0),
           coalesce(a.first_payment - l.start_date, 0),
           case when l.status = 'active'
                then public.biz_today() - coalesce(a.last_payment, l.start_date)
                else 0 end
         )::integer
  from unnest(p_loan_ids) as ids(id)
  join loans l on l.id = ids.id
  left join agg a on a.loan_id = l.id;
$$;

revoke all on function public.loan_payment_gap_days(uuid[]) from public, anon;
grant execute on function public.loan_payment_gap_days(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- member_reliability(): identical output, gap now sourced from the shared
-- function instead of its own correlated-subquery copy.
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
    coalesce(
      (select max(g.gap_days) from public.loan_payment_gap_days(array(select id from my_loans)) g),
      0
    )::integer,
    coalesce(max(principal) filter (where status = 'completed'), 0),
    coalesce((select sum(lb.balance) from loan_balances lb
              where lb.member_id = p_member_id and lb.status = 'active'), 0),
    min(start_date)
  from my_loans;
$$;

-- ---------------------------------------------------------------------------
-- member_reliability_bulk(): same shared gap function, one call over the
-- whole batch's loan ids instead of a per-member loop.
-- ---------------------------------------------------------------------------
create or replace function public.member_reliability_bulk(p_member_ids uuid[])
returns table (
  member_id uuid,
  loans_completed integer,
  loans_written_off integer,
  avg_days_to_complete numeric,
  avg_term_days numeric,
  penalties_incurred integer,
  longest_gap_days integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  with my_loans as (
    select id, member_id, term_days, start_date, status, completed_at, penalty_applied
    from loans
    where member_id = any(p_member_ids)
  ),
  gaps as (
    select * from public.loan_payment_gap_days(array(select id from my_loans))
  )
  select
    l.member_id,
    count(*) filter (where l.status = 'completed')::integer,
    count(*) filter (where l.status = 'written_off')::integer,
    round(avg(case when l.status = 'completed' and l.completed_at is not null
                   then l.completed_at::date - l.start_date end), 1),
    round(avg(l.term_days), 1),
    count(*) filter (where l.penalty_applied)::integer,
    coalesce(max(g.gap_days), 0)::integer
  from my_loans l
  left join gaps g on g.loan_id = l.id
  group by l.member_id;
$$;
