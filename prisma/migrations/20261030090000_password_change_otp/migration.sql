CREATE TABLE "PasswordChangeChallenge" (
 id TEXT PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "sessionHash" TEXT NOT NULL,
 "oldPasswordHash" TEXT NOT NULL,
 "newPasswordHash" TEXT NOT NULL,
 "codeHash" TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PasswordChangeChallenge_userId_idx" ON "PasswordChangeChallenge"("userId");
CREATE INDEX "PasswordChangeChallenge_expiresAt_idx" ON "PasswordChangeChallenge"("expiresAt");
ALTER TABLE "PasswordChangeChallenge" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PasswordChangeChallenge" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "PasswordChangeChallenge" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "PasswordChangeChallenge" FROM authenticated; END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PasswordChangeChallenge" TO sirocash_app;
CREATE POLICY password_change_runtime ON "PasswordChangeChallenge" FOR ALL TO sirocash_app USING (true) WITH CHECK (true);
