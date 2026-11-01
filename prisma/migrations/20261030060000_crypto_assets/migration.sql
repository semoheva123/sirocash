ALTER TABLE "DepositAddress" ADD COLUMN asset "CryptoAsset" NOT NULL DEFAULT 'USDT';
ALTER TABLE "DepositAddress" DROP CONSTRAINT "DepositAddress_userId_chain_key";
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_userId_chain_asset_key" UNIQUE ("userId",chain,asset);
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_asset_network_check" CHECK (
 (asset='USDT' AND chain IN ('TRC20','BEP20')) OR (asset='USDC' AND chain IN ('ETHEREUM','POLYGON'))
);
-- Legacy transaction rows retain null metadata rather than guessing their network.
ALTER TABLE "Transaction" ADD COLUMN "cryptoAsset" "CryptoAsset";
ALTER TABLE "Transaction" ADD COLUMN "cryptoChain" "Chain";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_crypto_metadata_check" CHECK (
 ("cryptoAsset" IS NULL AND "cryptoChain" IS NULL) OR
 ("type" IN ('DEPOSIT','WITHDRAWAL') AND "cryptoAsset" IS NOT NULL AND "cryptoChain" IS NOT NULL AND (
  ("cryptoAsset"='USDT' AND "cryptoChain" IN ('TRC20','BEP20')) OR
  ("cryptoAsset"='USDC' AND "cryptoChain" IN ('ETHEREUM','POLYGON'))
 ))
);
-- Financial intent includes asset and network, and is immutable after creation.
CREATE OR REPLACE FUNCTION guard_transaction_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Transactions are immutable'; END IF;
 IF OLD."status" <> 'PENDING' OR NEW."amount" <> OLD."amount" OR NEW."type" <> OLD."type"
 OR NEW."senderId" IS DISTINCT FROM OLD."senderId" OR NEW."receiverId" IS DISTINCT FROM OLD."receiverId"
 OR NEW."cryptoAsset" IS DISTINCT FROM OLD."cryptoAsset" OR NEW."cryptoChain" IS DISTINCT FROM OLD."cryptoChain"
 OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."id" <> OLD."id"
 THEN RAISE EXCEPTION 'Invalid transaction mutation'; END IF;
 RETURN NEW;
END $$;
