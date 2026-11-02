-- One-use, short-lived scheduler capabilities. Never store the bearer token.
-- Only the isolated deposit-monitor endpoint can consume these capabilities.
CREATE TABLE "DepositMonitorTicket" (
 "tokenHash" TEXT PRIMARY KEY CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 "expiresAt" TIMESTAMPTZ NOT NULL,
 "usedAt" TIMESTAMPTZ,
 "requestId" BIGINT,
 CHECK ("expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '3 minutes')
);
CREATE TABLE "DepositMonitorSchedule" (
 id INTEGER PRIMARY KEY CHECK (id=1),
 enabled BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "DepositMonitorSchedule" VALUES (1,false);
ALTER TABLE "DepositMonitorTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DepositMonitorSchedule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DepositMonitorTicket","DepositMonitorSchedule" FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
CREATE FUNCTION public.consume_deposit_monitor_ticket(token_hash TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE accepted BOOLEAN;
BEGIN
 IF token_hash IS NULL OR token_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."DepositMonitorSchedule" WHERE id=1 AND enabled) THEN RETURN false; END IF;
 UPDATE public."DepositMonitorTicket" SET "usedAt"=clock_timestamp()
 WHERE "tokenHash"=token_hash AND "usedAt" IS NULL AND "expiresAt">clock_timestamp()
 RETURNING true INTO accepted;
 RETURN COALESCE(accepted,false);
END $$;
REVOKE ALL ON FUNCTION public.consume_deposit_monitor_ticket(TEXT) FROM PUBLIC,anon,authenticated,sirocash_app;
GRANT EXECUTE ON FUNCTION public.consume_deposit_monitor_ticket(TEXT) TO sirocash_financial_worker;
