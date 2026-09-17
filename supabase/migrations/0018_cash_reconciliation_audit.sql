-- ============================================================================
-- 0018 — audit trail for cash reconciliation corrections
--
-- close_cash_day() upserts on (business_date), so re-closing a day to fix a
-- miscount silently overwrote the previous counted_amount/note/closed_at with
-- no trace anywhere — the one financially-significant table in the app with
-- no history, unlike loans, payments and members (loan_audit, payment_audit,
-- member_audit). cash_reconciliation_audit closes that gap the same way:
-- one row per close or correction, with old and new values.
--
-- Also feeds the app-wide activity log (list_recent_audit): a 'cash' source
-- alongside loan/payment/member/login/logout.
-- ============================================================================

create table if not exists cash_reconciliation_audit (
  id bigserial primary key,
  business_date date not null,
  action text not null check (action in ('closed', 'corrected')),
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid()
);

create index if not exists cash_reconciliation_audit_date_idx
  on cash_reconciliation_audit (business_date, changed_at desc);

alter table cash_reconciliation_audit enable row level security;

-- close_cash_day() is SECURITY INVOKER (matches the original), so the row it
-- writes here goes through as the calling admin, not a definer's elevated
-- privileges — same reason loan_audit/payment_audit grant authenticated
-- write access rather than relying on RLS select alone.
drop policy if exists cash_reconciliation_audit_admin_read on cash_reconciliation_audit;
create policy cash_reconciliation_audit_admin_all on cash_reconciliation_audit
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on cash_reconciliation_audit from anon;
grant select, insert on cash_reconciliation_audit to authenticated;
-- the bigserial id column needs its own grant, same as every other new
-- sequence in this codebase's migrations (0001, 0003).
grant usage, select on sequence cash_reconciliation_audit_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- close_cash_day(): unchanged behavior, now logs before-and-after values.
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
  v_old cash_reconciliations;
  v_row cash_reconciliations;
begin
  if p_business_date > public.biz_today() then
    raise exception 'Cannot close a day that has not happened yet';
  end if;
  if p_counted_amount is null or p_counted_amount < 0 then
    raise exception 'Enter the amount counted';
  end if;

  select * into v_old from cash_reconciliations where business_date = p_business_date;

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

  insert into cash_reconciliation_audit (business_date, action, old_values, new_values)
  values (
    p_business_date,
    case when v_old.business_date is null then 'closed' else 'corrected' end,
    case when v_old.business_date is null then null
         else jsonb_build_object('expected_amount', v_old.expected_amount,
                                  'counted_amount', v_old.counted_amount,
                                  'note', v_old.note,
                                  'closed_at', v_old.closed_at)
    end,
    jsonb_build_object('expected_amount', v_row.expected_amount,
                        'counted_amount', v_row.counted_amount,
                        'note', v_row.note,
                        'closed_at', v_row.closed_at)
  );

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

-- ---------------------------------------------------------------------------
-- One more source in the activity feed.
-- ---------------------------------------------------------------------------
create or replace function public.list_recent_audit(p_limit integer default 200)
returns table (
  id bigint,
  source text,
  action text,
  loan_id uuid,
  member_id uuid,
  label text,
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select id, source, action, loan_id, member_id, label, old_values, new_values, changed_at
  from (
    select la.id, 'loan'::text as source, la.action, la.loan_id,
           coalesce(l.member_id, nullif(la.old_values ->> 'member_id', '')::uuid,
                     nullif(la.new_values ->> 'member_id', '')::uuid) as member_id,
           coalesce(m.name, la.old_values ->> 'member_name', la.new_values ->> 'member_name') as label,
           la.old_values, la.new_values, la.changed_at
    from loan_audit la
    left join loans l on l.id = la.loan_id
    left join members m on m.id = l.member_id

    union all

    select pa.id, 'payment'::text as source, pa.action, pa.loan_id, l.member_id,
           coalesce(m.name, 'Deleted loan') as label,
           pa.old_values, pa.new_values, pa.changed_at
    from payment_audit pa
    left join loans l on l.id = pa.loan_id
    left join members m on m.id = l.member_id

    union all

    select ma.id, 'member'::text as source, ma.action, null::uuid as loan_id, ma.member_id,
           coalesce(ma.new_values ->> 'name', ma.old_values ->> 'name') as label,
           ma.old_values, ma.new_values, ma.changed_at
    from member_audit ma

    union all

    select att.id, 'login'::text as source, att.outcome as action, null::uuid, null::uuid,
           att.email as label,
           null::jsonb as old_values,
           jsonb_build_object('ip', att.ip, 'user_agent', att.user_agent) as new_values,
           att.attempted_at as changed_at
    from login_attempts att

    union all

    select lo.id, 'logout'::text as source, 'signed_out'::text as action, null::uuid, null::uuid,
           lo.email as label,
           null::jsonb, null::jsonb,
           lo.logged_out_at as changed_at
    from logout_events lo

    union all

    select ca.id, 'cash'::text as source, ca.action, null::uuid, null::uuid,
           to_char(ca.business_date, 'FMMonth FMDD, YYYY') as label,
           ca.old_values, ca.new_values, ca.changed_at
    from cash_reconciliation_audit ca
  ) combined
  order by changed_at desc
  limit p_limit;
$$;

revoke all on function public.list_recent_audit(integer) from public, anon;
grant execute on function public.list_recent_audit(integer) to authenticated;
