import type {WalletTx} from './wallet-engine';
/** Caller authenticates a durable session and supplies its user ID, never client JSON.
 * Execute within one REPEATABLE READ transaction for a coherent balance/holds/history view. */
export async function readFinancialSnapshot(tx:WalletTx,ownerId:string){
   const {rows:[balance]}=await tx.query(`SELECT COALESCE(a.balance,0)::text AS posted,COALESCE((SELECT SUM(w.amount) FROM "WalletOperation" w WHERE w."ownerId"=$1 AND w.kind='WITHDRAWAL' AND w.state IN ('RESERVED','SUBMITTED')),0)::text AS held FROM (SELECT $1::uuid AS owner) u LEFT JOIN "LedgerAccount" a ON a."userId"=u.owner AND a."accountType"='USER' AND a.currency='USD'`,[ownerId]);
   const {rows:operations}=await tx.query('SELECT id,kind,amount::text,"feeAmount"::text,state,"createdAt" FROM "WalletOperation" WHERE "ownerId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT 30',[ownerId]);
   const {rows:activity}=await tx.query(`SELECT t.id,e.amount::text,t.type,t.status,t."createdAt" FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a.id=e."accountId" JOIN "Transaction" t ON t.id=e."transactionId" WHERE a."userId"=$1 AND a."accountType"='USER' AND a.currency='USD' ORDER BY t."createdAt" DESC,t.id DESC LIMIT 30`,[ownerId]);
   return {balance,operations,activity};
}
