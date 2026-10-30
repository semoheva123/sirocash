-- Auth backend only. Financial posting permissions are deliberately not granted.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN
  CREATE ROLE sirocash_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO sirocash_app',current_database());
END $$;
GRANT USAGE ON SCHEMA public TO sirocash_app;
DO $$ DECLARE t TEXT; r TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['User','LedgerAccount','Transaction','LedgerEntry','DepositAddress','AuthSession','EmailChallenge','EmailRateLimit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r); END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION reject_journal_mutation(),guard_balance_cache(),post_ledger_delta(),assert_balanced_journal(),guard_transaction_mutation() FROM PUBLIC;
GRANT SELECT (id,email,"emailVerifiedAt","passwordHash",balance),INSERT (id,email,"emailVerifiedAt","passwordHash"),UPDATE ("emailVerifiedAt") ON "User" TO sirocash_app;
GRANT SELECT,INSERT,DELETE ON "AuthSession" TO sirocash_app;
GRANT SELECT,INSERT,DELETE ON "EmailChallenge" TO sirocash_app;
GRANT UPDATE (attempts) ON "EmailChallenge" TO sirocash_app;
GRANT SELECT,INSERT,UPDATE ON "EmailRateLimit" TO sirocash_app;
CREATE POLICY sirocash_backend_user ON "User" TO sirocash_app USING (true) WITH CHECK (true);
CREATE POLICY sirocash_backend_session ON "AuthSession" TO sirocash_app USING (true) WITH CHECK (true);
CREATE POLICY sirocash_backend_challenge ON "EmailChallenge" TO sirocash_app USING (true) WITH CHECK (true);
CREATE POLICY sirocash_backend_rate_limit ON "EmailRateLimit" TO sirocash_app USING (true) WITH CHECK (true);
