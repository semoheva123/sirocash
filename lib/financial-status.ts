import type {WalletTx} from './wallet-engine';
/** Caller authenticates a durable session and supplies its user ID, never client JSON.
 * Execute within one REPEATABLE READ transaction for a coherent balance/holds/history view. */
export async function readFinancialSnapshot(tx:WalletTx,ownerId:string){
   const {rows:[balance]}=await tx.query(`SELECT COALESCE(a.balance,0)::text AS posted,COALESCE((SELECT SUM(w.amount) FROM "WalletOperation" w WHERE w."ownerId"=$1 AND w.kind='WITHDRAWAL' AND w.state IN ('RESERVED','SUBMITTED')),0)::text AS held FROM (SELECT $1::uuid AS owner) u LEFT JOIN "LedgerAccount" a ON a."userId"=u.owner AND a."accountType"='USER' AND a.currency='USD'`,[ownerId]);
   const parties=`s.uid AS "senderUid",s."displayName" AS "senderName",s.username AS "senderUsername",r.uid AS "recipientUid",r."displayName" AS "recipientName",r.username AS "recipientUsername"`;
   const joins=`LEFT JOIN "ReceivingIdentity" s ON t.type='P2P' AND s."userId"=t."senderId" LEFT JOIN "ReceivingIdentity" r ON t.type='P2P' AND r."userId"=t."receiverId"`;
   const {rows:operations}=await tx.query(`SELECT w.id,w.kind,w.amount::text,w."feeAmount"::text,w.state,w."createdAt",q.network,q.recipient,q."grossTokens"::text,q."feeTokens"::text,q."netTokens"::text,${parties} FROM "WalletOperation" w LEFT JOIN "UsdtWithdrawalQuote" q ON q."operationId"=w.id AND q."ownerId"=w."ownerId" AND w.kind='WITHDRAWAL' LEFT JOIN "Transaction" t ON w.kind='TRANSFER' AND t.id=w."transactionId" ${joins} WHERE w."ownerId"=$1 ORDER BY w."createdAt" DESC,w.id DESC LIMIT 30`,[ownerId]);
   const {rows:activity}=await tx.query(`SELECT t.id,e.amount::text,t.type,t.status,t."createdAt",${parties} FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a.id=e."accountId" JOIN "Transaction" t ON t.id=e."transactionId" ${joins} WHERE a."userId"=$1 AND a."accountType"='USER' AND a.currency='USD' ORDER BY t."createdAt" DESC,t.id DESC LIMIT 30`,[ownerId]);
   const {rows:deposits}=await tx.query('SELECT d.id,d.network,d."txId",d."amountBaseUnits"::text,d.state,d."createdAt",a.address AS recipient,d.sender FROM "ChainDepositInbox" d JOIN "UserDepositAddress" a ON a.id=d."addressId" AND a.network=d.network WHERE a."ownerId"=$1 ORDER BY d."createdAt" DESC,d.id DESC LIMIT 30',[ownerId]);
   const {rows:payouts}=await tx.query('SELECT p.id,p."operationId",p.network,p."txId",p.state,p."createdAt",p.sender,p.recipient,p."amountBaseUnits"::text FROM "SignedWithdrawalOutbox" p JOIN "WalletOperation" w ON w.id=p."operationId" WHERE w."ownerId"=$1 ORDER BY p."createdAt" DESC,p.id DESC LIMIT 30',[ownerId]);
   const {rows:addresses}=await tx.query('SELECT network,address FROM "UserDepositAddress" WHERE "ownerId"=$1 ORDER BY network',[ownerId]);
   return {balance,operations,activity,deposits,payouts,addresses};
}
