import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {getAddress} from 'ethers';
import {validTronAddress} from './tron-addresses';
import {quoteUsdtWithdrawal,withdrawalFeePolicy} from './withdrawal-fees';
import {assertDurableSession,consumeDurableApproval} from './durable-passkey';
import {paymentDigest} from './payment-intent';
import {accounts,available,moneyMicros,moneyString,reserveWithdrawalInTransaction,type WalletDb,type WalletTx} from './wallet-engine';
type Context=Parameters<typeof consumeDurableApproval>[1];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function quotePayload(row:Record<string,unknown>){
 return {recipient:String(row.recipient),amount:String(row.grossTokens),asset:'USDT',chain:String(row.network),fee:String(row.feeTokens),netAmount:String(row.netTokens),totalDebit:String(row.grossUsd),requestKey:String(row.requestKey),quoteId:String(row.id),feePolicy:withdrawalFeePolicy,grossUsd:String(row.grossUsd),feeUsd:String(row.feeUsd),netUsd:String(row.netUsd),rateReference:String(row.rateReference)};
}
function summary(row:Record<string,unknown>){const payload=quotePayload(row);return {id:String(row.id),payload,digest:paymentDigest('/api/wallet/withdraw',payload),grossUsd:String(row.grossUsd),feeUsd:String(row.feeUsd),netUsd:String(row.netUsd),expiresAt:row.expiresAt}}
/** Private trusted pricing adapter ONLY: rate/reference must come from an approved source.
 * Never bind this input directly to a browser request. No default peg or live price approval.
 */
export async function createUsdtWithdrawalQuote(db:WalletDb,c:{ownerId:string;requestKey:string;network:'TRC20'|'BEP20';recipient:string;grossTokens:string;rateUsdMicrosPerToken:bigint;rateReference:string;expiresAt:string;settlementAccountId:string;feeAccountId:string}){
 if(![c.ownerId,c.settlementAccountId,c.feeAccountId].every(v=>uuid.test(v))||c.settlementAccountId.toLowerCase()===c.feeAccountId.toLowerCase()||! /^[A-Za-z0-9:_-]{8,128}$/.test(c.requestKey)||typeof c.rateReference!=='string'||c.rateReference.length<8||c.rateReference.length>200||typeof c.rateUsdMicrosPerToken!=='bigint'||c.rateUsdMicrosPerToken<=0n||c.rateUsdMicrosPerToken>=10n**30n||!Number.isFinite(Date.parse(c.expiresAt)))throw new Error('INVALID_WITHDRAWAL_QUOTE');
 const tariff=quoteUsdtWithdrawal(c.network,c.grossTokens);
 let recipient=c.recipient;
 if(c.network==='TRC20'){if(!validTronAddress(recipient)||recipient==='T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')throw new Error('INVALID_WITHDRAWAL_RECIPIENT')}
 else{recipient=getAddress(recipient);if(recipient==='0x0000000000000000000000000000000000000000')throw new Error('INVALID_WITHDRAWAL_RECIPIENT')}
 const grossUsd=moneyMicros(tariff.gross)*c.rateUsdMicrosPerToken/1000000n,feeUsd=moneyMicros(tariff.fee)*c.rateUsdMicrosPerToken/1000000n;
 if(feeUsd<=0n||grossUsd<=feeUsd||grossUsd>100000n*1000000n)throw new Error('WITHDRAWAL_VALUATION_OUT_OF_BOUNDS');
 const fingerprint=createHash('sha256').update(JSON.stringify([c.ownerId.toLowerCase(),c.requestKey,c.network,recipient,tariff.gross,tariff.fee,tariff.net,c.rateUsdMicrosPerToken.toString(),c.rateReference,new Date(c.expiresAt).toISOString(),c.settlementAccountId.toLowerCase(),c.feeAccountId.toLowerCase(),withdrawalFeePolicy])).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  await tx.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[c.ownerId]);
  const {rows:[prior]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE "ownerId"=$1 AND "requestKey"=$2',[c.ownerId,c.requestKey]);
  if(prior){if(prior.fingerprint!==fingerprint)throw new Error('WITHDRAWAL_QUOTE_CONFLICT');return summary(prior)}
  const {rows:[row]}=await tx.query(`INSERT INTO "UsdtWithdrawalQuote" (id,"ownerId","requestKey",fingerprint,network,recipient,"grossTokens","feeTokens","netTokens","grossUsd","feeUsd","netUsd","rateUsdMicrosPerToken","rateReference","settlementAccountId","feeAccountId","expiresAt")
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::timestamptz WHERE $17::timestamptz>statement_timestamp() AND $17::timestamptz<=statement_timestamp()+INTERVAL '2 minutes' RETURNING *`,[randomUUID(),c.ownerId,c.requestKey,fingerprint,c.network,recipient,tariff.gross,tariff.fee,tariff.net,moneyString(grossUsd),moneyString(feeUsd),moneyString(grossUsd-feeUsd),c.rateUsdMicrosPerToken.toString(),c.rateReference,c.settlementAccountId,c.feeAccountId,c.expiresAt]);
  if(!row)throw new Error('WITHDRAWAL_QUOTE_EXPIRY_INVALID');return summary(row);
 });
}
export async function reserveQuotedUsdtWithdrawal(db:WalletDb,c:Context,input:{quoteId:string;approvalToken:string}){
 if(!uuid.test(input.quoteId))throw new Error('INVALID_WITHDRAWAL_QUOTE');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await assertDurableSession(tx,c);
  const {rows:[quote]}=await tx.query('SELECT *,"expiresAt">statement_timestamp() AS fresh FROM "UsdtWithdrawalQuote" WHERE id=$1 AND "ownerId"=$2 FOR UPDATE',[input.quoteId,c.userId]);
  if(!quote)throw new Error('WITHDRAWAL_QUOTE_UNAVAILABLE');
  // Exact retry of an already-reserved command does not consume another approval.
  if(!quote.operationId){
   if(quote.fresh!==true)throw new Error('WITHDRAWAL_QUOTE_EXPIRED');
   await consumeDurableApproval(tx,c,input.approvalToken,summary(quote).digest);
  }
  const operation=await reserveWithdrawalInTransaction(tx,{ownerId:c.userId,requestKey:String(quote.requestKey),amount:String(quote.grossUsd),destination:'USDTQ:'+quote.id});
  if(quote.operationId&&quote.operationId!==operation.id)throw new Error('WITHDRAWAL_QUOTE_OPERATION_CONFLICT');
  await tx.query('UPDATE "UsdtWithdrawalQuote" SET "operationId"=$2 WHERE id=$1',[quote.id,operation.id]);
  return {operation,quote:summary(quote)};
 });
}
/** Private definitive provider evidence ONLY. Unknown outcomes must remain SUBMITTED and held.
 * A future chain reconciler must independently bind exact payout hash/recipient/amount/finality.
 */
