-- Staged: no login provisioning or activation. Every external send remains claim-before-effect.
CREATE TABLE "NativeGasOutbox" (
 id UUID PRIMARY KEY,"addressId" UUID NOT NULL REFERENCES "UserDepositAddress"(id),
 "requestKey" TEXT NOT NULL UNIQUE,"tokenAmount" NUMERIC(78,0) NOT NULL CHECK("tokenAmount">0),
 sender TEXT NOT NULL,recipient TEXT NOT NULL,nonce BIGINT NOT NULL CHECK(nonce>=0),
 "fundingAmount" NUMERIC(78,0) NOT NULL CHECK("fundingAmount">0),"maxFee" NUMERIC(78,0) NOT NULL CHECK("maxFee">0),
 expense NUMERIC(78,0) NOT NULL CHECK(expense="fundingAmount"+"maxFee"),
 "txId" TEXT NOT NULL UNIQUE,"signedPayload" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'SIGNED' CHECK(state IN ('SIGNED','UNKNOWN','ACKNOWLEDGED','CONFIRMED')),
 "claimId" UUID UNIQUE,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "confirmedAt" TIMESTAMPTZ,"blockNumber" BIGINT,"blockHash" TEXT,
 CHECK((state='SIGNED')=("claimId" IS NULL)),
 CHECK((state='CONFIRMED')=("confirmedAt" IS NOT NULL AND "blockNumber" IS NOT NULL AND "blockHash" IS NOT NULL)),
 UNIQUE(sender,nonce)
);
CREATE UNIQUE INDEX native_gas_unresolved ON "NativeGasOutbox"(sender) WHERE state<>'CONFIRMED';
CREATE FUNCTION guard_native_gas_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['state','claimId','confirmedAt','blockNumber','blockHash']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','claimId','confirmedAt','blockNumber','blockHash'])
 OR (OLD."claimId" IS NOT NULL AND NEW."claimId" IS DISTINCT FROM OLD."claimId")
 OR (OLD.state='SIGNED' AND NEW.state<>'UNKNOWN')
 OR (OLD.state='UNKNOWN' AND NEW.state NOT IN ('ACKNOWLEDGED','CONFIRMED'))
 OR (OLD.state='ACKNOWLEDGED' AND NEW.state<>'CONFIRMED')
 OR OLD.state='CONFIRMED' THEN RAISE EXCEPTION 'NATIVE_GAS_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_native_gas BEFORE UPDATE OR DELETE ON "NativeGasOutbox" FOR EACH ROW EXECUTE FUNCTION guard_native_gas_outbox();
CREATE TABLE "DispatchApprovalHistory" (
 id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('PAYOUT','SWEEP')),"outboxId" UUID NOT NULL,
 previous JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_dispatch_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'DISPATCH_HISTORY_IMMUTABLE'; END $$;
