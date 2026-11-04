-- AuthSession deliberately grants no UPDATE to the web role. Row locking also
-- needs UPDATE privilege, so provide only this fixed, non-mutating lock bridge.
CREATE FUNCTION public.passkey_assert_session(p_user uuid,p_session text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_user IS NULL OR p_session IS NULL OR p_session !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'PASSKEY_SESSION_EXPIRED';
 END IF;
 PERFORM 1 FROM public."AuthSession"
 WHERE "tokenHash"=p_session AND "userId"=p_user AND "expiresAt">clock_timestamp()
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PASSKEY_SESSION_EXPIRED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.passkey_assert_session(uuid,text) FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_financial_worker'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.passkey_assert_session(uuid,text) FROM %I',r);
  END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.passkey_assert_session(uuid,text) TO sirocash_app;
