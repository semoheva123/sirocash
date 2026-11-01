-- Shared watch-only checkpoints. No signing, sweep, payout or spending permissions.
CREATE TABLE "DepositNetworkScanner" (
 network TEXT PRIMARY KEY CHECK(network IN ('TRC20','BEP20')),
 "claimId" UUID, "expiresAt" TIMESTAMPTZ,
 "lastBlock" BIGINT CHECK("lastBlock">=0), "lastHash" TEXT CHECK("lastHash" ~ '^[a-f0-9]{64}$'),
 "lastHead" BIGINT CHECK("lastHead">=0), "lagBlocks" BIGINT CHECK("lagBlocks">=0),
 "lastSuccessAt" TIMESTAMPTZ,
 paused BOOLEAN NOT NULL DEFAULT false,
 reason TEXT CHECK(reason IS NULL OR reason IN ('CHAIN_REORG','EVIDENCE_CONFLICT')),
 CHECK(("claimId" IS NULL)=("expiresAt" IS NULL)),
 CHECK(("lastBlock" IS NULL)=("lastHash" IS NULL))
);
INSERT INTO "DepositNetworkScanner"(network) VALUES ('TRC20'),('BEP20');
ALTER TABLE "DepositNetworkScanner" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DepositNetworkScanner" FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON "DepositNetworkScanner" FROM %I',r); END IF;
 END LOOP;
END $$;
GRANT SELECT,UPDATE ON "DepositNetworkScanner" TO sirocash_financial_worker;
CREATE POLICY financial_network_scan ON "DepositNetworkScanner" TO sirocash_financial_worker USING(true) WITH CHECK(true);
CREATE INDEX deposit_scan_progress ON "DepositScanCursor" ("nextBlock","transactionOffset") WHERE NOT paused;
