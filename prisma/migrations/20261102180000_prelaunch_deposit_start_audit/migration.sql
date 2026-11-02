-- Admin-only record of explicitly authorized prelaunch initialization.
-- Deliberately grants NO reset capability to application or financial workers.
CREATE TABLE "PrelaunchDepositStartAudit" (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 "addressId" UUID NOT NULL REFERENCES "UserDepositAddress"(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(reason='PRELAUNCH_UNUSED_ADDRESS'),
 "beforeState" JSONB NOT NULL,
 "afterState" JSONB NOT NULL,
 evidence JSONB NOT NULL
);
ALTER TABLE "PrelaunchDepositStartAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PrelaunchDepositStartAudit" FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
