-- Supabase may grant direct default privileges to API roles. RLS is not the only boundary.
-- No finance runtime grant, key import, vault activation or customer-data mutation.
DO $$ DECLARE t TEXT; r TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['WalletOperation','EnergyRentalIntent','DepositAddressVault','UserDepositAddress','ChainDepositInbox','PlatformWithdrawalGuard','SignedSweepOutbox','SweepConfirmation','DurablePasskeyCredential','DurablePasskeyChallenge','DurablePaymentApproval','ApprovedDepositValuation','UsdtWithdrawalQuote','WithdrawalSigningGuard','SignedWithdrawalOutbox','PayoutDispatchApproval','PayoutDispatchAttempt','PayoutConfirmation','PayoutExpensePolicy','PayoutExpenseReservation'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r); END IF;
  END LOOP;
 END LOOP;
END $$;
