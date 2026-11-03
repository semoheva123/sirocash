-- One shared informational feed. No user, balance, quote, fee, or ledger references.
CREATE TABLE public."ExchangeReference" (
 id text PRIMARY KEY CHECK(id='sp-today'),
 snapshot jsonb,
 "nextAttemptAt" timestamptz NOT NULL DEFAULT '-infinity',
 month date NOT NULL DEFAULT date_trunc('month',now() AT TIME ZONE 'UTC')::date,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 93),
 "requestId" uuid,
 "blockedUntil" timestamptz NOT NULL DEFAULT '-infinity'
);
ALTER TABLE public."ExchangeReference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ExchangeReference" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON public."ExchangeReference" FROM %I',r);
 END IF; END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON public."ExchangeReference" TO sirocash_app;
CREATE POLICY exchange_backend ON public."ExchangeReference" TO sirocash_app USING(true) WITH CHECK(true);
