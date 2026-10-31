-- Prepared only. Authentication storage grants do not grant any ledger/dispatch privileges.
CREATE TABLE "DurablePasskeyCredential" (
 id TEXT PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "rpId" TEXT NOT NULL,
 "publicKey" TEXT NOT NULL,
 counter BIGINT NOT NULL CHECK (counter>=0),
 transports JSONB NOT NULL DEFAULT '[]',
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE("userId","rpId")
);
CREATE TABLE "DurablePasskeyChallenge" (
 "sessionHash" TEXT PRIMARY KEY REFERENCES "AuthSession"("tokenHash") ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('register','authenticate')),
 challenge TEXT NOT NULL,
 "rpId" TEXT NOT NULL,
 origin TEXT NOT NULL,
 digest TEXT,
 "expiresAt" TIMESTAMPTZ NOT NULL,
 CHECK ((kind='register' AND digest IS NULL) OR (kind='authenticate' AND digest ~ '^[a-f0-9]{64}$'))
);
CREATE TABLE "DurablePaymentApproval" (
 "tokenHash" TEXT PRIMARY KEY CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
 "sessionHash" TEXT NOT NULL REFERENCES "AuthSession"("tokenHash") ON DELETE CASCADE,
 "credentialId" TEXT NOT NULL REFERENCES "DurablePasskeyCredential"(id) ON DELETE CASCADE,
 digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
 "expiresAt" TIMESTAMPTZ NOT NULL,
 "consumedAt" TIMESTAMPTZ,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX durable_approval_session ON "DurablePaymentApproval"("sessionHash");
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['DurablePasskeyCredential','DurablePasskeyChallenge','DurablePaymentApproval'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO sirocash_app',t);
   EXECUTE format('CREATE POLICY durable_passkey_backend ON %I TO sirocash_app USING (true) WITH CHECK (true)',t);
  END IF;
 END LOOP;
END $$;
