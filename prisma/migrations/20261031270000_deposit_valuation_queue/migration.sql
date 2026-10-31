ALTER TABLE "FinancialWorkerLease" DROP CONSTRAINT "FinancialWorkerLease_cursorKind_check";
ALTER TABLE "FinancialWorkerLease" ADD CONSTRAINT "FinancialWorkerLease_cursorKind_check" CHECK("cursorKind" IN ('ENERGY','PAYOUT','SWEEP','GAS','PREPARE_PAYOUT','PREPARE_SWEEP','DEPOSIT_VALUE'));
