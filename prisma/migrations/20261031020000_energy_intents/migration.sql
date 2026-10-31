-- Prepared only. No runtime grants, external dispatch or production activation.
CREATE TABLE "EnergyRentalIntent" (
 id UUID PRIMARY KEY,
 "withdrawalId" UUID NOT NULL UNIQUE REFERENCES "WalletOperation"(id) ON DELETE RESTRICT,
 "senderAddress" TEXT NOT NULL CHECK ("senderAddress" ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
 "requestKey" TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 "energyAmount" INTEGER NOT NULL CHECK ("energyAmount">0),
 "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" IN (15,60)),
 "maxRentalSun" BIGINT NOT NULL CHECK ("maxRentalSun">0),
 state TEXT NOT NULL DEFAULT 'PREPARED' CHECK (state IN ('PREPARED','DISPATCHING','UNCERTAIN','DELIVERED','FAILED')),
 "providerOrderId" TEXT UNIQUE,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only one unresolved resource allocation per sender. Recovery must reconcile it first.
CREATE UNIQUE INDEX energy_sender_pending ON "EnergyRentalIntent" ("senderAddress")
 WHERE state IN ('PREPARED','DISPATCHING','UNCERTAIN');
ALTER TABLE "EnergyRentalIntent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "EnergyRentalIntent" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN
  REVOKE ALL ON "EnergyRentalIntent" FROM sirocash_app;
 END IF;
END $$;
