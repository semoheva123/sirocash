-- Sanitized backend-only collection outcomes; no keys or provider body storage.
ALTER TABLE public."ExchangeReference" ADD COLUMN "lastOutcome" text,
 ADD COLUMN "lastHttpStatus" integer, ADD COLUMN "lastIssues" jsonb;
