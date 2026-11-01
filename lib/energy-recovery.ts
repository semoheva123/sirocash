import 'server-only';
import type {WalletDb} from './wallet-engine';
import type {ResourceOrder} from './resource-provider';
import type {EnergyDelivery} from './energy-delivery-observer';
type Receipt={orderId:string;status:'new'|'pending'|'success'|'failed';actualCostSun:bigint;priceExceeded:boolean;delegationTxId?:string};
/** Durable external-ID recovery. No create, retry, cancellation or refund capability.
 * Final charges are immutable, retained in the provider budget for its lifetime.
 * Failed/not-found orders never release the sender or authorize another purchase.
 */
export async function recoverIntentEnergy(db:WalletDb,intentId:string,options:{check:(order:ResourceOrder)=>Promise<Receipt>;observe:(input:{sender:string;delegationTxId:string;energyAmount:number;bandwidthAmount?:number;signal:AbortSignal})=>Promise<EnergyDelivery>;signal:AbortSignal}){
 if(!/^[a-f0-9-]{36}$/i.test(intentId)||options.signal.aborted)throw new Error('ENERGY_RECOVERY_INPUT');
 const snapshot=await db.transaction(async tx=>{
  const {rows:[r]}=await tx.query('SELECT a.*,i.fingerprint,i."maxRentalSun",i."senderAddress" AS "intentSender",i."energyAmount" AS "intentEnergy",i."bandwidthAmount" AS "intentBandwidth" FROM "EnergyPurchaseAttempt" a JOIN "EnergyRentalIntent" i ON i.id=a."intentId" WHERE a."intentId"=$1',[intentId]);
  if(!r||r.intentFingerprint!==r.fingerprint||r.senderAddress!==r.intentSender||r.energyAmount!==r.intentEnergy||Number(r.bandwidthAmount??0)!==Number(r.intentBandwidth??0))throw new Error('ENERGY_RECOVERY_BINDING');return r;
 });
 let receipt:Receipt;
 try{receipt=await options.check({requestKey:String(snapshot.claimId),sender:String(snapshot.senderAddress),energyAmount:Number(snapshot.energyAmount),bandwidthAmount:Number(snapshot.bandwidthAmount??0),durationMinutes:60,maxCostSun:BigInt(String(snapshot.costSun)),signal:options.signal})}catch{return {state:'HELD',reason:'PROVIDER_LOOKUP_UNVERIFIED'} as const}
 if(!/^[A-Za-z0-9:_-]{1,128}$/.test(receipt.orderId)||typeof receipt.actualCostSun!=='bigint'||receipt.actualCostSun<0n||receipt.actualCostSun>9223372036854775807n||!['new','pending','success','failed'].includes(receipt.status)||(receipt.delegationTxId!==undefined&&!/^[a-f0-9]{64}$/.test(receipt.delegationTxId)))throw new Error('ENERGY_RECOVERY_RESPONSE');
 const final=receipt.status==='success'||receipt.status==='failed';
 // Learn the real charge even if native delivery proof subsequently fails.
 const breach=await db.transaction(async tx=>{
  const {rows:[policy]}=await tx.query('SELECT * FROM "EnergyPurchasePolicy" WHERE id=1 FOR UPDATE');
  const {rows:[a]}=await tx.query('SELECT * FROM "EnergyPurchaseAttempt" WHERE "intentId"=$1 FOR UPDATE',[intentId]);
  if(!a||a.claimId!==snapshot.claimId||a.intentFingerprint!==snapshot.intentFingerprint||(a.providerOrderId!==null&&a.providerOrderId!==receipt.orderId))throw new Error('ENERGY_RECOVERY_CONFLICT');
  if(a.actualCostSun!==null){
   if(!final||BigInt(String(a.actualCostSun))!==receipt.actualCostSun||a.providerFinalStatus!==receipt.status||(a.delegationTxId??undefined)!==receipt.delegationTxId)throw new Error('ENERGY_RECEIPT_CHANGED');
  }else if(final){
   await tx.query('UPDATE "EnergyPurchaseAttempt" SET state=\'ACKNOWLEDGED\',"providerOrderId"=$2,"actualCostSun"=$3,"providerFinalStatus"=$4,"delegationTxId"=$5,"reconciledAt"=clock_timestamp() WHERE "intentId"=$1',[intentId,receipt.orderId,receipt.actualCostSun.toString(),receipt.status,receipt.delegationTxId??null]);
  }else if(a.state==='UNKNOWN')await tx.query('UPDATE "EnergyPurchaseAttempt" SET state=\'ACKNOWLEDGED\',"providerOrderId"=$2 WHERE "intentId"=$1',[intentId,receipt.orderId]);
  const {rows:[sum]}=await tx.query('SELECT COALESCE(sum(GREATEST("costSun",COALESCE("actualCostSun",0),COALESCE((SELECT sum(GREATEST(l."quotedSun",COALESCE(l."actualSun",0))) FROM "ResourcePurchaseLeg" l WHERE l."claimId"="EnergyPurchaseAttempt"."claimId"),0))),0)::text AS total FROM "EnergyPurchaseAttempt"');
  const exceeded=receipt.actualCostSun>BigInt(String(a.costSun))||receipt.actualCostSun>BigInt(String(snapshot.maxRentalSun))||!policy||receipt.actualCostSun>BigInt(String(policy.perOrderSun))||BigInt(String(sum.total))>BigInt(String(policy.totalHeldSun));
  if(exceeded&&policy)await tx.query('UPDATE "EnergyPurchasePolicy" SET enabled=false WHERE id=1');
  return exceeded;
 });
 if(breach)return {state:'HELD',reason:'PRICE_BREACH_PURCHASES_DISABLED'} as const;
 if(receipt.status!=='success'||!receipt.delegationTxId)return {state:'HELD',reason:'PROVIDER_NOT_DELIVERED'} as const;
 let proof:EnergyDelivery;
 try{proof=await options.observe({sender:String(snapshot.senderAddress),delegationTxId:receipt.delegationTxId,energyAmount:Number(snapshot.energyAmount),bandwidthAmount:Number(snapshot.bandwidthAmount??0),signal:options.signal})}catch{return {state:'HELD',reason:'CHAIN_DELIVERY_UNPROVEN'} as const}
 if(options.signal.aborted||proof.sender!==snapshot.senderAddress||proof.energyAmount!==snapshot.energyAmount||Number(proof.bandwidthAmount??0)!==Number(snapshot.bandwidthAmount??0)||proof.delegationTxId!==receipt.delegationTxId)throw new Error('ENERGY_DELIVERY_BINDING');
 await db.transaction(async tx=>{
  const {rows:[a]}=await tx.query('SELECT * FROM "EnergyPurchaseAttempt" WHERE "intentId"=$1 FOR UPDATE',[intentId]);
  if(!a||a.claimId!==snapshot.claimId||a.providerFinalStatus!=='success'||a.delegationTxId!==proof.delegationTxId||BigInt(String(a.actualCostSun))!==receipt.actualCostSun)throw new Error('ENERGY_DELIVERY_CONFLICT');
  const {rows:[fresh]}=await tx.query(`SELECT $1::timestamptz<=clock_timestamp() AND $1::timestamptz>=clock_timestamp()-interval '30 seconds' AND $2::timestamptz>clock_timestamp() AND $2::timestamptz<=$1::timestamptz+interval '30 seconds' AS ok`,[proof.observedAt,proof.expiresAt]);
  if(fresh?.ok!==true)throw new Error('ENERGY_DELIVERY_STALE');
  if(a.resourceObservedAt&&(a.resourceObservedAt instanceof Date?a.resourceObservedAt.getTime():Date.parse(String(a.resourceObservedAt)))>=Date.parse(proof.observedAt))return;
  await tx.query('UPDATE "EnergyPurchaseAttempt" SET "resourceObservedAt"=$2,"resourcesVerifiedUntil"=$3 WHERE "intentId"=$1',[intentId,proof.observedAt,proof.expiresAt]);
  await tx.query('UPDATE "EnergyRentalIntent" SET state=\'DELIVERED\',"providerOrderId"=$2,"updatedAt"=clock_timestamp() WHERE id=$1 AND state IN (\'UNCERTAIN\',\'DELIVERED\')',[intentId,receipt.orderId]);
 });
 return {state:'DELIVERED',actualCostSun:receipt.actualCostSun} as const;
}
