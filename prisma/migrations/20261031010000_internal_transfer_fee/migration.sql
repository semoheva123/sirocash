-- Prepared only; historical operations retain their original zero fee.
ALTER TABLE "WalletOperation" ADD COLUMN "feeAmount" NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK ("feeAmount">=0);
ALTER TABLE "WalletOperation" ADD COLUMN "feeAccountId" UUID REFERENCES "LedgerAccount"(id) ON DELETE RESTRICT;
ALTER TABLE "WalletOperation" ADD CONSTRAINT wallet_transfer_fee CHECK (
 ("kind"='TRANSFER' AND (("feeAmount"=0 AND "feeAccountId" IS NULL) OR ("feeAmount">0 AND "feeAccountId" IS NOT NULL AND "feeAmount"=ceil(amount*1000000/100)/1000000)))
 OR ("kind"<>'TRANSFER' AND "feeAmount"=0 AND "feeAccountId" IS NULL)
);
