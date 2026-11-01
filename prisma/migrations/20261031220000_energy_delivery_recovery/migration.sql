-- Private recovery only; no purchase flag or runtime privilege is enabled.
ALTER TABLE "EnergyPurchaseAttempt"
 ADD COLUMN "actualCostSun" BIGINT CHECK("actualCostSun">=0),
 ADD COLUMN "providerFinalStatus" TEXT CHECK("providerFinalStatus" IN ('success','failed')),
 ADD COLUMN "delegationTxId" TEXT CHECK("delegationTxId" ~ '^[a-f0-9]{64}$'),
 ADD COLUMN "reconciledAt" TIMESTAMPTZ,
 ADD COLUMN "resourceObservedAt" TIMESTAMPTZ,
 ADD COLUMN "resourcesVerifiedUntil" TIMESTAMPTZ,
 ADD CONSTRAINT energy_charge_complete CHECK(
 ("actualCostSun" IS NULL AND "providerFinalStatus" IS NULL AND "reconciledAt" IS NULL) OR
 ("actualCostSun" IS NOT NULL AND "providerFinalStatus" IS NOT NULL AND "reconciledAt" IS NOT NULL AND state='ACKNOWLEDGED')),
 ADD CONSTRAINT energy_delivery_complete CHECK(
 ("resourceObservedAt" IS NULL AND "resourcesVerifiedUntil" IS NULL) OR
 ("resourceObservedAt" IS NOT NULL AND "resourcesVerifiedUntil" IS NOT NULL AND "resourcesVerifiedUntil">"resourceObservedAt" AND "resourcesVerifiedUntil"<="resourceObservedAt"+interval '30 seconds' AND "providerFinalStatus"='success' AND "delegationTxId" IS NOT NULL));
CREATE OR REPLACE FUNCTION guard_energy_purchase_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mutable TEXT[]:=ARRAY['state','providerOrderId','actualCostSun','providerFinalStatus','delegationTxId','reconciledAt','resourceObservedAt','resourcesVerifiedUntil'];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ENERGY_PURCHASE_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable)
 OR NEW.state<>'ACKNOWLEDGED'
 OR (OLD.state='ACKNOWLEDGED' AND NEW."providerOrderId" IS DISTINCT FROM OLD."providerOrderId")
 OR (OLD."actualCostSun" IS NOT NULL AND ROW(NEW."actualCostSun",NEW."providerFinalStatus",NEW."delegationTxId",NEW."reconciledAt") IS DISTINCT FROM ROW(OLD."actualCostSun",OLD."providerFinalStatus",OLD."delegationTxId",OLD."reconciledAt"))
 THEN RAISE EXCEPTION 'ENERGY_PURCHASE_IMMUTABLE'; END IF;
 IF ROW(NEW."resourceObservedAt",NEW."resourcesVerifiedUntil") IS DISTINCT FROM ROW(OLD."resourceObservedAt",OLD."resourcesVerifiedUntil") AND
 (NEW."resourceObservedAt" IS NULL OR NEW."resourcesVerifiedUntil" IS NULL OR NEW."resourceObservedAt">clock_timestamp() OR NEW."resourceObservedAt"<clock_timestamp()-interval '30 seconds' OR NEW."resourcesVerifiedUntil"<=clock_timestamp() OR (OLD."resourceObservedAt" IS NOT NULL AND NEW."resourceObservedAt"<=OLD."resourceObservedAt"))
 THEN RAISE EXCEPTION 'ENERGY_DELIVERY_STALE'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE "FinancialWorkerLease" DROP CONSTRAINT "FinancialWorkerLease_cursorKind_check";
ALTER TABLE "FinancialWorkerLease" ADD CONSTRAINT "FinancialWorkerLease_cursorKind_check" CHECK("cursorKind" IN ('ENERGY','PAYOUT','SWEEP'));
