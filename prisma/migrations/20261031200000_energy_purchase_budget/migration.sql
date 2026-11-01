-- Staged only. No paid adapter, public endpoint or runtime grants.
CREATE TABLE "EnergyPurchasePolicy" (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled BOOLEAN NOT NULL DEFAULT false,
 "perOrderSun" BIGINT NOT NULL CHECK("perOrderSun">0),
 "totalHeldSun" BIGINT NOT NULL CHECK("totalHeldSun">= "perOrderSun")
);
INSERT INTO "EnergyPurchasePolicy" VALUES (1,false,1,1);
CREATE TABLE "EnergyPurchaseAttempt" (
 "intentId" UUID PRIMARY KEY REFERENCES "EnergyRentalIntent"(id) ON DELETE RESTRICT,
 "claimId" UUID NOT NULL UNIQUE,
 "intentFingerprint" TEXT NOT NULL,
 "senderAddress" TEXT NOT NULL,
 "energyAmount" INTEGER NOT NULL CHECK("energyAmount">0),
 "costSun" BIGINT NOT NULL CHECK("costSun">0),
 "quoteExpiresAt" TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(state IN ('UNKNOWN','ACKNOWLEDGED')),
 "providerOrderId" TEXT UNIQUE,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((state='ACKNOWLEDGED')=("providerOrderId" IS NOT NULL))
);
-- No release path: both uncertain and acknowledged purchases retain their reservation
-- across midnight until a separately reviewed reconciliation/settlement design exists.
CREATE FUNCTION guard_energy_purchase_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ENERGY_PURCHASE_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-'state'-'providerOrderId') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'providerOrderId')
 OR OLD.state<>'UNKNOWN' OR NEW.state<>'ACKNOWLEDGED'
 THEN RAISE EXCEPTION 'ENERGY_PURCHASE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_energy_purchase BEFORE UPDATE OR DELETE ON "EnergyPurchaseAttempt"
 FOR EACH ROW EXECUTE FUNCTION guard_energy_purchase_attempt();
ALTER TABLE "EnergyPurchasePolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnergyPurchaseAttempt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "EnergyPurchasePolicy","EnergyPurchaseAttempt" FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON "EnergyPurchasePolicy","EnergyPurchaseAttempt" FROM %I',r);
 END IF;
 END LOOP;
END $$;
