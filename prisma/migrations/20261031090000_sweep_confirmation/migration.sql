-- Prepared only. Successful final evidence audit, not a broadcast/ledger permission.
CREATE TABLE "SweepConfirmation" (
 "sweepId" UUID PRIMARY KEY REFERENCES "SignedSweepOutbox"(id) ON DELETE RESTRICT,
 fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 evidence JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "SweepConfirmation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SweepConfirmation" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN REVOKE ALL ON "SweepConfirmation" FROM sirocash_app; END IF;
END $$;
