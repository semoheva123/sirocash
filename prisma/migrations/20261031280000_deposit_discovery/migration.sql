CREATE TABLE "DepositScanCursor" (
 "addressId" UUID PRIMARY KEY REFERENCES "UserDepositAddress"(id) ON DELETE RESTRICT,
 "nextBlock" BIGINT NOT NULL CHECK("nextBlock">=0),
 "transactionOffset" INTEGER NOT NULL DEFAULT 0 CHECK("transactionOffset">=0),
 "blockHash" TEXT CHECK("blockHash" ~ '^[a-f0-9]{64}$'),
 "previousBlockHash" TEXT CHECK("previousBlockHash" ~ '^[a-f0-9]{64}$'),
 "claimId" UUID, "expiresAt" TIMESTAMPTZ,
 paused BOOLEAN NOT NULL DEFAULT false,
 reason TEXT CHECK(reason IS NULL OR reason IN ('CHAIN_REORG','EVIDENCE_CONFLICT')),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(("claimId" IS NULL)=("expiresAt" IS NULL))
);
ALTER TABLE "DepositScanCursor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DepositScanCursor" FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON "DepositScanCursor" FROM %I',r); END IF;
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON "DepositScanCursor" TO sirocash_financial_worker;
CREATE POLICY financial_scan ON "DepositScanCursor" TO sirocash_financial_worker USING(true) WITH CHECK(true);
GRANT INSERT ON "UserDepositAddress" TO sirocash_financial_worker;
CREATE POLICY financial_address_insert ON "UserDepositAddress" FOR INSERT TO sirocash_financial_worker WITH CHECK(EXISTS(SELECT 1 FROM "DepositAddressVault" v WHERE v.id="vaultId" AND v.network="UserDepositAddress".network AND v.enabled AND v."originVerified"));
GRANT UPDATE("nextIndex") ON "DepositAddressVault" TO sirocash_financial_worker;
CREATE POLICY financial_vault_increment ON "DepositAddressVault" FOR UPDATE TO sirocash_financial_worker USING(enabled AND "originVerified") WITH CHECK(enabled AND "originVerified");
CREATE FUNCTION guard_deposit_vault_index() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF current_user='sirocash_financial_worker' AND (NEW."nextIndex"<>OLD."nextIndex"+1 OR (to_jsonb(NEW)-'nextIndex') IS DISTINCT FROM (to_jsonb(OLD)-'nextIndex')) THEN RAISE EXCEPTION 'DEPOSIT_VAULT_INCREMENT_ONLY'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER deposit_vault_increment BEFORE UPDATE ON "DepositAddressVault" FOR EACH ROW EXECUTE FUNCTION guard_deposit_vault_index();
ALTER TABLE "FinancialWorkerLease" DROP CONSTRAINT "FinancialWorkerLease_cursorKind_check";
ALTER TABLE "FinancialWorkerLease" ADD CONSTRAINT "FinancialWorkerLease_cursorKind_check" CHECK("cursorKind" IN ('ENERGY','PAYOUT','SWEEP','GAS','PREPARE_PAYOUT','PREPARE_SWEEP','DEPOSIT_VALUE','DEPOSIT_SCAN'));
