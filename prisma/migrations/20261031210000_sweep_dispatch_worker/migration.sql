-- Staged migration: install before using the new private worker. No finance grants or flags.
CREATE TABLE "SweepDispatchAuthorization" (
 "sweepId" UUID PRIMARY KEY REFERENCES "SignedSweepOutbox"(id) ON DELETE RESTRICT,
 network TEXT NOT NULL CHECK(network IN ('TRC20','BEP20')),
 "txId" TEXT NOT NULL,"payloadHash" TEXT NOT NULL CHECK("payloadHash" ~ '^[a-f0-9]{64}$'),
 "maxFee" NUMERIC(78,0) NOT NULL CHECK("maxFee">0),
 "expense" NUMERIC(78,0) NOT NULL CHECK("expense">="maxFee"),
 "evidenceHash" TEXT NOT NULL,"evidence" JSONB NOT NULL,
 "approvedAt" TIMESTAMPTZ NOT NULL,"expiresAt" TIMESTAMPTZ NOT NULL CHECK("expiresAt">"approvedAt"),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 state TEXT NOT NULL DEFAULT 'HELD' CHECK(state IN ('HELD','SETTLED')),
 "settledAt" TIMESTAMPTZ,
 "consumedAt" TIMESTAMPTZ,"claimId" UUID UNIQUE,
 "dispatchState" TEXT CHECK("dispatchState" IN ('UNKNOWN','ACKNOWLEDGED')),
 CHECK(("claimId" IS NOT NULL)=("consumedAt" IS NOT NULL)),
 CHECK(("claimId" IS NOT NULL)=("dispatchState" IS NOT NULL)),
 CHECK((state='SETTLED')=("settledAt" IS NOT NULL))
);
CREATE FUNCTION guard_sweep_dispatch_authorization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SWEEP_AUTH_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','settledAt','consumedAt','claimId','dispatchState']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','settledAt','consumedAt','claimId','dispatchState'])
 OR (OLD."claimId" IS NOT NULL AND (NEW."claimId" IS DISTINCT FROM OLD."claimId" OR NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt"))
 OR (OLD."dispatchState" IS NULL AND NEW."dispatchState" IS NOT NULL AND NEW."dispatchState"<>'UNKNOWN')
 OR (OLD."dispatchState"='ACKNOWLEDGED' AND NEW."dispatchState" IS DISTINCT FROM OLD."dispatchState")
 OR (OLD."dispatchState"='UNKNOWN' AND NEW."dispatchState" IS NULL)
 OR (OLD.state='SETTLED' AND (NEW.state<>'SETTLED' OR NEW."settledAt" IS DISTINCT FROM OLD."settledAt"))
 THEN RAISE EXCEPTION 'SWEEP_AUTH_IMMUTABLE'; END IF;
 IF NEW.state='SETTLED' AND NOT EXISTS(SELECT 1 FROM "SweepConfirmation" c JOIN "SignedSweepOutbox" s ON s.id=c."sweepId" WHERE s.id=NEW."sweepId" AND s.state='CONFIRMED') THEN RAISE EXCEPTION 'SWEEP_FINAL_EVIDENCE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_sweep_dispatch_authorization BEFORE UPDATE OR DELETE ON "SweepDispatchAuthorization" FOR EACH ROW EXECUTE FUNCTION guard_sweep_dispatch_authorization();
CREATE TABLE "FinancialWorkerLease" (
 id TEXT PRIMARY KEY CHECK(id='outbox'),"claimId" UUID,"expiresAt" TIMESTAMPTZ,
 "cursorTime" TIMESTAMP(3),"cursorId" UUID,"cursorKind" TEXT CHECK("cursorKind" IN ('PAYOUT','SWEEP')),
 CHECK(("cursorTime" IS NULL)=("cursorId" IS NULL)),CHECK(("cursorId" IS NULL)=("cursorKind" IS NULL)),
 CHECK(("claimId" IS NULL)=("expiresAt" IS NULL))
);
INSERT INTO "FinancialWorkerLease"(id) VALUES('outbox');
DO $$ DECLARE t TEXT; r TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['SweepDispatchAuthorization','FinancialWorkerLease'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON %I FROM %I',t,r); END IF;
 END LOOP; END LOOP;
END $$;
