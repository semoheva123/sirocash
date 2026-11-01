-- Extend customer invalidations to observed deposits and signed payout state transitions.
-- Payloads remain owner UUID only; never transmit signed payloads, keys or vault metadata.
CREATE FUNCTION public.financial_notify_network_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
 IF TG_TABLE_NAME='ChainDepositInbox' THEN
  SELECT a."ownerId" INTO owner_id FROM public."UserDepositAddress" a WHERE a.id=NEW."addressId" AND a.network=NEW.network;
 ELSIF TG_TABLE_NAME='SignedWithdrawalOutbox' THEN
  SELECT w."ownerId" INTO owner_id FROM public."WalletOperation" w WHERE w.id=NEW."operationId";
 ELSIF TG_TABLE_NAME='UserDepositAddress' THEN owner_id=NEW."ownerId";
 END IF;
 IF owner_id IS NOT NULL THEN PERFORM pg_notify('siro_financial_changes',json_build_object('ownerId',owner_id)::text); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.financial_notify_network_change() FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
CREATE TRIGGER financial_deposit_event AFTER INSERT OR UPDATE ON public."ChainDepositInbox" FOR EACH ROW EXECUTE FUNCTION public.financial_notify_network_change();
CREATE TRIGGER financial_payout_event AFTER INSERT OR UPDATE ON public."SignedWithdrawalOutbox" FOR EACH ROW EXECUTE FUNCTION public.financial_notify_network_change();
CREATE TRIGGER financial_address_event AFTER INSERT ON public."UserDepositAddress" FOR EACH ROW EXECUTE FUNCTION public.financial_notify_network_change();
