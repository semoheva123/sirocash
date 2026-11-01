-- Narrow bridge: authenticate a known session hash without exposing authentication tables to custody.
CREATE FUNCTION financial_assert_session(p_user uuid,p_session text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_session !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PASSKEY_SESSION_EXPIRED'; END IF;
 PERFORM 1 FROM public."AuthSession" WHERE "tokenHash"=p_session AND "userId"=p_user AND "expiresAt">clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PASSKEY_SESSION_EXPIRED'; END IF;
END $$;
CREATE FUNCTION financial_consume_approval(p_user uuid,p_session text,p_rp text,p_token text,p_digest text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.financial_assert_session(p_user,p_session);
 IF p_token !~ '^[a-f0-9]{64}$' OR p_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYMENT_APPROVAL_REQUIRED'; END IF;
 UPDATE public."DurablePaymentApproval" a SET "consumedAt"=clock_timestamp()
 FROM public."DurablePasskeyCredential" k
 WHERE a."tokenHash"=p_token AND a."sessionHash"=p_session AND a.digest=p_digest
 AND a."consumedAt" IS NULL AND a."expiresAt">clock_timestamp()
 AND k.id=a."credentialId" AND k."userId"=p_user AND k."rpId"=p_rp;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_APPROVAL_REQUIRED'; END IF;
END $$;
REVOKE ALL ON FUNCTION financial_assert_session(uuid,text),financial_consume_approval(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial_assert_session(uuid,text),financial_consume_approval(uuid,text,text,text,text) TO sirocash_financial_worker;
CREATE TABLE "FinancialPriceObservation" (
 id text PRIMARY KEY,
 provider text NOT NULL CHECK(provider='coinbase-spot-v1'),
 asset text NOT NULL CHECK(asset='USDT'),
 "rateUsdMicros" bigint NOT NULL CHECK("rateUsdMicros">0 AND "rateUsdMicros"<100000000),
 evidence jsonb NOT NULL CHECK(pg_column_size(evidence)<=8192),
 "observedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "expiresAt" timestamptz NOT NULL DEFAULT clock_timestamp()+interval '59 seconds',
 CHECK("expiresAt">"observedAt" AND "expiresAt"<="observedAt"+interval '60 seconds')
);
CREATE FUNCTION guard_financial_price() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FINANCIAL_PRICE_IMMUTABLE'; END $$;
CREATE TRIGGER immutable_financial_price BEFORE UPDATE OR DELETE ON "FinancialPriceObservation" FOR EACH ROW EXECUTE FUNCTION guard_financial_price();
ALTER TABLE "FinancialPriceObservation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FinancialPriceObservation" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON "FinancialPriceObservation" FROM %I',r); END IF;
 END LOOP;
END $$;
GRANT SELECT,INSERT ON "FinancialPriceObservation" TO sirocash_financial_worker;
CREATE POLICY financial_worker_price ON "FinancialPriceObservation" TO sirocash_financial_worker USING(true) WITH CHECK(true);
