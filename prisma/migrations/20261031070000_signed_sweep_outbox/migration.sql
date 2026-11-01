-- Prepared only: no public dispatch route, finance grants or automatic broadcast.
CREATE TABLE "SignedSweepOutbox" (
 id UUID PRIMARY KEY,
 "addressId" UUID NOT NULL REFERENCES "UserDepositAddress"(id) ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL CHECK (length("requestKey") BETWEEN 8 AND 128),
 network TEXT NOT NULL CHECK (network IN ('TRC20','BEP20')),
 fingerprint TEXT NOT NULL,
 "txId" TEXT NOT NULL UNIQUE,
 "signedPayload" TEXT NOT NULL,
 "senderNonce" BIGINT,
 state TEXT NOT NULL DEFAULT 'SIGNED' CHECK (state IN ('SIGNED','BROADCAST_UNKNOWN','CONFIRMED','REJECTED')),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE("addressId","requestKey"),
 CHECK ((network='BEP20' AND "senderNonce" IS NOT NULL AND "senderNonce">=0) OR (network='TRC20' AND "senderNonce" IS NULL))
);
-- Serial source lock plus this index prohibits another unresolved sweep on the same address.
CREATE UNIQUE INDEX sweep_source_unresolved ON "SignedSweepOutbox" ("addressId") WHERE state IN ('SIGNED','BROADCAST_UNKNOWN');
CREATE UNIQUE INDEX sweep_source_nonce ON "SignedSweepOutbox" ("addressId","senderNonce") WHERE "senderNonce" IS NOT NULL;
ALTER TABLE "SignedSweepOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SignedSweepOutbox" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN REVOKE ALL ON "SignedSweepOutbox" FROM sirocash_app; END IF;
END $$;
