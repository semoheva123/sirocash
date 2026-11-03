-- Separate explicitly authorized TLS collector; legacy browser-triggered path stays paused.
ALTER TABLE public."ExchangeReference"
 ADD COLUMN "collectorEnabled" boolean NOT NULL DEFAULT false,
 ADD COLUMN "collectorBlockedUntil" timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN "lastCollectionSlot" text;
-- Preserve month, attempts, snapshot and original infinite pause. No re-arm on redeploy.
UPDATE public."ExchangeReference" SET "collectorEnabled"=true
 WHERE id='sp-today' AND "lastOutcome"='API_TLS_COMPLETE' AND "lastHttpStatus"=200
 AND "lastIssues"->>'experiment'='api-tls-20261103'
 AND "lastIssues"->'check'->>'apiOk'='true'
 AND "lastIssues"->'check'->>'challenge'='false';
