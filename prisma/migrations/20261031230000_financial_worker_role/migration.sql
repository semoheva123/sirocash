-- Staged dedicated financial role, deliberately NOLOGIN until a separate credential is provisioned.
-- Never grant this role to sirocash_app, anon or authenticated. No superuser or RLS bypass.
CREATE ROLE sirocash_financial_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO sirocash_financial_worker;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['WalletOperation','EnergyRentalIntent','ChainDepositInbox','SignedSweepOutbox','SweepConfirmation','ApprovedDepositValuation','UsdtWithdrawalQuote','SignedWithdrawalOutbox','PayoutDispatchApproval','PayoutDispatchAttempt','PayoutConfirmation','PayoutExpenseReservation','EnergyPurchaseAttempt','SweepDispatchAuthorization','FinancialWorkerLease'] LOOP
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO sirocash_financial_worker',t);
 EXECUTE format('CREATE POLICY financial_worker_write ON %I TO sirocash_financial_worker USING(true) WITH CHECK(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['DepositAddressVault','UserDepositAddress','PlatformWithdrawalGuard','WithdrawalSigningGuard','PayoutExpensePolicy','EnergyPurchasePolicy','DurablePaymentApproval'] LOOP
 EXECUTE format('GRANT SELECT ON %I TO sirocash_financial_worker',t);
 EXECUTE format('CREATE POLICY financial_worker_read ON %I FOR SELECT TO sirocash_financial_worker USING(true)',t);
 END LOOP;
END $$;
GRANT UPDATE(enabled) ON "EnergyPurchasePolicy" TO sirocash_financial_worker;
CREATE POLICY financial_worker_trip ON "EnergyPurchasePolicy" FOR UPDATE TO sirocash_financial_worker USING(true) WITH CHECK(enabled=false);
GRANT SELECT(id,"emailVerifiedAt","kycStatus") ON "User" TO sirocash_financial_worker;
CREATE POLICY financial_worker_user ON "User" FOR SELECT TO sirocash_financial_worker USING(true);
GRANT SELECT,INSERT ON "LedgerAccount","LedgerEntry" TO sirocash_financial_worker;
GRANT SELECT,INSERT,UPDATE ON "Transaction" TO sirocash_financial_worker;
-- Existing ledger invariants/triggers remain authoritative; no delete/truncate/trigger grants.
-- SELECT FOR UPDATE needs an UPDATE privilege/policy, but must not permit actual writes.
GRANT UPDATE(id) ON "DepositAddressVault","UserDepositAddress","PlatformWithdrawalGuard" TO sirocash_financial_worker;
GRANT UPDATE(network) ON "WithdrawalSigningGuard" TO sirocash_financial_worker;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['DepositAddressVault','UserDepositAddress','PlatformWithdrawalGuard','WithdrawalSigningGuard'] LOOP
 EXECUTE format('CREATE POLICY financial_worker_lock ON %I FOR UPDATE TO sirocash_financial_worker USING(true) WITH CHECK(false)',t);
 END LOOP;
END $$;
-- Recovery may advance lifecycle only, never rewrite the bound operation or purchase budget.
REVOKE UPDATE ON "EnergyRentalIntent" FROM sirocash_financial_worker;
GRANT UPDATE(state,"providerOrderId","updatedAt") ON "EnergyRentalIntent" TO sirocash_financial_worker;
