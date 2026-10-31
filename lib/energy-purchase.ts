import 'server-only';
import {randomUUID} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
import {validTronAddress} from './tron-addresses';
import {treasuryDestination} from './treasury-addresses';
/** PRIVATE pre-purchase budget/claim layer for both sweep and payout resource intents.
 * An injected reviewed planner supplies a fresh exact quote, including activation fees.
 * No provider purchase adapter is installed. ACK is neither delivery nor chain finality.
 * Reservations NEVER auto-release, even across midnight or after timeout/crash.
 */
type Quote={sender:string;energyAmount:number;durationMinutes:60;costSun:bigint;expiresAt:number;intentFingerprint:string};
type Order={requestKey:string;sender:string;energyAmount:number;durationMinutes:60;maxCostSun:bigint;signal:AbortSignal};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function purchaseIntentEnergy(db:WalletDb,intentId:string,quote:Quote,options:{enabled?:boolean;send:(order:Order)=>Promise<{orderId:string}>;timeoutMs?:number}){
 quote={...quote}; // Freeze primitive quote inputs across asynchronous claims.
 if(options.enabled!==true)throw new Error('ENERGY_PURCHASE_DISABLED');
 const timeout=options.timeoutMs??10000;
 if(!uuid.test(intentId)||!Number.isSafeInteger(timeout)||timeout<100||timeout>30000)throw new Error('ENERGY_PURCHASE_INVALID_INPUT');
 if(typeof quote.costSun!=='bigint'||quote.costSun<=0n||quote.costSun>9223372036854775807n||!Number.isSafeInteger(quote.expiresAt))throw new Error('ENERGY_QUOTE_INVALID');
 const claim=await db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  // Global mutex BEFORE aggregate read: independent intents share one provider budget.
  const {rows:[policy]}=await tx.query('SELECT * FROM "EnergyPurchasePolicy" WHERE id=1 FOR UPDATE');
  if(!policy||policy.enabled!==true)throw new Error('ENERGY_PURCHASE_POLICY_DISABLED');
  const {rows:[intent]}=await tx.query('SELECT * FROM "EnergyRentalIntent" WHERE id=$1',[intentId]);
  if(!intent)throw new Error('ENERGY_INTENT_NOT_FOUND');
  const {rows:[prior]}=await tx.query('SELECT state FROM "EnergyPurchaseAttempt" WHERE "intentId"=$1',[intentId]);
  if(prior)return {state:String(prior.state)};
  if(intent.state!=='PREPARED'||!validTronAddress(String(intent.senderAddress))||!validTronAddress(String(intent.recipientAddress))||intent.senderAddress===intent.recipientAddress||!intent.amountBaseUnits)throw new Error('ENERGY_INTENT_NOT_PURCHASABLE');
  if(intent.withdrawalId){
   const {rows:[op]}=await tx.query('SELECT state,kind FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[intent.withdrawalId]);
   if(!op||op.state!=='RESERVED'||op.kind!=='WITHDRAWAL'||intent.senderAddress!==treasuryDestination('TRC20','operating'))throw new Error('ENERGY_PAYOUT_NOT_RESERVED');
  }else{
   const {rows:[source]}=await tx.query('SELECT * FROM "UserDepositAddress" WHERE id=$1 FOR UPDATE',[intent.sweepAddressId]);
   const {rows:[vault]}=await tx.query('SELECT enabled,"originVerified" FROM "DepositAddressVault" WHERE id=$1 FOR UPDATE',[source?.vaultId]);
   const {rows:pending}=await tx.query('SELECT id FROM "SignedSweepOutbox" WHERE "addressId"=$1 AND state IN (\'SIGNED\',\'BROADCAST_UNKNOWN\')',[intent.sweepAddressId]);
   if(intent.recipientAddress!==treasuryDestination('TRC20','operating')||!source||source.network!=='TRC20'||source.address!==intent.senderAddress||!vault||vault.enabled!==true||vault.originVerified!==true||pending.length)throw new Error('ENERGY_SWEEP_NOT_READY');
  }
  // Match planner lock order: operation/source before intent, avoiding inversion with preparation.
  const {rows:[locked]}=await tx.query('SELECT * FROM "EnergyRentalIntent" WHERE id=$1 FOR UPDATE',[intentId]);
  if(JSON.stringify(locked)!==JSON.stringify(intent))throw new Error('ENERGY_INTENT_CHANGED');
  if(quote.sender!==intent.senderAddress||quote.energyAmount!==intent.energyAmount||quote.durationMinutes!==60||intent.durationMinutes!==60||quote.intentFingerprint!==intent.fingerprint)throw new Error('ENERGY_QUOTE_BINDING_FAILED');
  const {rows:[fresh]}=await tx.query('SELECT to_timestamp($1 / 1000.0)>clock_timestamp() AND to_timestamp($1 / 1000.0)<=clock_timestamp()+interval \'60 seconds\' AS ok',[quote.expiresAt]);
  if(fresh?.ok!==true)throw new Error('ENERGY_QUOTE_STALE');
  if(quote.costSun>BigInt(String(intent.maxRentalSun))||quote.costSun>BigInt(String(policy.perOrderSun)))throw new Error('ENERGY_ORDER_BUDGET_EXCEEDED');
  const {rows:[held]}=await tx.query('SELECT COALESCE(sum("costSun"),0)::text AS total FROM "EnergyPurchaseAttempt"');
  if(BigInt(String(held.total))+quote.costSun>BigInt(String(policy.totalHeldSun)))throw new Error('ENERGY_TOTAL_BUDGET_EXCEEDED');
  const claimId=randomUUID();
  await tx.query('INSERT INTO "EnergyPurchaseAttempt" ("intentId","claimId","intentFingerprint","senderAddress","energyAmount","costSun","quoteExpiresAt") VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7 / 1000.0))',[intentId,claimId,intent.fingerprint,intent.senderAddress,intent.energyAmount,quote.costSun.toString(),quote.expiresAt]);
  await tx.query('UPDATE "EnergyRentalIntent" SET state=\'UNCERTAIN\',"updatedAt"=statement_timestamp() WHERE id=$1',[intentId]);
  return {state:'CLAIMED',claimId,sender:String(intent.senderAddress),energyAmount:Number(intent.energyAmount)};
 });
 if(!('claimId' in claim))return {state:claim.state};
 // Commit must precede external effects. Expired during commit -> retained UNKNOWN, no send.
 if(Date.now()>=quote.expiresAt)return {state:'UNKNOWN'};
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([options.send({requestKey:claim.claimId!,sender:claim.sender!,energyAmount:claim.energyAmount!,durationMinutes:60,maxCostSun:quote.costSun,signal:controller.signal}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('ENERGY_ORDER_TIMEOUT'))},Math.min(timeout,quote.expiresAt-Date.now()))})]);
  if(typeof result.orderId!=='string'||! /^[A-Za-z0-9:_-]{1,128}$/.test(result.orderId))return {state:'UNKNOWN'};
  await db.transaction(async tx=>{
   await tx.query('UPDATE "EnergyPurchaseAttempt" SET state=\'ACKNOWLEDGED\',"providerOrderId"=$3 WHERE "intentId"=$1 AND "claimId"=$2 AND state=\'UNKNOWN\'',[intentId,claim.claimId,result.orderId]);
  });
  return {state:'ACKNOWLEDGED'};
 }catch{return {state:'UNKNOWN'}}finally{if(timer)clearTimeout(timer);controller.abort()}
}
