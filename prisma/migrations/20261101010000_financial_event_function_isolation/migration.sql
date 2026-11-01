-- Supabase may grant new functions directly via its default privileges, not just PUBLIC.
-- Only the trigger owner needs EXECUTE at CREATE TRIGGER time; callers cannot invoke it.
REVOKE ALL ON FUNCTION public.financial_notify_change() FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
