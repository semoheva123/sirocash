ALTER TABLE "AuthSession" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "AuthSession" ADD COLUMN "deviceLabel" TEXT;
CREATE TABLE "AccountSecurityChallenge" (
 id TEXT PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK (purpose IN ('recovery','email_change')),
 "oldEmail" TEXT NOT NULL,
 "oldPasswordHash" TEXT NOT NULL,
 "sessionHash" TEXT,
 "newEmail" TEXT,
 "codeHash" TEXT NOT NULL,
 "secondCodeHash" TEXT,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 "expiresAt" TIMESTAMP(3) NOT NULL,
 CHECK ((purpose='recovery' AND "sessionHash" IS NULL AND "newEmail" IS NULL AND "secondCodeHash" IS NULL) OR
        (purpose='email_change' AND "sessionHash" IS NOT NULL AND "newEmail" IS NOT NULL AND "secondCodeHash" IS NOT NULL))
);
CREATE INDEX "AccountSecurityChallenge_userId_idx" ON "AccountSecurityChallenge"("userId");
CREATE INDEX "AccountSecurityChallenge_expiresAt_idx" ON "AccountSecurityChallenge"("expiresAt");
CREATE TABLE "SecurityEvent" (
 id TEXT PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK (kind IN ('sign_in','password_changed','password_recovered','email_changed','session_revoked','sessions_revoked','operations_view')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId","createdAt");
CREATE TABLE "SecurityNotification" (
 id TEXT PRIMARY KEY REFERENCES "SecurityEvent"(id) ON DELETE RESTRICT,
 recipient TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "deliveredAt" TIMESTAMP(3)
);
CREATE INDEX "SecurityNotification_nextAttemptAt_idx" ON "SecurityNotification"("nextAttemptAt");
ALTER TABLE "AccountSecurityChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecurityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecurityNotification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AccountSecurityChallenge","SecurityEvent","SecurityNotification" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "AccountSecurityChallenge","SecurityEvent","SecurityNotification" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "AccountSecurityChallenge","SecurityEvent","SecurityNotification" FROM authenticated; END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AccountSecurityChallenge" TO sirocash_app;
GRANT SELECT, INSERT ON "SecurityEvent" TO sirocash_app;
GRANT SELECT, INSERT, UPDATE ON "SecurityNotification" TO sirocash_app;
GRANT UPDATE (email,"emailVerifiedAt") ON "User" TO sirocash_app;
CREATE POLICY security_challenge_runtime ON "AccountSecurityChallenge" FOR ALL TO sirocash_app USING (true) WITH CHECK (true);
CREATE POLICY security_event_runtime ON "SecurityEvent" FOR ALL TO sirocash_app USING (true) WITH CHECK (true);
CREATE POLICY security_notification_runtime ON "SecurityNotification" FOR ALL TO sirocash_app USING (true) WITH CHECK (true);
