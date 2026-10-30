-- Keep all existing invariants; require a sender for outgoing provider services.
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_check1";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_check1" CHECK (
 ("type" = 'P2P' AND "senderId" IS NOT NULL AND "receiverId" IS NOT NULL)
 OR ("type" = 'DEPOSIT' AND "receiverId" IS NOT NULL)
 OR ("type" IN ('WITHDRAWAL','SHAM_CASH','MOBILE_TOPUP') AND "senderId" IS NOT NULL)
);
