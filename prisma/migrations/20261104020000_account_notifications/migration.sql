-- Durable, content-minimal inbox. No mail delivery claims, message bodies or amounts.
CREATE TABLE public."AccountNotification" (
 id text PRIMARY KEY, "ownerId" uuid REFERENCES public."User"(id) ON DELETE RESTRICT,
 staff boolean NOT NULL DEFAULT false, kind text NOT NULL, reference text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(), CHECK(("ownerId" IS NULL)=staff)
);
CREATE INDEX account_notification_owner ON public."AccountNotification"("ownerId","createdAt" DESC,id DESC);
CREATE INDEX account_notification_staff ON public."AccountNotification"("createdAt" DESC,id DESC) WHERE staff;
CREATE TABLE public."AccountNotificationRead" (
 "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "notificationId" text NOT NULL REFERENCES public."AccountNotification"(id) ON DELETE RESTRICT,
 "readAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY("userId","notificationId")
);
ALTER TABLE public."AccountNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AccountNotificationRead" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AccountNotification",public."AccountNotificationRead" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_financial_worker'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON public."AccountNotification",public."AccountNotificationRead" FROM %I',r); END IF;
 END LOOP;
END $$;
GRANT SELECT ON public."AccountNotification" TO sirocash_app;
GRANT SELECT,INSERT ON public."AccountNotificationRead" TO sirocash_app;
CREATE POLICY notification_backend ON public."AccountNotification" TO sirocash_app USING(true);
CREATE POLICY notification_read_backend ON public."AccountNotificationRead" TO sirocash_app USING(true) WITH CHECK(true);
CREATE FUNCTION public.account_notification_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid; is_staff boolean:=false; event_kind text; event_id text; ref text;
BEGIN
 IF TG_TABLE_NAME='SupportMessage' THEN
  SELECT "ownerId" INTO owner_id FROM public."SupportTicket" WHERE id=NEW."ticketId";
  ref:=NEW."ticketId"::text; event_id:='support:'||NEW.id::text;
  IF NEW."fromSupport" THEN event_kind:='SUPPORT_REPLY'; ELSE owner_id:=NULL;is_staff:=true;event_kind:='SUPPORT_MESSAGE'; END IF;
 ELSIF TG_TABLE_NAME='SupportTicket' THEN
  IF NEW.status<>'CLOSED' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  owner_id:=NEW."ownerId";ref:=NEW.id::text;event_id:='closed:'||ref;event_kind:='SUPPORT_CLOSED';
 ELSIF TG_TABLE_NAME='SecurityEvent' THEN
  IF NEW.kind='operations_view' THEN RETURN NEW; END IF;
  owner_id:=NEW."userId";ref:=NEW.id::text;event_id:='security:'||ref;event_kind:='SECURITY_'||NEW.kind;
 ELSIF TG_TABLE_NAME='ChainDepositInbox' THEN
  SELECT a."ownerId" INTO owner_id FROM public."UserDepositAddress" a WHERE a.id=NEW."addressId" AND a.network=NEW.network;
  ref:=NEW.id::text;event_kind:='DEPOSIT_OBSERVED';event_id:='observed:'||ref;
 ELSIF TG_TABLE_NAME='WalletOperation' THEN
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN RETURN NEW; END IF;
  owner_id:=NEW."ownerId";ref:=NEW.id::text;event_kind:='OPERATION_'||NEW.kind||'_'||NEW.state;event_id:='operation:'||ref||':'||NEW.state;
 END IF;
 IF owner_id IS NOT NULL OR is_staff THEN
  INSERT INTO public."AccountNotification"(id,"ownerId",staff,kind,reference) VALUES(event_id,owner_id,is_staff,event_kind,ref) ON CONFLICT DO NOTHING;
 END IF;
 IF TG_TABLE_NAME='WalletOperation' THEN
  IF NEW.kind='TRANSFER' AND NEW.state='COMPLETED' THEN
   INSERT INTO public."AccountNotification"(id,"ownerId",kind,reference) VALUES('received:'||NEW.id::text,NEW."counterpartyId",'TRANSFER_RECEIVED',NEW.id::text) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.account_notification_invalidate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id text;
BEGIN
 IF TG_TABLE_NAME='AccountNotificationRead' THEN owner_id:=NEW."userId"::text;
 ELSIF TG_TABLE_NAME='AuthSession' THEN
  IF TG_OP='DELETE' THEN owner_id:=OLD."userId"::text; ELSE owner_id:=NEW."userId"::text; END IF;
 ELSE owner_id:=CASE WHEN NEW.staff THEN 'support-staff' ELSE NEW."ownerId"::text END;
 END IF;
 PERFORM pg_notify('siro_account_notifications',json_build_object('ownerId',owner_id)::text);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.account_notification_event(),public.account_notification_invalidate() FROM PUBLIC,anon,authenticated,sirocash_app,sirocash_financial_worker;
CREATE TRIGGER account_support_message AFTER INSERT ON public."SupportMessage" FOR EACH ROW EXECUTE FUNCTION public.account_notification_event();
CREATE TRIGGER account_support_closed AFTER UPDATE ON public."SupportTicket" FOR EACH ROW EXECUTE FUNCTION public.account_notification_event();
CREATE TRIGGER account_security_event AFTER INSERT ON public."SecurityEvent" FOR EACH ROW EXECUTE FUNCTION public.account_notification_event();
CREATE TRIGGER account_operation_event AFTER UPDATE ON public."WalletOperation" FOR EACH ROW EXECUTE FUNCTION public.account_notification_event();
CREATE TRIGGER account_notification_changed AFTER INSERT ON public."AccountNotification" FOR EACH ROW EXECUTE FUNCTION public.account_notification_invalidate();
CREATE TRIGGER account_notification_read AFTER INSERT ON public."AccountNotificationRead" FOR EACH ROW EXECUTE FUNCTION public.account_notification_invalidate();
CREATE TRIGGER account_notification_session AFTER UPDATE OR DELETE ON public."AuthSession" FOR EACH ROW EXECUTE FUNCTION public.account_notification_invalidate();
CREATE TRIGGER account_deposit_observed AFTER INSERT ON public."ChainDepositInbox" FOR EACH ROW EXECUTE FUNCTION public.account_notification_event();
