CREATE TYPE "KycStatus" AS ENUM ('UNVERIFIED','PENDING','VERIFIED','REJECTED');
CREATE TYPE "AccountType" AS ENUM ('USER','AGENT','MERCHANT','MASTER_POOL');
CREATE TYPE "TransactionType" AS ENUM ('P2P','DEPOSIT','WITHDRAWAL');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING','COMPLETED','FAILED');
CREATE TYPE "Chain" AS ENUM ('TRC20','BEP20');
CREATE TABLE "User" (
 "id" UUID PRIMARY KEY, "phone" TEXT NOT NULL UNIQUE, "pinHash" TEXT NOT NULL,
 "balance" DECIMAL(20,6) NOT NULL DEFAULT 0 CHECK ("balance" >= 0),
 "kycStatus" "KycStatus" NOT NULL DEFAULT 'UNVERIFIED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "LedgerAccount" (
 "id" UUID PRIMARY KEY, "userId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "accountType" "AccountType" NOT NULL, "balance" DECIMAL(20,6) NOT NULL DEFAULT 0,
 "currency" TEXT NOT NULL DEFAULT 'USD' CHECK ("currency" = 'USD'),
 UNIQUE ("userId", "accountType", "currency"),
 CHECK ("accountType" = 'MASTER_POOL' OR "userId" IS NOT NULL),
 CHECK ("accountType" = 'MASTER_POOL' OR "balance" >= 0)
);
CREATE TABLE "Transaction" (
 "id" UUID PRIMARY KEY, "senderId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "receiverId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "amount" DECIMAL(20,6) NOT NULL CHECK ("amount" > 0), "type" "TransactionType" NOT NULL,
 "txid" TEXT UNIQUE, "idempotencyKey" TEXT NOT NULL UNIQUE,
 "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("senderId" IS NULL OR "receiverId" IS NULL OR "senderId" <> "receiverId"),
 CHECK (("type" = 'P2P' AND "senderId" IS NOT NULL AND "receiverId" IS NOT NULL) OR ("type" = 'DEPOSIT' AND "receiverId" IS NOT NULL) OR ("type" = 'WITHDRAWAL' AND "senderId" IS NOT NULL))
);
CREATE INDEX "Transaction_senderId_createdAt_idx" ON "Transaction"("senderId", "createdAt");
CREATE INDEX "Transaction_receiverId_createdAt_idx" ON "Transaction"("receiverId", "createdAt");
CREATE TABLE "LedgerEntry" (
 "id" UUID PRIMARY KEY, "transactionId" UUID NOT NULL REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "accountId" UUID NOT NULL REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "amount" DECIMAL(20,6) NOT NULL CHECK ("amount" <> 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("transactionId", "accountId")
);
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");
CREATE TABLE "DepositAddress" (
 "id" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "chain" "Chain" NOT NULL, "address" TEXT NOT NULL UNIQUE, "derivationIndex" INTEGER NOT NULL CHECK ("derivationIndex" >= 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("chain", "derivationIndex"), UNIQUE ("userId", "chain")
);
-- Append-only journal: corrections require a new reversing transaction.
CREATE FUNCTION reject_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger entries are immutable'; END $$;
CREATE TRIGGER immutable_journal BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION reject_journal_mutation();
-- Account cache changes are allowed only from the posting trigger.
CREATE FUNCTION guard_balance_cache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' AND NEW."balance" <> 0 THEN RAISE EXCEPTION 'New balances must be zero'; END IF;
 IF TG_OP = 'UPDATE' AND NEW."balance" <> OLD."balance" AND pg_trigger_depth() < 2 THEN RAISE EXCEPTION 'Balances must be changed through journal postings'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_balance_guard BEFORE INSERT OR UPDATE ON "LedgerAccount" FOR EACH ROW EXECUTE FUNCTION guard_balance_cache();
CREATE TRIGGER user_balance_guard BEFORE INSERT OR UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION guard_balance_cache();
CREATE FUNCTION post_ledger_delta() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner UUID; kind "AccountType";
BEGIN
 -- Serialize postings against finalization of their parent transaction.
 PERFORM 1 FROM "Transaction" WHERE "id" = NEW."transactionId" AND "status" = 'PENDING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Post only to pending transactions'; END IF;
 UPDATE "LedgerAccount" SET "balance" = "balance" + NEW."amount" WHERE "id" = NEW."accountId" RETURNING "userId", "accountType" INTO owner, kind;
 IF owner IS NOT NULL THEN UPDATE "User" SET "balance" = "balance" + NEW."amount" WHERE "id" = owner; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER post_delta AFTER INSERT ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION post_ledger_delta();
-- Deferred constraint: all postings and status changes must be in ONE DB transaction.
CREATE FUNCTION assert_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid UUID; n INTEGER; total DECIMAL; positive_total DECIMAL; declared_amount DECIMAL; state "TransactionStatus";
BEGIN
 IF TG_TABLE_NAME = 'LedgerEntry' THEN tid := NEW."transactionId"; ELSE tid := NEW."id"; END IF;
 SELECT "amount", "status" INTO declared_amount, state FROM "Transaction" WHERE "id" = tid;
 SELECT COUNT(*), COALESCE(SUM("amount"),0), COALESCE(SUM("amount") FILTER (WHERE "amount" > 0),0) INTO n,total,positive_total FROM "LedgerEntry" WHERE "transactionId"=tid;
 IF n > 0 AND (n < 2 OR total <> 0 OR positive_total <> declared_amount) THEN RAISE EXCEPTION 'Journal must balance and match transaction amount'; END IF;
 IF state = 'COMPLETED' AND n < 2 THEN RAISE EXCEPTION 'Completed transactions require balanced postings'; END IF;
 IF state = 'FAILED' AND n > 0 THEN RAISE EXCEPTION 'Posted transactions cannot fail; use reversal'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_entries AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_journal();
CREATE CONSTRAINT TRIGGER balanced_transaction AFTER INSERT OR UPDATE ON "Transaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_journal();
CREATE FUNCTION guard_transaction_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Transactions are immutable'; END IF;
 IF OLD."status" <> 'PENDING' OR NEW."amount" <> OLD."amount" OR NEW."type" <> OLD."type" OR NEW."senderId" IS DISTINCT FROM OLD."senderId" OR NEW."receiverId" IS DISTINCT FROM OLD."receiverId" OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."id" <> OLD."id" THEN RAISE EXCEPTION 'Invalid transaction mutation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_transaction BEFORE UPDATE OR DELETE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION guard_transaction_mutation();
