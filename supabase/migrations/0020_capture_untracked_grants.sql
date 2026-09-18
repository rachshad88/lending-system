-- ============================================================================
-- 0020 — capture grants applied directly on 2026-09-12, never tracked
--
-- A sanity-check of the live database (Supabase migration history) turned up
-- five EXECUTE grants that exist in production but were never captured in any
-- migration file here, so a fresh database rebuilt from this folder alone
-- would be missing them: record_payment/update_payment call split_payment,
-- replay_loan_payments and sync_loan_status internally, and the dashboard's
-- maintenance job calls apply_due_penalties/flag_write_off_candidates —
-- authenticated needs EXECUTE on the whole call chain, not just the function
-- it calls directly. This migration is a no-op on the live database (the
-- grants already exist there); it only closes the gap for a future rebuild.
-- ============================================================================

grant execute on function public.split_payment(uuid, numeric) to authenticated;
grant execute on function public.replay_loan_payments(uuid) to authenticated;
grant execute on function public.sync_loan_status(uuid) to authenticated;
grant execute on function public.apply_due_penalties() to authenticated;
grant execute on function public.flag_write_off_candidates() to authenticated;
