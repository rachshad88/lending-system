-- ============================================================================
-- 0010 — Amortization report: scheduled vs. collected, by day/week/month
--
-- The book runs on a live balance, not a fixed day-by-day schedule (see the
-- README) — but "what was due this period across the whole portfolio" is
-- still a real, useful number: for every day, sum each active loan's daily
-- figure (principal + interest, spread over its term), then bucket those
-- days into the requested granularity alongside what was actually collected.
--
-- `loans_term_window_idx` covers the `start_date < p_to and maturity_date
-- >= p_from` filter with an index-only scan for the columns the per-day
-- expansion needs, so the report stays index-driven at the current scale.
-- ============================================================================

create index if not exists loans_term_window_idx
  on loans (start_date, maturity_date)
  include (principal, interest_amount, term_days);

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
    where start_date < p_to and maturity_date >= p_from and term_days > 0
  ),
  -- One row per loan per collection day it covers within the window, rather
  -- than a full days-times-all-loans cross join.
  daily_expected as (
    select gs::date as day,
           round((l.principal + l.interest_amount) / l.term_days, 2) as amt
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
