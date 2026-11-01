-- Staging only: no public provisioning route or signing permissions.
CREATE TABLE "DepositAddressVault" (
 id UUID PRIMARY KEY,
 network TEXT NOT NULL CHECK (network='TRC20'),
 "accountXpub" TEXT NOT NULL UNIQUE CHECK ("accountXpub" LIKE 'xpub%'),
 "originVerified" BOOLEAN NOT NULL DEFAULT false,
 "nextIndex" BIGINT NOT NULL DEFAULT 0 CHECK ("nextIndex" BETWEEN 0 AND 2147483648),
 enabled BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "UserDepositAddress" (
 id UUID PRIMARY KEY,
 "ownerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "vaultId" UUID NOT NULL REFERENCES "DepositAddressVault"(id) ON DELETE RESTRICT,
 network TEXT NOT NULL CHECK (network='TRC20'),
 address TEXT NOT NULL UNIQUE,
 "derivationIndex" BIGINT NOT NULL CHECK ("derivationIndex" BETWEEN 0 AND 2147483647),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE ("ownerId",network),
 UNIQUE ("vaultId","derivationIndex")
);
ALTER TABLE "DepositAddressVault" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserDepositAddress" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DepositAddressVault","UserDepositAddress" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN
 REVOKE ALL ON "DepositAddressVault","UserDepositAddress" FROM sirocash_app;
 END IF;
END $$;