CREATE TRIGGER immutable_dispatch_history BEFORE UPDATE OR DELETE ON "DispatchApprovalHistory" FOR EACH ROW EXECUTE FUNCTION guard_dispatch_history();
-- Audit-only refresh of evidence before the first claim; signed bytes/budget never change.
CREATE OR REPLACE FUNCTION guard_sweep_dispatch_authorization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SWEEP_AUTH_IMMUTABLE'; END IF;
 IF ROW(NEW."evidenceHash",NEW.evidence,NEW."approvedAt",NEW."expiresAt") IS DISTINCT FROM ROW(OLD."evidenceHash",OLD.evidence,OLD."approvedAt",OLD."expiresAt") THEN
  IF OLD."claimId" IS NOT NULL OR OLD.state<>'HELD' OR OLD."expiresAt">clock_timestamp()
  OR NEW."approvedAt">clock_timestamp() OR NEW."approvedAt"<clock_timestamp()-interval '30 seconds'
  OR NEW."expiresAt"<=clock_timestamp() OR NEW."expiresAt">NEW."approvedAt"+interval '30 seconds'
  OR NOT EXISTS(SELECT 1 FROM "DispatchApprovalHistory" WHERE kind='SWEEP' AND "outboxId"=OLD."sweepId" AND previous=to_jsonb(OLD))
  THEN RAISE EXCEPTION 'SWEEP_REFRESH_UNSAFE'; END IF;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['state','settledAt','consumedAt','claimId','dispatchState','evidenceHash','evidence','approvedAt','expiresAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','settledAt','consumedAt','claimId','dispatchState','evidenceHash','evidence','approvedAt','expiresAt'])
 OR (OLD."claimId" IS NOT NULL AND (NEW."claimId" IS DISTINCT FROM OLD."claimId" OR NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt"))
 OR (OLD."dispatchState" IS NULL AND NEW."dispatchState" IS NOT NULL AND NEW."dispatchState"<>'UNKNOWN')
 OR (OLD."dispatchState"='ACKNOWLEDGED' AND NEW."dispatchState" IS DISTINCT FROM OLD."dispatchState")
 OR (OLD."dispatchState"='UNKNOWN' AND NEW."dispatchState" IS NULL)
 OR (OLD.state='SETTLED' AND (NEW.state<>'SETTLED' OR NEW."settledAt" IS DISTINCT FROM OLD."settledAt")) THEN RAISE EXCEPTION 'SWEEP_AUTH_IMMUTABLE'; END IF;
 IF NEW.state='SETTLED' AND NOT EXISTS(SELECT 1 FROM "SweepConfirmation" c JOIN "SignedSweepOutbox" s ON s.id=c."sweepId" WHERE s.id=NEW."sweepId" AND s.state='CONFIRMED') THEN RAISE EXCEPTION 'SWEEP_FINAL_EVIDENCE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE "FinancialWorkerLease" DROP CONSTRAINT "FinancialWorkerLease_cursorKind_check";
ALTER TABLE "FinancialWorkerLease" ADD CONSTRAINT "FinancialWorkerLease_cursorKind_check" CHECK("cursorKind" IN ('ENERGY','PAYOUT','SWEEP','GAS','PREPARE_PAYOUT','PREPARE_SWEEP'));
DO $$ DECLARE t TEXT;r TEXT;BEGIN
 FOREACH t IN ARRAY ARRAY['NativeGasOutbox','DispatchApprovalHistory'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON %I FROM %I',t,r);END IF;
 END LOOP;
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON "NativeGasOutbox" TO sirocash_financial_worker;
CREATE POLICY financial_native ON "NativeGasOutbox" TO sirocash_financial_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON "DispatchApprovalHistory" TO sirocash_financial_worker;
CREATE POLICY financial_dispatch_history ON "DispatchApprovalHistory" TO sirocash_financial_worker USING(true) WITH CHECK(true);
-- Row locking a spend-policy row may not modify its limits.
GRANT UPDATE(network) ON "PayoutExpensePolicy" TO sirocash_financial_worker;
CREATE POLICY financial_expense_lock ON "PayoutExpensePolicy" FOR UPDATE TO sirocash_financial_worker USING(true) WITH CHECK(false);
CREATE FUNCTION guard_payout_dispatch_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['consumedAt','authorityReference','approvedAt','expiresAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['consumedAt','authorityReference','approvedAt','expiresAt']) OR (OLD."consumedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'PAYOUT_APPROVAL_IMMUTABLE'; END IF;
 IF ROW(NEW."authorityReference",NEW."approvedAt",NEW."expiresAt") IS DISTINCT FROM ROW(OLD."authorityReference",OLD."approvedAt",OLD."expiresAt") AND
 (OLD."consumedAt" IS NOT NULL OR OLD."expiresAt">clock_timestamp() OR NEW."approvedAt">clock_timestamp() OR NEW."approvedAt"<clock_timestamp()-interval '30 seconds' OR NEW."expiresAt"<=clock_timestamp() OR NEW."expiresAt">NEW."approvedAt"+interval '30 seconds'
 OR NOT EXISTS(SELECT 1 FROM "DispatchApprovalHistory" WHERE kind='PAYOUT' AND "outboxId"=OLD."payoutId" AND previous->'approval'=to_jsonb(OLD))) THEN RAISE EXCEPTION 'PAYOUT_REFRESH_UNSAFE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_payout_dispatch_approval BEFORE UPDATE OR DELETE ON "PayoutDispatchApproval" FOR EACH ROW EXECUTE FUNCTION guard_payout_dispatch_approval();
CREATE OR REPLACE FUNCTION guard_signed_withdrawal_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN
  IF OLD.network='TRC20' AND OLD.state='SIGNED' AND NEW.state='SIGNED'
  AND (to_jsonb(NEW)-ARRAY['fingerprint','txId','signedPayload'])=(to_jsonb(OLD)-ARRAY['fingerprint','txId','signedPayload'])
  AND (OLD."signedPayload"::jsonb#>>'{raw_data,expiration}')::numeric<=extract(epoch FROM clock_timestamp())*1000
  AND NOT EXISTS(SELECT 1 FROM "PayoutDispatchAttempt" WHERE "payoutId"=OLD.id)
  AND NOT EXISTS(SELECT 1 FROM "PayoutDispatchApproval" WHERE "payoutId"=OLD.id AND "consumedAt" IS NOT NULL)
  AND EXISTS(SELECT 1 FROM "DispatchApprovalHistory" WHERE kind='PAYOUT' AND "outboxId"=OLD.id AND previous->'signature'=to_jsonb(OLD)) THEN RETURN NEW;END IF;
  RAISE EXCEPTION 'IMMUTABLE_SIGNED_WITHDRAWAL';
 END IF;
 IF NEW.state IS DISTINCT FROM OLD.state AND NOT(OLD.state IN ('SIGNED','BROADCAST_UNKNOWN') AND NEW.state IN ('BROADCAST_UNKNOWN','CONFIRMED','REJECTED')) THEN RAISE EXCEPTION 'INVALID_PAYOUT_STATE_TRANSITION';END IF;
 IF NEW.state IS DISTINCT FROM OLD.state THEN
  IF NEW.state='REJECTED' THEN RAISE EXCEPTION 'PAYOUT_REJECTION_PROOF_NOT_IMPLEMENTED';END IF;
  IF NEW.state='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM "PayoutConfirmation" c WHERE c."payoutId"=NEW.id AND c.evidence->>'network'=NEW.network AND c.evidence->>'txId'=lower(regexp_replace(NEW."txId",'^0x','')) AND c.evidence->>'from'=NEW.sender AND c.evidence->>'to'=NEW.recipient AND c.evidence->>'amountBaseUnits'=NEW."amountBaseUnits"::text) THEN RAISE EXCEPTION 'PAYOUT_FINAL_EVIDENCE_REQUIRED';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_payout_dispatch_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (OLD."consumedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'PAYOUT_APPROVAL_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-ARRAY['consumedAt','authorityReference','approvedAt','expiresAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['consumedAt','authorityReference','approvedAt','expiresAt']) THEN
  IF OLD."consumedAt" IS NULL AND (to_jsonb(NEW)-ARRAY['txId','payloadHash'])=(to_jsonb(OLD)-ARRAY['txId','payloadHash'])
  AND EXISTS(SELECT 1 FROM "DispatchApprovalHistory" h JOIN "SignedWithdrawalOutbox" s ON s.id=h."outboxId" WHERE h.kind='PAYOUT' AND s.id=OLD."payoutId" AND s.network='TRC20' AND s.state='SIGNED' AND h.previous->'approval'=to_jsonb(OLD) AND h.previous->'signature'->>'txId'=OLD."txId" AND s."txId"=NEW."txId") THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'PAYOUT_APPROVAL_IMMUTABLE';
 END IF;
 IF ROW(NEW."authorityReference",NEW."approvedAt",NEW."expiresAt") IS DISTINCT FROM ROW(OLD."authorityReference",OLD."approvedAt",OLD."expiresAt") AND
 (OLD."consumedAt" IS NOT NULL OR OLD."expiresAt">clock_timestamp() OR NEW."approvedAt">clock_timestamp() OR NEW."approvedAt"<clock_timestamp()-interval '30 seconds' OR NEW."expiresAt"<=clock_timestamp() OR NEW."expiresAt">NEW."approvedAt"+interval '30 seconds'
 OR NOT EXISTS(SELECT 1 FROM "DispatchApprovalHistory" WHERE kind='PAYOUT' AND "outboxId"=OLD."payoutId" AND previous->'approval'=to_jsonb(OLD))) THEN RAISE EXCEPTION 'PAYOUT_REFRESH_UNSAFE'; END IF;
 RETURN NEW;
END $$;
-- Same narrowly audited unclaimed signature rebind for sweeps; no consumed claim reset.
CREATE OR REPLACE FUNCTION guard_sweep_dispatch_authorization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SWEEP_AUTH_IMMUTABLE';END IF;
 IF ROW(NEW."txId",NEW."payloadHash") IS DISTINCT FROM ROW(OLD."txId",OLD."payloadHash") THEN
  IF OLD."claimId" IS NULL AND NEW."claimId" IS NULL AND (to_jsonb(NEW)-ARRAY['txId','payloadHash'])=(to_jsonb(OLD)-ARRAY['txId','payloadHash'])
  AND EXISTS(SELECT 1 FROM "DispatchApprovalHistory" h JOIN "SignedSweepOutbox" s ON s.id=h."outboxId" WHERE h.kind='SWEEP' AND s.id=OLD."sweepId" AND s.network='TRC20' AND s.state='SIGNED' AND h.previous->'authorization'=to_jsonb(OLD) AND h.previous->'signature'->>'txId'=OLD."txId" AND s."txId"=NEW."txId") THEN RETURN NEW;END IF;
  RAISE EXCEPTION 'SWEEP_AUTH_IMMUTABLE';
 END IF;
 IF ROW(NEW."evidenceHash",NEW.evidence,NEW."approvedAt",NEW."expiresAt") IS DISTINCT FROM ROW(OLD."evidenceHash",OLD.evidence,OLD."approvedAt",OLD."expiresAt") THEN
  IF OLD."claimId" IS NOT NULL OR OLD.state<>'HELD' OR OLD."expiresAt">clock_timestamp() OR NEW."approvedAt">clock_timestamp() OR NEW."approvedAt"<clock_timestamp()-interval '30 seconds' OR NEW."expiresAt"<=clock_timestamp() OR NEW."expiresAt">NEW."approvedAt"+interval '30 seconds'
  OR NOT EXISTS(SELECT 1 FROM "DispatchApprovalHistory" WHERE kind='SWEEP' AND "outboxId"=OLD."sweepId" AND previous=to_jsonb(OLD)) THEN RAISE EXCEPTION 'SWEEP_REFRESH_UNSAFE';END IF;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['state','settledAt','consumedAt','claimId','dispatchState','evidenceHash','evidence','approvedAt','expiresAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','settledAt','consumedAt','claimId','dispatchState','evidenceHash','evidence','approvedAt','expiresAt'])
 OR (OLD."claimId" IS NOT NULL AND (NEW."claimId" IS DISTINCT FROM OLD."claimId" OR NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt"))
 OR (OLD."dispatchState" IS NULL AND NEW."dispatchState" IS NOT NULL AND NEW."dispatchState"<>'UNKNOWN')
 OR (OLD."dispatchState"='ACKNOWLEDGED' AND NEW."dispatchState" IS DISTINCT FROM OLD."dispatchState") OR (OLD."dispatchState"='UNKNOWN' AND NEW."dispatchState" IS NULL)
 OR (OLD.state='SETTLED' AND (NEW.state<>'SETTLED' OR NEW."settledAt" IS DISTINCT FROM OLD."settledAt")) THEN RAISE EXCEPTION 'SWEEP_AUTH_IMMUTABLE';END IF;
 IF NEW.state='SETTLED' AND NOT EXISTS(SELECT 1 FROM "SweepConfirmation" c JOIN "SignedSweepOutbox" s ON s.id=c."sweepId" WHERE s.id=NEW."sweepId" AND s.state='CONFIRMED') THEN RAISE EXCEPTION 'SWEEP_FINAL_EVIDENCE_REQUIRED';END IF;
 RETURN NEW;
END $$;
-- An active sender can still lack bandwidth. One bound resource-bundle order handles both.
ALTER TABLE "EnergyRentalIntent" ADD COLUMN "bandwidthAmount" INTEGER NOT NULL DEFAULT 0 CHECK("bandwidthAmount">=0);
ALTER TABLE "EnergyPurchaseAttempt" ADD COLUMN "bandwidthAmount" INTEGER NOT NULL DEFAULT 0 CHECK("bandwidthAmount">=0);
