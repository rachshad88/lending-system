-- ============================================================================
-- 0013 — Fixes from a Supabase security/performance advisor pass
--
-- 1. admin_users_self_read called auth.uid() directly, so Postgres
--    re-evaluated it on every row instead of once per query. Wrapping it in
--    a subselect lets the planner treat it as a stable initplan value.
--
-- 2. rls_auto_enable() is an event-trigger function (fires on CREATE TABLE
--    to force RLS on immediately) and Postgres refuses to call event-trigger
--    functions directly regardless of grants, so this is not exploitable —
--    but the advisor flags it as "callable by anon/authenticated" because
--    EXECUTE was never revoked from PUBLIC (the default). Revoking it here
--    is pure hardening: the trigger still fires the same way either way.
-- ============================================================================

drop policy if exists admin_users_self_read on admin_users;
create policy admin_users_self_read on admin_users
  for select using (user_id = (select auth.uid()));

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Backfills a grant that was applied straight to the live database on
-- 2026-09-12 (as "grant_missing_internal_function_execute") but never made it
-- into a tracked migration file. Without it, rebuilding the database from
-- this migrations folder alone would leave record_payment/update_payment and
-- run_maintenance unable to call the internal functions they depend on.
-- ----------------------------------------------------------------------------
grant execute on function public.split_payment(uuid, numeric) to authenticated;
grant execute on function public.replay_loan_payments(uuid) to authenticated;
grant execute on function public.sync_loan_status(uuid) to authenticated;
grant execute on function public.apply_due_penalties() to authenticated;
grant execute on function public.flag_write_off_candidates() to authenticated;
