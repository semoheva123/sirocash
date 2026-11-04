-- Approved additive metadata only. No backfill, ledger writes, role grants or network I/O.
-- Apply transactionally; fail quickly rather than wait behind live financial work.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE public."ChainDepositInbox" ADD COLUMN sender TEXT;
-- NOT VALID avoids scanning historical rows; new writes are still checked.
ALTER TABLE public."ChainDepositInbox" ADD CONSTRAINT "deposit_sender_network_format"
 CHECK (sender IS NULL OR (network='TRC20' AND sender ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$') OR (network='BEP20' AND sender ~ '^0x[0-9a-fA-F]{40}$')) NOT VALID;
CREATE FUNCTION public.financial_deposit_sender_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF NEW.sender IS DISTINCT FROM OLD.sender THEN
  RAISE EXCEPTION 'DEPOSIT_SENDER_IMMUTABLE';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.financial_deposit_sender_immutable() FROM PUBLIC;
-- Hosted default function privileges may name roles directly, not only PUBLIC.
DO $$ DECLARE role_name TEXT; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','sirocash_app','sirocash_financial_worker','service_role'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.financial_deposit_sender_immutable() FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
CREATE TRIGGER financial_deposit_sender_immutable BEFORE UPDATE OF sender ON public."ChainDepositInbox"
 FOR EACH ROW EXECUTE FUNCTION public.financial_deposit_sender_immutable();
