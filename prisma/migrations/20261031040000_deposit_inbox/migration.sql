-- Durable intake only: no ledger permissions or public ingestion policy.
CREATE TABLE "ChainDepositInbox" (
 id UUID PRIMARY KEY,
 "eventKey" TEXT NOT NULL UNIQUE,
 "addressId" UUID NOT NULL REFERENCES "UserDepositAddress"(id) ON DELETE RESTRICT,
 "txId" TEXT NOT NULL CHECK ("txId" ~ '^[a-f0-9]{64}$'),
 "logIndex" INTEGER NOT NULL CHECK ("logIndex">=0),
 "blockNumber" BIGINT NOT NULL CHECK ("blockNumber">=0),
 "blockHash" TEXT NOT NULL CHECK ("blockHash" ~ '^[a-f0-9]{64}$'),
 "amountBaseUnits" NUMERIC(78,0) NOT NULL CHECK ("amountBaseUnits">0),
 fingerprint TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'AWAITING_VALUATION' CHECK (state='AWAITING_VALUATION'),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE ("txId","logIndex")
);
ALTER TABLE "ChainDepositInbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ChainDepositInbox" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN
  REVOKE ALL ON "ChainDepositInbox" FROM sirocash_app;
 END IF;
END $$;
