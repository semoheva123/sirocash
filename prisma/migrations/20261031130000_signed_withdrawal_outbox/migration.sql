-- Prepared only. No broadcast route, signing activation or runtime finance grants.
CREATE TABLE "WithdrawalSigningGuard" (
 network TEXT PRIMARY KEY CHECK (network IN ('TRC20','BEP20'))
);
INSERT INTO "WithdrawalSigningGuard" VALUES ('TRC20'),('BEP20');
CREATE TABLE "SignedWithdrawalOutbox" (
 id UUID PRIMARY KEY,
 "quoteId" UUID NOT NULL UNIQUE REFERENCES "UsdtWithdrawalQuote"(id) ON DELETE RESTRICT,
 "operationId" UUID NOT NULL UNIQUE REFERENCES "WalletOperation"(id) ON DELETE RESTRICT,
 network TEXT NOT NULL REFERENCES "WithdrawalSigningGuard"(network),
 sender TEXT NOT NULL,
 recipient TEXT NOT NULL,
 "amountBaseUnits" NUMERIC(78,0) NOT NULL CHECK ("amountBaseUnits">0),
 fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 "txId" TEXT NOT NULL UNIQUE,
 "signedPayload" TEXT NOT NULL,
 "senderNonce" BIGINT,
 state TEXT NOT NULL DEFAULT 'SIGNED' CHECK (state IN ('SIGNED','BROADCAST_UNKNOWN','CONFIRMED','REJECTED')),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((network='BEP20' AND "senderNonce" IS NOT NULL AND "senderNonce">=0) OR (network='TRC20' AND "senderNonce" IS NULL))
);
-- Deliberately one unresolved operating payout per NETWORK, even across key rotation.
CREATE UNIQUE INDEX payout_network_unresolved ON "SignedWithdrawalOutbox" (network) WHERE state IN ('SIGNED','BROADCAST_UNKNOWN');
CREATE UNIQUE INDEX payout_sender_nonce ON "SignedWithdrawalOutbox" (network,sender,"senderNonce") WHERE "senderNonce" IS NOT NULL;
CREATE FUNCTION guard_signed_withdrawal_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN RAISE EXCEPTION 'IMMUTABLE_SIGNED_WITHDRAWAL'; END IF;
 IF NEW.state IS DISTINCT FROM OLD.state AND NOT
  (OLD.state IN ('SIGNED','BROADCAST_UNKNOWN') AND NEW.state IN ('BROADCAST_UNKNOWN','CONFIRMED','REJECTED')) THEN RAISE EXCEPTION 'INVALID_PAYOUT_STATE_TRANSITION'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_signed_withdrawal BEFORE UPDATE ON "SignedWithdrawalOutbox" FOR EACH ROW EXECUTE FUNCTION guard_signed_withdrawal_identity();
-- Once a signature exists, generic provider flags/timeouts cannot release the hold.
CREATE FUNCTION guard_signed_withdrawal_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE payout RECORD; BEGIN
 IF NEW.state IN ('COMPLETED','FAILED') AND NEW.state IS DISTINCT FROM OLD.state THEN
  SELECT * INTO payout FROM "SignedWithdrawalOutbox" WHERE "operationId"=NEW.id;
  IF FOUND AND (payout.state<>(CASE WHEN NEW.state='COMPLETED' THEN 'CONFIRMED' ELSE 'REJECTED' END) OR
    NEW."externalReference" IS DISTINCT FROM ('payout:'||payout.network||':'||payout."txId")) THEN
   RAISE EXCEPTION 'SIGNED_PAYOUT_RECONCILIATION_REQUIRED';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER signed_withdrawal_settlement BEFORE UPDATE ON "WalletOperation" FOR EACH ROW EXECUTE FUNCTION guard_signed_withdrawal_settlement();
REVOKE ALL ON FUNCTION guard_signed_withdrawal_identity(),guard_signed_withdrawal_settlement() FROM PUBLIC;
ALTER TABLE "WithdrawalSigningGuard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignedWithdrawalOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WithdrawalSigningGuard","SignedWithdrawalOutbox" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN REVOKE ALL ON "WithdrawalSigningGuard","SignedWithdrawalOutbox" FROM sirocash_app; END IF;
END $$;
