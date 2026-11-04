ALTER TABLE public."ExchangeReference"
 ADD COLUMN "publicEnabled" boolean NOT NULL DEFAULT true,
 ADD COLUMN "publicNextAttemptAt" timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN "publicNextWakeAt" timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN "publicBlockedUntil" timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN "publicRequestId" uuid,
 ADD COLUMN "publicOutcome" text,
 ADD COLUMN "publicHttpStatus" integer;
INSERT INTO public."ExchangeReference"(id) VALUES('sp-today') ON CONFLICT DO NOTHING;
-- Stop the API path without resetting its budget, pause state or retained snapshot.
UPDATE public."ExchangeReference" SET "collectorEnabled"=false WHERE id='sp-today';
CREATE FUNCTION public.exchange_feed_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.snapshot IS DISTINCT FROM NEW.snapshot THEN
 PERFORM pg_notify('siro_account_notifications','{"ownerId":"exchange-feed"}');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.exchange_feed_changed() FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
CREATE TRIGGER exchange_public_snapshot AFTER UPDATE ON public."ExchangeReference" FOR EACH ROW EXECUTE FUNCTION public.exchange_feed_changed();
