-- Prepared only. A terminal outbox flag alone must never unlock financial settlement.
CREATE OR REPLACE FUNCTION guard_signed_withdrawal_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN RAISE EXCEPTION 'IMMUTABLE_SIGNED_WITHDRAWAL'; END IF;
 IF NEW.state IS DISTINCT FROM OLD.state THEN
  IF NOT (OLD.state IN ('SIGNED','BROADCAST_UNKNOWN') AND NEW.state IN ('BROADCAST_UNKNOWN','CONFIRMED','REJECTED')) THEN RAISE EXCEPTION 'INVALID_PAYOUT_STATE_TRANSITION'; END IF;
  -- Definitive failed-execution proof/cost accounting is not implemented. Never release on a flag.
  IF NEW.state='REJECTED' THEN RAISE EXCEPTION 'PAYOUT_REJECTION_PROOF_NOT_IMPLEMENTED'; END IF;
  IF NEW.state='CONFIRMED' AND NOT EXISTS (
   SELECT 1 FROM "PayoutConfirmation" c WHERE c."payoutId"=NEW.id
    AND c.evidence->>'network'=NEW.network
    AND c.evidence->>'txId'=lower(regexp_replace(NEW."txId",'^0x',''))
    AND c.evidence->>'from'=NEW.sender AND c.evidence->>'to'=NEW.recipient
    AND c.evidence->>'amountBaseUnits'=NEW."amountBaseUnits"::text
  ) THEN RAISE EXCEPTION 'PAYOUT_FINAL_EVIDENCE_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_signed_withdrawal_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE payout RECORD; BEGIN
 IF NEW.state IN ('COMPLETED','FAILED') AND NEW.state IS DISTINCT FROM OLD.state THEN
  SELECT * INTO payout FROM "SignedWithdrawalOutbox" WHERE "operationId"=NEW.id;
  IF FOUND THEN
   IF NEW.state='FAILED' THEN RAISE EXCEPTION 'PAYOUT_REJECTION_PROOF_NOT_IMPLEMENTED'; END IF;
   IF payout.state<>'CONFIRMED' OR NEW."externalReference" IS DISTINCT FROM ('payout:'||payout.network||':'||payout."txId") OR
      NOT EXISTS (SELECT 1 FROM "PayoutConfirmation" c WHERE c."payoutId"=payout.id) THEN
    RAISE EXCEPTION 'SIGNED_PAYOUT_RECONCILIATION_REQUIRED';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_signed_withdrawal_identity(),guard_signed_withdrawal_settlement() FROM PUBLIC;
