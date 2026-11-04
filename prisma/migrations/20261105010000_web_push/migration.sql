-- Consent-only device subscriptions; revoked/expired login sessions cannot receive push.
CREATE TABLE public."WebPushSubscription" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
 "sessionHash" text NOT NULL REFERENCES public."AuthSession"("tokenHash") ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE CHECK(length(endpoint)<=2048), p256dh text NOT NULL, auth text NOT NULL,
 language text NOT NULL CHECK(language IN ('ar','en')), "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_push_owner ON public."WebPushSubscription"("ownerId");
CREATE TABLE public."WebPushDelivery" (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 "subscriptionId" uuid NOT NULL REFERENCES public."WebPushSubscription"(id) ON DELETE CASCADE,
 "notificationId" text NOT NULL REFERENCES public."AccountNotification"(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CLAIMED','SENT','FAILED')),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "claimedAt" timestamptz,
 UNIQUE("subscriptionId","notificationId")
);
CREATE INDEX web_push_pending ON public."WebPushDelivery"(id) WHERE state='PENDING';
ALTER TABLE public."WebPushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WebPushDelivery" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."WebPushSubscription",public."WebPushDelivery" FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."WebPushSubscription",public."WebPushDelivery" TO sirocash_app;
GRANT USAGE,SELECT ON SEQUENCE public."WebPushDelivery_id_seq" TO sirocash_app;
CREATE POLICY push_backend_subscription ON public."WebPushSubscription" TO sirocash_app USING(true) WITH CHECK(true);
CREATE POLICY push_backend_delivery ON public."WebPushDelivery" TO sirocash_app USING(true) WITH CHECK(true);
CREATE FUNCTION public.enqueue_web_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW."ownerId" IS NOT NULL AND NOT NEW.staff THEN
 INSERT INTO public."WebPushDelivery"("subscriptionId","notificationId")
 SELECT s.id,NEW.id FROM public."WebPushSubscription" s JOIN public."AuthSession" a ON a."tokenHash"=s."sessionHash" AND a."userId"=s."ownerId"
 WHERE s."ownerId"=NEW."ownerId" AND a."expiresAt">now() ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- Optional delivery must never roll back a financial operation. No secrets in logs.
 RAISE WARNING 'WEB_PUSH_ENQUEUE_FAILED'; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_web_push() FROM PUBLIC;
CREATE TRIGGER enqueue_web_push AFTER INSERT ON public."AccountNotification" FOR EACH ROW EXECUTE FUNCTION public.enqueue_web_push();
-- No historical backfill. No financial-table updates and no external I/O in a transaction.

-- One coalesced wake: installed Supabase pg_net sends AFTER COMMIT, never inside a financial network call.
-- Vault secret and cron are configured operationally only after successful deployment.
CREATE TABLE public."WebPushWake" (id boolean PRIMARY KEY DEFAULT true CHECK(id),"lastAt" timestamptz NOT NULL DEFAULT 'epoch');
INSERT INTO public."WebPushWake"(id) VALUES(true);
ALTER TABLE public."WebPushWake" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."WebPushWake" FROM PUBLIC;
CREATE FUNCTION public.dispatch_web_push() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE secret_value text; request_id bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."WebPushDelivery" WHERE state='PENDING' OR (state='CLAIMED' AND "claimedAt"<now()-interval '2 minutes')) THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(835601139) THEN RETURN; END IF;
 UPDATE public."WebPushWake" SET "lastAt"=now() WHERE id AND "lastAt"<now()-interval '15 seconds';
 IF NOT FOUND THEN RETURN; END IF;
 SELECT decrypted_secret INTO secret_value FROM vault.decrypted_secrets WHERE name='sirocash_web_push_worker';
 IF secret_value IS NULL THEN RETURN; END IF;
 SELECT net.http_post(url:='https://www.sirocash.online/api/internal/push',headers:=jsonb_build_object('Authorization','Bearer '||secret_value,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=60000) INTO request_id;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_web_push() FROM PUBLIC;
CREATE FUNCTION public.wake_web_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 BEGIN PERFORM public.dispatch_web_push(); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'WEB_PUSH_WAKE_FAILED'; END;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.wake_web_push() FROM PUBLIC;
CREATE TRIGGER wake_web_push AFTER INSERT ON public."WebPushDelivery" FOR EACH STATEMENT EXECUTE FUNCTION public.wake_web_push();
