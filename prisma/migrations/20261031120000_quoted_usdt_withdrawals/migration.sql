-- Prepared only. No public quote import or posting grants.
CREATE TABLE "UsdtWithdrawalQuote" (
 id UUID PRIMARY KEY,
 "ownerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL CHECK (length("requestKey") BETWEEN 8 AND 128),
 fingerprint TEXT NOT NULL,
 network TEXT NOT NULL CHECK (network IN ('TRC20','BEP20')),
 recipient TEXT NOT NULL,
 "grossTokens" NUMERIC(20,6) NOT NULL,
 "feeTokens" NUMERIC(20,6) NOT NULL,
 "netTokens" NUMERIC(20,6) NOT NULL CHECK ("netTokens">0),
 "grossUsd" NUMERIC(20,6) NOT NULL CHECK ("grossUsd">0),
 "feeUsd" NUMERIC(20,6) NOT NULL CHECK ("feeUsd">0),
 "netUsd" NUMERIC(20,6) NOT NULL CHECK ("netUsd">0),
 "rateUsdMicrosPerToken" NUMERIC(30,0) NOT NULL CHECK ("rateUsdMicrosPerToken">0),
 "rateReference" TEXT NOT NULL,
 "settlementAccountId" UUID NOT NULL REFERENCES "LedgerAccount"(id) ON DELETE RESTRICT,
 "feeAccountId" UUID NOT NULL REFERENCES "LedgerAccount"(id) ON DELETE RESTRICT,
 "expiresAt" TIMESTAMPTZ NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "operationId" UUID UNIQUE REFERENCES "WalletOperation"(id) ON DELETE RESTRICT,
 UNIQUE("ownerId","requestKey"),
 CHECK ("grossTokens"="feeTokens"+"netTokens"),
 CHECK ("grossUsd"="feeUsd"+"netUsd"),
 CHECK ((network='TRC20' AND "feeTokens"=5) OR (network='BEP20' AND "feeTokens"=2)),
 CHECK ("settlementAccountId"<>"feeAccountId")
);
ALTER TABLE "UsdtWithdrawalQuote" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "UsdtWithdrawalQuote" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN REVOKE ALL ON "UsdtWithdrawalQuote" FROM sirocash_app; END IF;
END $$;
-- Freeze approved economics, including expiry; only initial operation attachment is permitted.
CREATE FUNCTION guard_usdt_withdrawal_quote() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'operationId') IS DISTINCT FROM (to_jsonb(OLD)-'operationId') OR
    (OLD."operationId" IS NOT NULL AND NEW."operationId" IS DISTINCT FROM OLD."operationId") THEN
  RAISE EXCEPTION 'IMMUTABLE_WITHDRAWAL_QUOTE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_usdt_withdrawal_quote BEFORE UPDATE ON "UsdtWithdrawalQuote" FOR EACH ROW EXECUTE FUNCTION guard_usdt_withdrawal_quote();
REVOKE ALL ON FUNCTION guard_usdt_withdrawal_quote() FROM PUBLIC;
