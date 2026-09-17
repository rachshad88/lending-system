-- ============================================================================
-- 0016 — track list_recent_audit() in migrations
--
-- This function already existed on the live database (added straight through
-- the SQL Editor, the same kind of untracked change 0013 backfilled a grant
-- for). Rebuilding the database from this migrations folder alone would have
-- left it missing. No logic change: body and grants match what's deployed.
--
-- Merges loan_audit and payment_audit into one reverse-chronological feed
-- with the member's name attached, so an app-wide activity page doesn't have
-- to open every loan individually to see what changed.
-- ============================================================================

create or replace function public.list_recent_audit(p_limit integer default 100)
returns table (
  id bigint,
  source text,
  loan_id uuid,
  member_id uuid,
  member_name text,
  action text,
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select id, source, loan_id, member_id, member_name, action, old_values, new_values, changed_at
  from (
    select la.id, 'loan'::text as source, la.loan_id, l.member_id, m.name as member_name,
           la.action, la.old_values, la.new_values, la.changed_at
    from loan_audit la
    join loans l on l.id = la.loan_id
    join members m on m.id = l.member_id
    union all
    select pa.id, 'payment'::text as source, pa.loan_id, l.member_id, m.name as member_name,
           pa.action, pa.old_values, pa.new_values, pa.changed_at
    from payment_audit pa
    join loans l on l.id = pa.loan_id
    join members m on m.id = l.member_id
  ) combined
  order by changed_at desc
  limit p_limit;
$$;

revoke all on function public.list_recent_audit(integer) from public, anon;
grant execute on function public.list_recent_audit(integer) to authenticated;
