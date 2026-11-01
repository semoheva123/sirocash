-- Prepared only: must be reviewed/applied by a controlled financial migration role.
-- This migration grants NO runtime posting privileges and does not enable payments.
CREATE TABLE "WalletOperation" (
 "id" UUID PRIMARY KEY,
 "ownerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL CHECK(length("requestKey") BETWEEN 8 AND 128),
 "fingerprint" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK("kind" IN ('TRANSFER','DEPOSIT','WITHDRAWAL')),
 "amount" NUMERIC(20,6) NOT NULL CHECK("amount">0),
 "counterpartyId" UUID REFERENCES "User"(id) ON DELETE RESTRICT,
 "destination" TEXT,
 "externalReference" TEXT UNIQUE,
 "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK("state" IN ('PENDING','RESERVED','SUBMITTED','COMPLETED','FAILED')),
 "transactionId" UUID UNIQUE REFERENCES "Transaction"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("ownerId","requestKey"),
 CHECK(("kind"='WITHDRAWAL' AND "destination" IS NOT NULL) OR ("kind"<>'WITHDRAWAL' AND "destination" IS NULL)),
 CHECK(("state"='COMPLETED')=("transactionId" IS NOT NULL)),
 CHECK("kind"='WITHDRAWAL' OR "state" NOT IN ('RESERVED','SUBMITTED','FAILED')),
 CHECK(("kind"='TRANSFER')=("counterpartyId" IS NOT NULL)),
 CHECK("counterpartyId" IS NULL OR "counterpartyId"<>"ownerId"),
 CHECK("kind"<>'DEPOSIT' OR "externalReference" IS NOT NULL),
 CHECK("kind"<>'TRANSFER' OR "externalReference" IS NULL),
 CHECK("kind"<>'WITHDRAWAL' OR "state" NOT IN ('COMPLETED','FAILED') OR "externalReference" IS NOT NULL)
);
CREATE INDEX "WalletOperation_owner_state" ON "WalletOperation"("ownerId","state");
ALTER TABLE "WalletOperation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WalletOperation" FROM PUBLIC;

DO $$ DECLARE role_name TEXT; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON public."WalletOperation" FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
