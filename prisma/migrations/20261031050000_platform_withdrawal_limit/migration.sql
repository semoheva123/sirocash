-- Singleton lock serializes all wallet-engine withdrawal reservations across networks.
CREATE TABLE "PlatformWithdrawalGuard" (
 id INTEGER PRIMARY KEY CHECK (id=1)
);
INSERT INTO "PlatformWithdrawalGuard" (id) VALUES (1);
ALTER TABLE "PlatformWithdrawalGuard" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlatformWithdrawalGuard" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN
 REVOKE ALL ON "PlatformWithdrawalGuard" FROM sirocash_app;
 END IF;
END $$;
