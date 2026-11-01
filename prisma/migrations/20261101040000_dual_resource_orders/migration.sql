-- Reserve both resource legs atomically under the existing combined parent budget.
ALTER TABLE "EnergyRentalIntent" DROP CONSTRAINT "EnergyRentalIntent_energyAmount_check";
ALTER TABLE "EnergyRentalIntent" ADD CHECK ("energyAmount">=0 AND ("energyAmount">0 OR "bandwidthAmount">0));
ALTER TABLE "EnergyPurchaseAttempt" DROP CONSTRAINT "EnergyPurchaseAttempt_energyAmount_check";
ALTER TABLE "EnergyPurchaseAttempt" ADD CHECK ("energyAmount">=0 AND ("energyAmount">0 OR "bandwidthAmount">0));
CREATE TABLE "ResourcePurchaseLeg" (
 "claimId" UUID NOT NULL REFERENCES "EnergyPurchaseAttempt"("claimId") ON DELETE RESTRICT,
 resource TEXT NOT NULL CHECK(resource IN ('ENERGY','BANDWIDTH')),
 provider TEXT NOT NULL,
 "requestKey" UUID NOT NULL UNIQUE,
 sender TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),
 "quotedSun" BIGINT NOT NULL CHECK("quotedSun">0),
 "expiresAt" TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','UNKNOWN','ACKNOWLEDGED')),
 "orderId" TEXT,
 "actualSun" BIGINT CHECK("actualSun">=0),
 status TEXT CHECK(status IN ('pending','success','failed')),
 "txId" TEXT CHECK("txId" ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY("claimId",resource), UNIQUE(provider,"orderId"),
 CHECK((resource='ENERGY' AND provider='catfee' AND quantity>=65000) OR (resource='BANDWIDTH' AND provider='tronrental' AND quantity<=100000)),
 CHECK((state='ACKNOWLEDGED')=("orderId" IS NOT NULL)),
 CHECK(("actualSun" IS NULL)=(status IS NULL))
);
CREATE FUNCTION guard_resource_purchase_leg() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "EnergyPurchaseAttempt";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RESOURCE_LEG_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO STRICT p FROM "EnergyPurchaseAttempt" WHERE "claimId"=NEW."claimId";
  IF NEW.state<>'READY' OR NEW."orderId" IS NOT NULL OR NEW."actualSun" IS NOT NULL OR NEW.status IS NOT NULL OR NEW."txId" IS NOT NULL
  OR NEW.sender<>p."senderAddress" OR NEW.quantity<>(CASE WHEN NEW.resource='ENERGY' THEN p."energyAmount" ELSE p."bandwidthAmount" END)
  OR NEW."quotedSun">p."costSun" OR NEW."expiresAt"<>p."quoteExpiresAt" THEN RAISE EXCEPTION 'RESOURCE_LEG_BINDING'; END IF;
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['state','orderId','actualSun','status','txId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','orderId','actualSun','status','txId'])
 OR NOT ((OLD.state='READY' AND NEW.state='UNKNOWN' AND NEW."orderId" IS NULL AND NEW."actualSun" IS NULL AND NEW.status IS NULL AND NEW."txId" IS NULL)
 OR (OLD.state='UNKNOWN' AND NEW.state='ACKNOWLEDGED')
 OR (OLD.state='ACKNOWLEDGED' AND NEW.state='ACKNOWLEDGED' AND OLD."orderId"=NEW."orderId"))
 OR (OLD."actualSun" IS NOT NULL AND NEW."actualSun" IS DISTINCT FROM OLD."actualSun")
 OR (OLD.status IN ('success','failed') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW."txId" IS DISTINCT FROM OLD."txId"))
 OR (OLD."txId" IS NOT NULL AND NEW."txId" IS DISTINCT FROM OLD."txId")
 THEN RAISE EXCEPTION 'RESOURCE_LEG_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_resource_leg BEFORE INSERT OR UPDATE OR DELETE ON "ResourcePurchaseLeg" FOR EACH ROW EXECUTE FUNCTION guard_resource_purchase_leg();
ALTER TABLE "ResourcePurchaseLeg" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ResourcePurchaseLeg" FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON "ResourcePurchaseLeg" FROM %I',r); END IF;
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON "ResourcePurchaseLeg" TO sirocash_financial_worker;
CREATE POLICY financial_resource_legs ON "ResourcePurchaseLeg" TO sirocash_financial_worker USING(true) WITH CHECK(true);
-- Whole plan must exist and equal the parent's budget at commit, not after first POST.
CREATE FUNCTION assert_resource_plan_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "EnergyPurchaseAttempt"; n INTEGER; total NUMERIC;
BEGIN
 SELECT * INTO STRICT p FROM "EnergyPurchaseAttempt" WHERE "claimId"=NEW."claimId";
 SELECT count(*),sum("quotedSun") INTO n,total FROM "ResourcePurchaseLeg" WHERE "claimId"=NEW."claimId";
 IF n<>(CASE WHEN p."energyAmount">0 THEN 1 ELSE 0 END)+(CASE WHEN p."bandwidthAmount">0 THEN 1 ELSE 0 END) OR total<>p."costSun"
 THEN RAISE EXCEPTION 'RESOURCE_PLAN_INCOMPLETE'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER resource_plan_total AFTER INSERT ON "ResourcePurchaseLeg" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_resource_plan_total();
