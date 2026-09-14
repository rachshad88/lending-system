-- ============================================================================
-- 0008 — Days that took payments but were never cash-closed
--
-- Drives the dashboard warning. Today is excluded: the day is not over, and the
-- dashboard already offers "Close today's cash". Days with no payments at all
-- (a day off) never appear, because there is nothing to reconcile.
--
-- SECURITY INVOKER on purpose: row level security on payments and
-- cash_reconciliations already limits both tables to admins, so a non-admin
-- caller simply gets an empty list. payments_date_idx (0001) and the
-- cash_reconciliations primary key keep this to index lookups.
-- ============================================================================

create or replace function public.unclosed_cash_days()
returns table (business_date date, expected_amount numeric, payments_count integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.payment_date,
         sum(p.amount)::numeric(14, 2),
         count(*)::integer
  from payments p
  where p.payment_date < public.biz_today()
    and not exists (
      select 1 from cash_reconciliations c where c.business_date = p.payment_date
    )
  group by p.payment_date
  order by p.payment_date desc;
$$;

revoke all on function public.unclosed_cash_days() from public, anon;
grant execute on function public.unclosed_cash_days() to authenticated;