export async function settleQuotedUsdtWithdrawal(db:WalletDb,quoteId:string,evidence:{outcome:'confirmed'|'rejected';providerReference:string}){
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  return settleQuotedUsdtWithdrawalInTransaction(tx,quoteId,evidence);
 });
}
/** Private transaction-local composition for verified chain reconciliation. */
export async function settleQuotedUsdtWithdrawalInTransaction(tx:WalletTx,quoteId:string,evidence:{outcome:'confirmed'|'rejected';providerReference:string}){
 if(!uuid.test(quoteId)||!['confirmed','rejected'].includes(evidence.outcome)||typeof evidence.providerReference!=='string'||evidence.providerReference.length<8||evidence.providerReference.length>200||/[\x00-\x1f]/.test(evidence.providerReference))throw new Error('INVALID_WITHDRAWAL_SETTLEMENT');
  const {rows:[quote]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[quoteId]);
  if(!quote?.operationId)throw new Error('WITHDRAWAL_QUOTE_NOT_RESERVED');
  const {rows:[row]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[quote.operationId]);
  if(!row||row.kind!=='WITHDRAWAL'||row.ownerId!==quote.ownerId||row.destination!=='USDTQ:'+quote.id||moneyMicros(String(row.amount))!==moneyMicros(String(quote.grossUsd)))throw new Error('WITHDRAWAL_SETTLEMENT_CONFLICT');
  if(row.state==='COMPLETED'||row.state==='FAILED'){
   if(row.externalReference!==evidence.providerReference||(row.state==='COMPLETED')!==(evidence.outcome==='confirmed'))throw new Error('WITHDRAWAL_SETTLEMENT_CONFLICT');
   return {id:String(row.id),state:String(row.state),transactionId:row.transactionId};
  }
  if(row.state!=='SUBMITTED')throw new Error('WITHDRAWAL_NOT_SUBMITTED');
  if(evidence.outcome==='rejected'){
   await tx.query('UPDATE "WalletOperation" SET state=\'FAILED\',"externalReference"=$2,"updatedAt"=statement_timestamp() WHERE id=$1',[row.id,evidence.providerReference]);
   return {id:String(row.id),state:'FAILED',transactionId:null};
  }
  const owned=await accounts(tx,[String(row.ownerId)],String(quote.settlementAccountId),[String(quote.feeAccountId)]),account=owned.get(String(row.ownerId))!;
  if(await available(tx,String(row.ownerId),String(account.balance),String(row.id))<moneyMicros(String(quote.grossUsd)))throw new Error('INSUFFICIENT_AVAILABLE_BALANCE');
  const transactionId=randomUUID();
  await tx.query('INSERT INTO "Transaction" (id,"senderId",amount,type,"idempotencyKey") VALUES ($1,$2,$3,\'WITHDRAWAL\',$4)',[transactionId,row.ownerId,quote.grossUsd,'wallet:'+row.id]);
  await tx.query('INSERT INTO "LedgerEntry" (id,"transactionId","accountId",amount) VALUES ($1,$2,$3,-$4::numeric),($5,$2,$6,$7::numeric),($8,$2,$9,$10::numeric)',[randomUUID(),transactionId,account.id,quote.grossUsd,randomUUID(),quote.settlementAccountId,quote.netUsd,randomUUID(),quote.feeAccountId,quote.feeUsd]);
  await tx.query('UPDATE "Transaction" SET status=\'COMPLETED\' WHERE id=$1',[transactionId]);
  await tx.query('UPDATE "WalletOperation" SET state=\'COMPLETED\',"transactionId"=$2,"externalReference"=$3,"updatedAt"=statement_timestamp() WHERE id=$1',[row.id,transactionId,evidence.providerReference]);
  return {id:String(row.id),state:'COMPLETED',transactionId};

}
