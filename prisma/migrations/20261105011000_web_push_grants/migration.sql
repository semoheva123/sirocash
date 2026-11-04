-- Supabase's project defaults can grant anon/authenticated privileges explicitly,
-- independently of PUBLIC. Remove those and direct function grants as well.
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','sirocash_financial_worker'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON public."WebPushSubscription",public."WebPushDelivery",public."WebPushWake" FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON SEQUENCE public."WebPushDelivery_id_seq" FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON FUNCTION public.enqueue_web_push(),public.dispatch_web_push(),public.wake_web_push() FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON public."WebPushWake" FROM sirocash_app;
REVOKE ALL ON FUNCTION public.enqueue_web_push(),public.dispatch_web_push(),public.wake_web_push() FROM sirocash_app;
