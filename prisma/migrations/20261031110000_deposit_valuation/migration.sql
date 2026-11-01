-- Prepared only. Approvals must be imported by a separate reviewed pricing authority.
ALTER TABLE "ChainDepositInbox" DROP CONSTRAINT "ChainDepositInbox_state_check";
ALTER TABLE "ChainDepositInbox" ADD CONSTRAINT "ChainDepositInbox_state_check" CHECK (state IN ('AWAITING_VALUATION','CREDITED'));
CREATE TABLE "ApprovedDepositValuation" (
 "inboxId" UUID PRIMARY KEY REFERENCES "ChainDepositInbox"(id) ON DELETE RESTRICT,
 "inboxFingerprint" TEXT NOT NULL CHECK ("inboxFingerprint" ~ '^[a-f0-9]{64}$'),
 "quoteReference" TEXT NOT NULL CHECK (length("quoteReference") BETWEEN 8 AND 200),
 "rateUsdMicrosPerToken" NUMERIC(30,0) NOT NULL CHECK ("rateUsdMicrosPerToken">0),
 policy TEXT NOT NULL CHECK (policy='floor-usd-micros-v1'),
 "settlementAccountId" UUID NOT NULL REFERENCES "LedgerAccount"(id) ON DELETE RESTRICT,
 "approvedAt" TIMESTAMPTZ NOT NULL,
 "expiresAt" TIMESTAMPTZ NOT NULL,
 "operationId" UUID UNIQUE REFERENCES "WalletOperation"(id) ON DELETE RESTRICT,
 CHECK ("expiresAt">"approvedAt")
);
ALTER TABLE "ApprovedDepositValuation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ApprovedDepositValuation" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN REVOKE ALL ON "ApprovedDepositValuation" FROM sirocash_app; END IF;
END $$;
