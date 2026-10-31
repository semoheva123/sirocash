-- Hosted default function grants can grant anon/authenticated EXECUTE directly,
-- independently of PUBLIC. The financial role is the only bridge caller.
REVOKE ALL ON FUNCTION public.financial_assert_session(uuid,text),public.financial_consume_approval(uuid,text,text,text,text) FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sirocash_app'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON FUNCTION public.financial_assert_session(uuid,text),public.financial_consume_approval(uuid,text,text,text,text) FROM %I',r);
 END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.financial_assert_session(uuid,text),public.financial_consume_approval(uuid,text,text,text,text) TO sirocash_financial_worker;
