-- Operator-reviewed native-unit budgets; disabled by default, no inferred USD cap.
CREATE TABLE "PayoutExpensePolicy" (
 network TEXT PRIMARY KEY REFERENCES "WithdrawalSigningGuard"(network),
 enabled BOOLEAN NOT NULL DEFAULT false,
 "perPayoutCap" NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK ("perPayoutCap">=0),
 "dailyCap" NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK ("dailyCap">=0),
 CHECK (NOT enabled OR ("perPayoutCap">0 AND "dailyCap">="perPayoutCap"))
);
INSERT INTO "PayoutExpensePolicy" (network) VALUES ('TRC20'),('BEP20');
CREATE TABLE "PayoutExpenseReservation" (
 "payoutId" UUID PRIMARY KEY REFERENCES "SignedWithdrawalOutbox"(id) ON DELETE RESTRICT,
 network TEXT NOT NULL REFERENCES "PayoutExpensePolicy"(network),
 "amountBaseUnits" NUMERIC(78,0) NOT NULL CHECK ("amountBaseUnits">0),
 "evidenceHash" TEXT NOT NULL CHECK ("evidenceHash" ~ '^[a-f0-9]{64}$'),
 evidence JSONB NOT NULL,
 state TEXT NOT NULL DEFAULT 'HELD' CHECK (state IN ('HELD','SETTLED')),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "settledAt" TIMESTAMPTZ,
 CHECK ((state='SETTLED')=("settledAt" IS NOT NULL))
);
CREATE INDEX payout_expense_network_state ON "PayoutExpenseReservation" (network,state);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['PayoutExpensePolicy','PayoutExpenseReservation'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN EXECUTE format('REVOKE ALL ON %I FROM sirocash_app',t); END IF;
 END LOOP;
END $$;
