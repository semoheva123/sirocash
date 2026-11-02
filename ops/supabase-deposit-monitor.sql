-- Hosted Supabase only. Install disabled after both ticket schema migrations.
-- Synchronous HTTP runs in a dedicated pg_cron session, NOT pg_net's shared queue.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.prepare_deposit_monitor() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE token TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."DepositMonitorSchedule" WHERE id=1 AND enabled) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public."DepositMonitorTicket" WHERE "createdAt">clock_timestamp()-interval '115 seconds')
 OR EXISTS(SELECT 1 FROM public."DepositNetworkScanner" WHERE "expiresAt">clock_timestamp()) THEN RETURN; END IF;
 DELETE FROM public."DepositMonitorTicket" WHERE "expiresAt"<clock_timestamp()-interval '1 day';
 DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname='sirocash-deposit-monitor') AND end_time<clock_timestamp()-interval '7 days';
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public."DepositMonitorTicket" ("tokenHash","dispatchToken","expiresAt")
 VALUES (encode(sha256(convert_to(token,'UTF8')),'hex'),token,clock_timestamp()+interval '2 minutes');
END $$;
CREATE OR REPLACE FUNCTION public.dispatch_deposit_monitor() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ticket RECORD; response extensions.http_response; result JSONB; state TEXT; failure TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."DepositMonitorSchedule" WHERE id=1 AND enabled) THEN RETURN NULL; END IF;
 SELECT "tokenHash","dispatchToken" INTO ticket FROM public."DepositMonitorTicket"
 WHERE "createdAt">clock_timestamp()-interval '5 seconds' AND "usedAt" IS NULL AND "dispatchToken" IS NOT NULL
 ORDER BY "createdAt" DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 BEGIN
  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','175000');
  SELECT * INTO response FROM extensions.http(ROW(
   'POST','https://sirocash.vercel.app/api/internal/deposit-monitor-scheduled',
   ARRAY[extensions.http_header('Authorization','Bearer '||ticket."dispatchToken")],
   'application/json','{}'
  )::extensions.http_request);
  IF response.status=200 THEN
   BEGIN
    result:=response.content::jsonb;
    IF result->>'state'='COMPLETED' AND jsonb_typeof(result->'healthy')='boolean' THEN state:='COMPLETED';
    ELSE failure:='INVALID_RESULT'; END IF;
   EXCEPTION WHEN OTHERS THEN failure:='INVALID_RESULT'; END;
  ELSE failure:='HTTP_FAILURE'; END IF;
 EXCEPTION WHEN OTHERS THEN failure:='TRANSPORT_FAILED'; END;
 UPDATE public."DepositMonitorTicket" SET "dispatchToken"=NULL,"completedAt"=clock_timestamp(),
  "httpStatus"=response.status,"resultState"=state,
  healthy=CASE WHEN state='COMPLETED' THEN (result->>'healthy')::boolean ELSE NULL END,"failureCode"=failure
 WHERE "tokenHash"=ticket."tokenHash";
 RETURN response.status;
END $$;
REVOKE ALL ON FUNCTION public.prepare_deposit_monitor(),public.dispatch_deposit_monitor() FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
-- Hosted extension helpers have provider-owned ACLs. Authorization material is
-- never passed to a shared queue; only our private functions/tables authorize it.
-- Explicit COMMIT makes the ticket visible to the HTTP consumer before dispatch.
-- A single pg_cron job never overlaps its own executions. It waits <=175s, not a
-- foreground pooled DB request. Enqueue/cron success alone is not scanner health.
SELECT cron.schedule('sirocash-deposit-monitor','*/2 * * * *',
 'BEGIN; SELECT public.prepare_deposit_monitor(); COMMIT; SELECT public.dispatch_deposit_monitor();');
DROP FUNCTION IF EXISTS public.enqueue_deposit_monitor();
