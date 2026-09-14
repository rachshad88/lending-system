-- ============================================================================
-- 0007 — End-of-day cash reconciliation
--
-- One person handles every collection here, in person, all day, with nothing
-- else checking the drawer against the books. This is that check: at close of
-- day, the admin counts the cash on hand and the system compares it against
-- what payments actually say came in that day.
--
-- `expected_amount` is a snapshot taken at the moment of closing, not a live
-- figure. A payment corrected days later (payment_audit already covers that)
-- must not silently rewrite what a past day's count was reconciled against —
-- that would defeat the point of keeping a reconciliation history at all.
-- ============================================================================

create table if not exists cash_reconciliations (
  business_date date primary key,
  expected_amount numeric(14, 2) not null,
  counted_amount numeric(14, 2) not null check (counted_amount >= 0),
  difference numeric(14, 2) generated always as (counted_amount - expected_amount) stored,
  note text,
  closed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Closes (or re-closes, if the count needs correcting) a business day.
-- `expected_amount` is recomputed from `payments` on every call, so fixing a
-- payment and re-closing the same day picks up the correction.
-- ---------------------------------------------------------------------------
create or replace function public.close_cash_day(
  p_business_date date,
  p_counted_amount numeric,
  p_note text default null
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_expected numeric(14, 2);
  v_row cash_reconciliations;
begin
  if p_business_date > public.biz_today() then
    raise exception 'Cannot close a day that has not happened yet';
  end if;
  if p_counted_amount is null or p_counted_amount < 0 then
    raise exception 'Enter the amount counted';
  end if;

  select coalesce(sum(amount), 0) into v_expected
  from payments
  where payment_date = p_business_date;

  insert into cash_reconciliations (business_date, expected_amount, counted_amount, note, closed_at)
  values (p_business_date, v_expected, p_counted_amount, p_note, now())
  on conflict (business_date) do update
    set expected_amount = excluded.expected_amount,
        counted_amount  = excluded.counted_amount,
        note            = excluded.note,
        closed_at       = excluded.closed_at
  returning * into v_row;

  return json_build_object(
    'business_date', v_row.business_date,
    'expected_amount', v_row.expected_amount,
    'counted_amount', v_row.counted_amount,
    'difference', v_row.difference,
    'note', v_row.note,
    'closed_at', v_row.closed_at
  );
end;
$$;

-- ============================================================================
-- Row level security and grants, matching every other table and function
-- ============================================================================
alter table cash_reconciliations enable row level security;

drop policy if exists cash_reconciliations_admin_all on cash_reconciliations;
create policy cash_reconciliations_admin_all on cash_reconciliations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on cash_reconciliations from anon;
grant select, insert, update, delete on cash_reconciliations to authenticated;

revoke all on function public.close_cash_day(date, numeric, text) from public, anon;
grant execute on function public.close_cash_day(date, numeric, text) to authenticated;
