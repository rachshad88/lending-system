-- ============================================================================
-- 0011 — Fix two defects in amortization_series() (0010)
--
-- 1. `loans_in_range` had no status filter, so a loan that finished early
--    (paid off, or written off) kept "expecting" its daily figure for every
--    remaining day up to its original nominal maturity_date, even though
--    nothing more would ever be collected on it — inflating Expected and
--    deflating the reported collection rate. Restricted to status = 'active',
--    matching the function's own header comment ("each active loan's daily
--    figure") and every other portfolio aggregate in this schema.
--
-- 2. The per-day figure was a flat `round((principal+interest)/term_days, 2)`
--    applied to every day, so a loan's daily figures summed over its term
--    didn't reconcile to its actual total payable (e.g. a 9-day term:
--    600/9 rounds to 66.67, and 66.67*9 = 600.03). create_loan() (0001)
--    already established the fix for exactly this: truncate the per-day
--    share and let the loan's final due date (= maturity_date, since
--    maturity_date is always start_date + term_days) absorb the remainder.
--    Applied the same convention here.
-- ============================================================================

create or replace function public.amortization_series(
  p_from date,
  p_to date,
  p_granularity text default 'day'
)
returns table (bucket date, expected numeric, collected numeric, income numeric, payments integer)
language sql
stable
set search_path = public, pg_temp
as $$
  with loans_in_range as (
    select principal, interest_amount, term_days, start_date, maturity_date
    from loans
    where status = 'active' and start_date < p_to and maturity_date >= p_from and term_days > 0
  ),
  -- One row per loan per collection day it covers within the window, rather
  -- than a full days-times-all-loans cross join.
  daily_expected as (
    select gs::date as day,
           case when gs::date = l.maturity_date
                -- final due date absorbs whatever truncation left behind
                then round((l.principal + l.interest_amount)
                           - trunc((l.principal + l.interest_amount) / l.term_days, 2) * (l.term_days - 1), 2)
                else trunc((l.principal + l.interest_amount) / l.term_days, 2)
           end as amt
    from loans_in_range l,
         lateral generate_series(
           greatest(l.start_date + 1, p_from),
           least(l.maturity_date, p_to),
           interval '1 day'
         ) as gs
  ),
  expected_by_day as (
    select day, sum(amt) as expected from daily_expected group by day
  ),
  actual_by_day as (
    select payment_date as day,
           sum(amount) as collected,
           sum(interest_portion + penalty_portion) as income,
           count(*) as payments
    from payments
    where payment_date between p_from and p_to
    group by payment_date
  ),
  days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
  merged as (
    select d.day,
           coalesce(e.expected, 0) as expected,
           coalesce(a.collected, 0) as collected,
           coalesce(a.income, 0) as income,
           coalesce(a.payments, 0)::integer as payments
    from days d
    left join expected_by_day e on e.day = d.day
    left join actual_by_day a on a.day = d.day
  )
  select
    case p_granularity
      when 'month' then date_trunc('month', day)::date
      when 'week' then date_trunc('week', day)::date
      else day
    end as bucket,
    sum(expected)::numeric(14, 2),
    sum(collected)::numeric(14, 2),
    sum(income)::numeric(14, 2),
    sum(payments)::integer
  from merged
  group by 1
  order by 1;
$$;

revoke all on function public.amortization_series(date, date, text) from public, anon;
grant execute on function public.amortization_series(date, date, text) to authenticated;
