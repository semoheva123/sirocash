ALTER TABLE "User" ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "pinHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN email TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_email_key" ON "User"(email);
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK (email IS NULL OR email=lower(trim(email)));
CREATE TABLE "AuthSession" (
 "tokenHash" TEXT PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE TABLE "EmailChallenge" (
 id TEXT PRIMARY KEY,email TEXT NOT NULL,"codeHash" TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),"expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "EmailChallenge_email_idx" ON "EmailChallenge"(email);
CREATE INDEX "EmailChallenge_expiresAt_idx" ON "EmailChallenge"("expiresAt");
CREATE TABLE "EmailRateLimit" (
 id TEXT PRIMARY KEY,"lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01',
 "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,count INTEGER NOT NULL DEFAULT 0
);
