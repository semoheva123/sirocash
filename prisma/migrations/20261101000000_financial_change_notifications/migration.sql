-- Notifications are invalidations ONLY: no balances, tokens, email or transaction contents.
-- PostgreSQL releases NOTIFY at COMMIT and discards it at ROLLBACK.
CREATE FUNCTION public.financial_notify_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
 IF TG_TABLE_NAME='Transaction' THEN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  FOR owner_id IN SELECT DISTINCT a."userId" FROM public."LedgerEntry" e JOIN public."LedgerAccount" a ON a.id=e."accountId" WHERE e."transactionId"=NEW.id AND a."accountType"='USER' AND a."userId" IS NOT NULL LOOP
   PERFORM pg_notify('siro_financial_changes',json_build_object('ownerId',owner_id)::text);
  END LOOP;
 ELSE
  IF TG_TABLE_NAME='AuthSession' THEN
   IF TG_OP='DELETE' THEN owner_id=OLD."userId"; ELSE owner_id=NEW."userId"; END IF;
  ELSIF TG_TABLE_NAME='WalletOperation' THEN owner_id=NEW."ownerId";
  ELSIF NEW."accountType"='USER' THEN owner_id=NEW."userId";
  END IF;
  IF owner_id IS NOT NULL THEN PERFORM pg_notify('siro_financial_changes',json_build_object('ownerId',owner_id)::text); END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.financial_notify_change() FROM PUBLIC;
CREATE TRIGGER financial_balance_event AFTER INSERT OR UPDATE ON public."LedgerAccount" FOR EACH ROW EXECUTE FUNCTION public.financial_notify_change();
CREATE TRIGGER financial_operation_event AFTER INSERT OR UPDATE ON public."WalletOperation" FOR EACH ROW EXECUTE FUNCTION public.financial_notify_change();
CREATE TRIGGER financial_transaction_event AFTER UPDATE ON public."Transaction" FOR EACH ROW EXECUTE FUNCTION public.financial_notify_change();
CREATE TRIGGER financial_session_event AFTER UPDATE OR DELETE ON public."AuthSession" FOR EACH ROW EXECUTE FUNCTION public.financial_notify_change();
