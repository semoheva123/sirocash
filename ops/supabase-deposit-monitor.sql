-- Hosted Supabase only: apply AFTER the ticket schema migration.
-- No Vercel/GitHub secrets are copied or decrypted. No wallet signing, purchases,
-- sweeping, or withdrawal endpoint. Install DISABLED; enable only after deployment.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
CREATE FUNCTION public.enqueue_deposit_monitor() RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE token TEXT; fingerprint TEXT; request_id BIGINT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."DepositMonitorSchedule" WHERE id=1 AND enabled) THEN RETURN NULL; END IF;
 -- Don't queue a second HTTP request while a recent ticket is pending or scanners are busy.
 IF EXISTS(SELECT 1 FROM public."DepositMonitorTicket" WHERE "createdAt">clock_timestamp()-interval '115 seconds')
 OR EXISTS(SELECT 1 FROM public."DepositNetworkScanner" WHERE "expiresAt">clock_timestamp()) THEN RETURN NULL; END IF;
 DELETE FROM public."DepositMonitorTicket" WHERE "expiresAt"<clock_timestamp()-interval '1 day';
 DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname='sirocash-deposit-monitor') AND end_time<clock_timestamp()-interval '7 days';
 token:=encode(extensions.gen_random_bytes(32),'hex');
 fingerprint:=encode(sha256(convert_to(token,'UTF8')),'hex');
 INSERT INTO public."DepositMonitorTicket" ("tokenHash","expiresAt") VALUES (fingerprint,clock_timestamp()+interval '2 minutes');
 SELECT net.http_post(
  url:='https://sirocash.vercel.app/api/internal/deposit-monitor-scheduled',
  body:='{}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
  timeout_milliseconds:=175000
 ) INTO request_id;
 UPDATE public."DepositMonitorTicket" SET "requestId"=request_id WHERE "tokenHash"=fingerprint;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_deposit_monitor() FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
SELECT cron.schedule('sirocash-deposit-monitor','*/2 * * * *','SELECT public.enqueue_deposit_monitor();');
-- Enqueue success is NOT monitor health. Inspect consumed tickets, HTTP completion,
-- and fresh DepositNetworkScanner progress across multiple automatic cycles.
