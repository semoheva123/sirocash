-- SELECT FOR UPDATE of owner rows is required before account creation/account locks.
-- UPDATE(id) supplies only the locking privilege; RLS denies actual worker user writes.
GRANT UPDATE(id) ON "User" TO sirocash_financial_worker;
CREATE POLICY financial_worker_owner_lock ON "User" FOR UPDATE TO sirocash_financial_worker USING(true) WITH CHECK(false);
-- Worker journal permissions must be exercised with RLS, not just checked with LIMIT 0.
GRANT UPDATE(id) ON "LedgerAccount" TO sirocash_financial_worker;
CREATE POLICY financial_worker_ledger_read ON "LedgerAccount" FOR SELECT TO sirocash_financial_worker USING(true);
CREATE POLICY financial_worker_ledger_insert ON "LedgerAccount" FOR INSERT TO sirocash_financial_worker WITH CHECK(true);
CREATE POLICY financial_worker_ledger_lock ON "LedgerAccount" FOR UPDATE TO sirocash_financial_worker USING(true) WITH CHECK(false);
CREATE POLICY financial_worker_entries ON "LedgerEntry" TO sirocash_financial_worker USING(true) WITH CHECK(true);
CREATE POLICY financial_worker_transactions ON "Transaction" TO sirocash_financial_worker USING(true) WITH CHECK(true);
REVOKE UPDATE ON "Transaction" FROM sirocash_financial_worker;
GRANT UPDATE(status) ON "Transaction" TO sirocash_financial_worker;
-- Only this existing ledger-insert trigger may update balance caches. Do not grant direct balance writes.
ALTER FUNCTION post_ledger_delta() SECURITY DEFINER;
ALTER FUNCTION post_ledger_delta() SET search_path=pg_catalog,public,pg_temp;
REVOKE ALL ON FUNCTION post_ledger_delta() FROM PUBLIC,sirocash_financial_worker;
