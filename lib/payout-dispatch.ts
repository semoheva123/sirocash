import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
import {validateSavedPayout} from './payout-signature';
type Send=(input:{network:'TRC20'|'BEP20';txId:string;signedPayload:string;signal:AbortSignal})=>Promise<{txId:string}>;
/** PRIVATE worker. No production network adapter or public route is installed.
 * The private approval table must be populated by a reviewed balance/resource/budget authority.
 * A provider ACK is NOT finality. Every uncertain result stays held; retries do not resend.
 */
export async function dispatchSavedPayout(db:WalletDb,payoutId:string,options:{send:Send;enabled?:boolean;now?:number;timeoutMs?:number}){
 const timeoutMs=options.timeoutMs??10000;
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw new Error('PAYOUT_TIMEOUT_INVALID');
 if(options.enabled!==true)throw new Error('PAYOUT_DISPATCH_DISABLED');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payoutId))throw new Error('INVALID_PAYOUT_ID');
 const prepared=await db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[locator]}=await tx.query('SELECT "quoteId" FROM "SignedWithdrawalOutbox" WHERE id=$1',[payoutId]);
  if(!locator)throw new Error('PAYOUT_NOT_FOUND');
  const {rows:[quote]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[locator.quoteId]);
  const {rows:[operation]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[quote?.operationId]);
  const {rows:[payout]}=await tx.query('SELECT * FROM "SignedWithdrawalOutbox" WHERE id=$1 FOR UPDATE',[payoutId]);
  if(!payout||!operation||payout.operationId!==operation.id||quote?.operationId!==operation.id||quote.network!==payout.network||operation.destination!=='USDTQ:'+quote.id)throw new Error('PAYOUT_DISPATCH_IDENTITY_CONFLICT');
  if(payout.state==='CONFIRMED'||payout.state==='REJECTED'){
   if(operation.state!==(payout.state==='CONFIRMED'?'COMPLETED':'FAILED'))throw new Error('PAYOUT_TERMINAL_STATE_CONFLICT');
   return {status:String(payout.state),txId:String(payout.txId)};
  }
  const {rows:[prior]}=await tx.query('SELECT state FROM "PayoutDispatchAttempt" WHERE "payoutId"=$1',[payoutId]);
  if(prior)return {status:String(prior.state),txId:String(payout.txId)};
  if(operation.state!=='SUBMITTED'||payout.state!=='SIGNED')throw new Error('PAYOUT_NOT_DISPATCHABLE');
  const {rows:[approval]}=await tx.query('SELECT *,"approvedAt"<=clock_timestamp() AND "expiresAt">clock_timestamp() AS fresh FROM "PayoutDispatchApproval" WHERE "payoutId"=$1 FOR UPDATE',[payoutId]);
  if(!approval||approval.fresh!==true||approval.consumedAt||approval.txId!==payout.txId||approval.payloadHash!==createHash('sha256').update(String(payout.signedPayload)).digest('hex'))throw new Error('PAYOUT_DISPATCH_APPROVAL_REQUIRED');
  const maxFee=validateSavedPayout(payout,quote,{now:options.now});
  if(maxFee<=0n||maxFee>BigInt(String(approval.maxNativeFeeBaseUnits)))throw new Error('PAYOUT_APPROVED_FEE_EXCEEDED');
  const claimId=randomUUID();
  await tx.query('UPDATE "PayoutDispatchApproval" SET "consumedAt"=statement_timestamp() WHERE "payoutId"=$1',[payoutId]);
  await tx.query('INSERT INTO "PayoutDispatchAttempt" ("payoutId","claimId") VALUES ($1,$2)',[payoutId,claimId]);
  await tx.query('UPDATE "SignedWithdrawalOutbox" SET state=\'BROADCAST_UNKNOWN\' WHERE id=$1',[payoutId]);
  const notAfter=approval.expiresAt instanceof Date?approval.expiresAt.getTime():Date.parse(String(approval.expiresAt));
  return {status:'CLAIMED',txId:String(payout.txId),claimId,notAfter,network:payout.network as 'TRC20'|'BEP20',signedPayload:String(payout.signedPayload)};
 });
 if(!('signedPayload' in prepared))return {txId:prepared.txId,state:prepared.status};
 // Approval can expire while a transaction waits/commits. Do not send with stale resources.
 if(!Number.isFinite(prepared.notAfter)||Date.now()>=prepared.notAfter!)return {txId:prepared.txId,state:'UNKNOWN'};
 // Crash from this point onward is intentionally UNKNOWN, including crash before actual send.
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([options.send({network:prepared.network!,txId:prepared.txId,signedPayload:prepared.signedPayload!,signal:controller.signal}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('PAYOUT_SEND_TIMEOUT'))},timeoutMs)})]);
  if(result.txId.toLowerCase()!==prepared.txId.toLowerCase())return {txId:prepared.txId,state:'UNKNOWN'};
  await db.transaction(async tx=>{
   await tx.query('UPDATE "PayoutDispatchAttempt" SET state=\'ACKNOWLEDGED\',"acknowledgedAt"=statement_timestamp() WHERE "payoutId"=$1 AND "claimId"=$2 AND state=\'UNKNOWN\'',[payoutId,prepared.claimId]);
  });
  return {txId:prepared.txId,state:'ACKNOWLEDGED'};
 }catch{return {txId:prepared.txId,state:'UNKNOWN'}}finally{if(timer)clearTimeout(timer);controller.abort()}
}
