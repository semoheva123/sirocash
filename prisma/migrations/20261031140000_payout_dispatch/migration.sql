-- Prepared only. A separate reviewed resource/budget authority must provision approvals.
CREATE TABLE "PayoutDispatchApproval" (
 "payoutId" UUID PRIMARY KEY REFERENCES "SignedWithdrawalOutbox"(id) ON DELETE RESTRICT,
 "txId" TEXT NOT NULL,
 "payloadHash" TEXT NOT NULL CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
 "authorityReference" TEXT NOT NULL UNIQUE CHECK (length("authorityReference") BETWEEN 8 AND 200),
 "maxNativeFeeBaseUnits" NUMERIC(78,0) NOT NULL CHECK ("maxNativeFeeBaseUnits">0),
 "approvedAt" TIMESTAMPTZ NOT NULL,
 "expiresAt" TIMESTAMPTZ NOT NULL,
 "consumedAt" TIMESTAMPTZ,
 CHECK ("expiresAt">"approvedAt")
);
CREATE TABLE "PayoutDispatchAttempt" (
 "payoutId" UUID PRIMARY KEY REFERENCES "PayoutDispatchApproval"("payoutId") ON DELETE RESTRICT,
 "claimId" UUID NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (state IN ('UNKNOWN','ACKNOWLEDGED')),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "acknowledgedAt" TIMESTAMPTZ,
 CHECK ((state='ACKNOWLEDGED')=("acknowledgedAt" IS NOT NULL))
);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['PayoutDispatchApproval','PayoutDispatchAttempt'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN EXECUTE format('REVOKE ALL ON %I FROM sirocash_app',t); END IF;
 END LOOP;
END $$;
