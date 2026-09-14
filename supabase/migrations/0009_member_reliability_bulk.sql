-- ============================================================================
-- 0009 — Reliability grade for many members at once
--
-- member_reliability() (0004) takes one member at a time, which is right for
-- the member detail page but would mean one round trip per row to badge a
-- page of the Members list. This is the same computation, vectorized over an
-- array of ids in a single query, carrying exactly the columns
-- reliabilityGrade() (src/lib/risk.js) reads — so the list badge and the
-- member detail page grade the same member the same way, from one function.
--
-- A member with no loans yet gets no row back (nothing to gap or average).
-- The client treats a missing id as "new borrower", the same fallback
-- member_reliability() itself lands on when loans_completed is zero.
-- ============================================================================

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
  pay as (
    select loan_id,
           payment_date,
           lag(payment_date) over (partition by loan_id order by payment_date) as prev_date
    from payments
    where loan_id in (select id from my_loans)
  ),
  loan_gap as (
    select l.id,
           l.member_id,
           greatest(
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
    l.member_id,
    count(*) filter (where l.status = 'completed')::integer,
    count(*) filter (where l.status = 'written_off')::integer,
    round(avg(case when l.status = 'completed' and l.completed_at is not null
                   then l.completed_at::date - l.start_date end), 1),
    round(avg(l.term_days), 1),
    count(*) filter (where l.penalty_applied)::integer,
    coalesce(max(lg.gap_days), 0)::integer
  from my_loans l
  join loan_gap lg on lg.id = l.id
  group by l.member_id;
$$;

revoke all on function public.member_reliability_bulk(uuid[]) from public, anon;
grant execute on function public.member_reliability_bulk(uuid[]) to authenticated;
