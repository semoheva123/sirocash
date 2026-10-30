ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "EmailChallenge" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "EmailChallenge" ADD COLUMN purpose TEXT NOT NULL DEFAULT 'legacy';
-- Invalidate old passwordless challenges. Never set/replace a password on email-only login.
DELETE FROM "EmailChallenge";
ALTER TABLE "EmailChallenge" ADD CONSTRAINT "EmailChallenge_purpose_check" CHECK (purpose IN ('legacy','signup','login'));
