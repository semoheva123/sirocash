-- Public receiving identity is separate from accounting/authentication identifiers.
CREATE FUNCTION public.wallet_uid_digit(prefix text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE total integer:=0; n integer; i integer;
BEGIN
 IF prefix !~ '^[1-9][0-9]{8}$' THEN RETURN NULL; END IF;
 FOR i IN 1..9 LOOP n:=substring(prefix,i,1)::integer;
 IF i%2=1 THEN n:=n*2; IF n>9 THEN n:=n-9; END IF; END IF; total:=total+n;
 END LOOP; RETURN ((10-total%10)%10)::text;
END $$;
CREATE TABLE public."ReceivingIdentity" (
 "userId" uuid PRIMARY KEY REFERENCES public."User"(id) ON DELETE RESTRICT,
 uid text NOT NULL UNIQUE CHECK(uid ~ '^[1-9][0-9]{9}$' AND right(uid,1)=public.wallet_uid_digit(left(uid,9))),
 "displayName" text CHECK("displayName" IS NULL OR (char_length("displayName") BETWEEN 2 AND 60 AND "displayName"=btrim("displayName"))),
 username text UNIQUE CHECK(username IS NULL OR username ~ '^[a-z][a-z0-9_]{3,23}$'),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public."ReceivingIdentityBudget" (
 "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('lookup','profile')),
 "windowStart" timestamptz NOT NULL, count integer NOT NULL CHECK(count>0), PRIMARY KEY("userId",action)
);
CREATE FUNCTION public.issue_receiving_identity(owner_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prefix text;
BEGIN
 -- Serialize lazy/backfill and registration on the same stable owner.
 PERFORM 1 FROM public."User" WHERE id=owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public."ReceivingIdentity" WHERE "userId"=owner_id) THEN RETURN; END IF;
 FOR attempt IN 1..32 LOOP
  -- gen_random_uuid is cryptographically random. Never use a sequence or Math.random.
  prefix:=((((('x'||left(replace(gen_random_uuid()::text,'-',''),15))::bit(60)::bigint)%900000000)+100000000))::text;
  BEGIN
   INSERT INTO public."ReceivingIdentity"("userId",uid) VALUES(owner_id,prefix||public.wallet_uid_digit(prefix)); RETURN;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
 END LOOP; RAISE EXCEPTION 'UID_ALLOCATION_FAILED';
END $$;
CREATE FUNCTION public.provision_receiving_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM public.issue_receiving_identity(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER provision_receiving_identity AFTER INSERT ON public."User" FOR EACH ROW EXECUTE FUNCTION public.provision_receiving_identity();
DO $$ DECLARE owner_id uuid; BEGIN FOR owner_id IN SELECT id FROM public."User" ORDER BY id LOOP PERFORM public.issue_receiving_identity(owner_id); END LOOP; END $$;
CREATE FUNCTION public.guard_receiving_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RECEIVING_IDENTITY_PERMANENT'; END IF;
 IF NEW."userId"<>OLD."userId" OR NEW.uid<>OLD.uid OR NEW."createdAt"<>OLD."createdAt" OR (OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username) THEN RAISE EXCEPTION 'RECEIVING_IDENTITY_IMMUTABLE'; END IF;
 NEW."updatedAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER immutable_receiving_identity BEFORE UPDATE OR DELETE ON public."ReceivingIdentity" FOR EACH ROW EXECUTE FUNCTION public.guard_receiving_identity();
CREATE FUNCTION public.receiving_identity_budget(owner_id uuid,kind text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE allowed boolean; cap integer;
BEGIN
 IF kind NOT IN ('lookup','profile') THEN RETURN false; END IF;
 cap:=CASE WHEN kind='lookup' THEN 10 ELSE 5 END;
 INSERT INTO public."ReceivingIdentityBudget"("userId",action,"windowStart",count) VALUES(owner_id,kind,date_trunc('minute',statement_timestamp()),1)
 ON CONFLICT("userId",action) DO UPDATE SET "windowStart"=EXCLUDED."windowStart",count=CASE WHEN "ReceivingIdentityBudget"."windowStart"=EXCLUDED."windowStart" THEN "ReceivingIdentityBudget".count+1 ELSE 1 END
 WHERE "ReceivingIdentityBudget"."windowStart"<>EXCLUDED."windowStart" OR "ReceivingIdentityBudget".count<cap RETURNING true INTO allowed;
 RETURN coalesce(allowed,false);
END $$;
ALTER TABLE public."ReceivingIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReceivingIdentityBudget" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ReceivingIdentity",public."ReceivingIdentityBudget" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_uid_digit(text),public.issue_receiving_identity(uuid),public.provision_receiving_identity(),public.guard_receiving_identity(),public.receiving_identity_budget(uuid,text) FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON public."ReceivingIdentity",public."ReceivingIdentityBudget" FROM %I',r);
 EXECUTE format('REVOKE ALL ON FUNCTION public.wallet_uid_digit(text),public.issue_receiving_identity(uuid),public.provision_receiving_identity(),public.guard_receiving_identity(),public.receiving_identity_budget(uuid,text) FROM %I',r);
 END IF; END LOOP;
END $$;
GRANT SELECT ON public."ReceivingIdentity" TO sirocash_app,sirocash_financial_worker;
GRANT UPDATE("displayName",username) ON public."ReceivingIdentity" TO sirocash_app;
GRANT SELECT("kycStatus") ON public."User" TO sirocash_app;
GRANT EXECUTE ON FUNCTION public.wallet_uid_digit(text),public.receiving_identity_budget(uuid,text) TO sirocash_app,sirocash_financial_worker;
CREATE POLICY backend_receiving_identity ON public."ReceivingIdentity" TO sirocash_app USING(true) WITH CHECK(true);
CREATE POLICY financial_receiving_identity ON public."ReceivingIdentity" FOR SELECT TO sirocash_financial_worker USING(true);
