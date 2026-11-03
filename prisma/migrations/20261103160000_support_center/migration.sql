CREATE TABLE public."SupportTicket" (
 id uuid PRIMARY KEY, "ownerId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 subject text NOT NULL CHECK(char_length(subject) BETWEEN 4 AND 120),
 category text NOT NULL CHECK(category IN ('ACCOUNT','DEPOSIT','TRANSFER','OTHER')),
 status text NOT NULL DEFAULT 'WAITING_SUPPORT' CHECK(status IN ('WAITING_SUPPORT','WAITING_CUSTOMER','CLOSED')),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_owner_updated ON public."SupportTicket"("ownerId","updatedAt" DESC,id DESC);
CREATE INDEX support_queue_updated ON public."SupportTicket"("updatedAt" DESC,id DESC);
CREATE TABLE public."SupportMessage" (
 id uuid PRIMARY KEY, "ticketId" uuid NOT NULL REFERENCES public."SupportTicket"(id) ON DELETE RESTRICT,
 "authorId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 "fromSupport" boolean NOT NULL, body text NOT NULL CHECK(char_length(body) BETWEEN 2 AND 4000),
 "requestKey" uuid NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("authorId","requestKey")
);
CREATE INDEX support_message_page ON public."SupportMessage"("ticketId","createdAt" DESC,id DESC);
CREATE TABLE public."SupportBudget" (
 "userId" uuid PRIMARY KEY REFERENCES public."User"(id) ON DELETE RESTRICT,
 minute timestamptz NOT NULL, "minuteCount" integer NOT NULL,
 day timestamptz NOT NULL, "dayCount" integer NOT NULL
);
ALTER TABLE public."SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupportMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupportBudget" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SupportTicket",public."SupportMessage",public."SupportBudget" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON public."SupportTicket",public."SupportMessage",public."SupportBudget" FROM %I',r);
 END IF; END LOOP;
END $$;
GRANT SELECT,INSERT ON public."SupportTicket",public."SupportMessage",public."SupportBudget" TO sirocash_app;
GRANT UPDATE(status,"updatedAt") ON public."SupportTicket" TO sirocash_app;
GRANT UPDATE ON public."SupportBudget" TO sirocash_app;
CREATE POLICY support_backend_ticket ON public."SupportTicket" TO sirocash_app USING(true) WITH CHECK(true);
CREATE POLICY support_backend_message ON public."SupportMessage" TO sirocash_app USING(true) WITH CHECK(true);
CREATE POLICY support_backend_budget ON public."SupportBudget" TO sirocash_app USING(true) WITH CHECK(true);
