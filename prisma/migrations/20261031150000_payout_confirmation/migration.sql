-- Prepared only. Final successful evidence and financial posting are composed atomically.
CREATE TABLE "PayoutConfirmation" (
 "payoutId" UUID PRIMARY KEY REFERENCES "SignedWithdrawalOutbox"(id) ON DELETE RESTRICT,
 fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 evidence JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "PayoutConfirmation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PayoutConfirmation" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN REVOKE ALL ON "PayoutConfirmation" FROM sirocash_app; END IF;
END $$;
CREATE FUNCTION reject_payout_confirmation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'IMMUTABLE_PAYOUT_CONFIRMATION';
END $$;
CREATE TRIGGER immutable_payout_confirmation BEFORE UPDATE OR DELETE ON "PayoutConfirmation" FOR EACH ROW EXECUTE FUNCTION reject_payout_confirmation_mutation();
REVOKE ALL ON FUNCTION reject_payout_confirmation_mutation() FROM PUBLIC;
