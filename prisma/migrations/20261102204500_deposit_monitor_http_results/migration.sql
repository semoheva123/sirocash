-- Transient dispatch material stays in the private RLS table, never pg_net's queue.
ALTER TABLE "DepositMonitorTicket"
 ADD COLUMN "dispatchToken" TEXT CHECK ("dispatchToken" IS NULL OR "dispatchToken" ~ '^[a-f0-9]{64}$'),
 ADD COLUMN "completedAt" TIMESTAMPTZ,
 ADD COLUMN "httpStatus" INTEGER,
 ADD COLUMN "resultState" TEXT CHECK ("resultState" IS NULL OR "resultState"='COMPLETED'),
 ADD COLUMN healthy BOOLEAN,
 ADD COLUMN "failureCode" TEXT CHECK ("failureCode" IS NULL OR "failureCode" IN ('HTTP_FAILURE','TRANSPORT_FAILED','INVALID_RESULT'));
CREATE OR REPLACE FUNCTION public.consume_deposit_monitor_ticket(token_hash TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE accepted BOOLEAN;
BEGIN
 IF token_hash IS NULL OR token_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."DepositMonitorSchedule" WHERE id=1 AND enabled) THEN RETURN false; END IF;
 UPDATE public."DepositMonitorTicket" SET "usedAt"=clock_timestamp(),"dispatchToken"=NULL
 WHERE "tokenHash"=token_hash AND "usedAt" IS NULL AND "expiresAt">clock_timestamp()
 RETURNING true INTO accepted;
 RETURN COALESCE(accepted,false);
END $$;
REVOKE ALL ON FUNCTION public.consume_deposit_monitor_ticket(TEXT) FROM PUBLIC,anon,authenticated,sirocash_app;
GRANT EXECUTE ON FUNCTION public.consume_deposit_monitor_ticket(TEXT) TO sirocash_financial_worker;
