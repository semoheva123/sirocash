-- Prepared only. Preserve historical TRON identities; isolate replay protection by network.
ALTER TABLE "ChainDepositInbox" ADD COLUMN network TEXT NOT NULL DEFAULT 'TRC20' CHECK (network IN ('TRC20','BEP20'));
ALTER TABLE "ChainDepositInbox" ALTER COLUMN network DROP DEFAULT;
ALTER TABLE "ChainDepositInbox" DROP CONSTRAINT "ChainDepositInbox_txId_logIndex_key";
ALTER TABLE "ChainDepositInbox" ADD CONSTRAINT "ChainDepositInbox_network_txId_logIndex_key" UNIQUE (network,"txId","logIndex");
ALTER TABLE "UserDepositAddress" ADD CONSTRAINT "UserDepositAddress_id_network_key" UNIQUE(id,network);
ALTER TABLE "ChainDepositInbox" DROP CONSTRAINT "ChainDepositInbox_addressId_fkey";
ALTER TABLE "ChainDepositInbox" ADD CONSTRAINT "ChainDepositInbox_addressId_network_fkey" FOREIGN KEY ("addressId",network) REFERENCES "UserDepositAddress"(id,network) ON DELETE RESTRICT;
