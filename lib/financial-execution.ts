import 'server-only';
import {randomUUID,createHash} from 'node:crypto';
import {Transaction,Interface} from 'ethers';
import {TronWeb} from 'tronweb';
import type {WalletDb} from './wallet-engine';
import type {FinancialJob} from './financial-worker';
import {purchaseIntentEnergy} from './energy-purchase';
import {recoverIntentEnergy} from './energy-recovery';
import {authorizeSweepDispatch,type SweepResources} from './sweep-dispatch';
import {authorizePayoutDispatch} from './payout-resource-authorization';
import type {ResourceProvider} from './resource-provider';
import type {createEnergyDeliveryObserver} from './energy-delivery-observer';
type Client=ResourceProvider;
export function createFinancialExecution(db:WalletDb,options:{purchaseEnabled:boolean;client?:Client;delivery?:ReturnType<typeof createEnergyDeliveryObserver>;resources:(input:{network:'TRC20'|'BEP20';txId:string;signedPayload:string;resourceCost:bigint;signal:AbortSignal})=>Promise<SweepResources>}){
 async function energy(intentId:string,signal:AbortSignal){
  const client=options.client,delivery=options.delivery;
  if(!client||!delivery)return {state:'HELD',reason:'ENERGY_RECOVERY_DISABLED'} as const;
  const i=await db.transaction(async tx=>{const {rows:[r]}=await tx.query('SELECT * FROM "EnergyRentalIntent" WHERE id=$1',[intentId]);if(!r)throw new Error('ENERGY_INTENT_NOT_FOUND');return r});
  if(i.state==='PREPARED'){
   if(!options.purchaseEnabled)return {state:'HELD',reason:'PURCHASE_DISABLED'} as const;
   const blocked=client.purchaseBlocker?.();if(blocked)return {state:'HELD',reason:blocked} as const;
   const q=await client.quote({requestKey:randomUUID(),sender:String(i.senderAddress),bandwidthAmount:Number(i.bandwidthAmount??0),energyAmount:Number(i.energyAmount),durationMinutes:60,maxCostSun:BigInt(String(i.maxRentalSun)),signal});
   if(signal.aborted)throw new Error('WORKER_ABORTED');
   await purchaseIntentEnergy(db,intentId,{sender:String(i.senderAddress),bandwidthAmount:Number(i.bandwidthAmount??0),energyAmount:Number(i.energyAmount),durationMinutes:60,costSun:q.costSun,expiresAt:q.expiresAt,intentFingerprint:String(i.fingerprint)},{enabled:true,reserve:client.reserve?(tx,claimId)=>client.reserve!(tx,{requestKey:claimId,sender:String(i.senderAddress),bandwidthAmount:Number(i.bandwidthAmount??0),energyAmount:Number(i.energyAmount),durationMinutes:60,maxCostSun:q.costSun,signal},q):undefined,send:order=>client.send({...order,signal:AbortSignal.any([signal,order.signal])})});
  }
  if(signal.aborted)throw new Error('WORKER_ABORTED');
  return recoverIntentEnergy(db,intentId,{signal,check:client.check,observe:delivery});
 }
 async function authorize(job:FinancialJob,signal:AbortSignal){
  if(job.kind!=='SWEEP'&&job.kind!=='PAYOUT')throw new Error('NOT_AN_OUTBOX');
  const row=await db.transaction(async tx=>{
   const {rows:[r]}=await tx.query(job.kind==='SWEEP'?'SELECT s.*,a.address AS sender FROM "SignedSweepOutbox" s JOIN "UserDepositAddress" a ON a.id=s."addressId" WHERE s.id=$1':'SELECT * FROM "SignedWithdrawalOutbox" WHERE id=$1',[job.id]);
   if(!r)throw new Error('OUTBOX_NOT_FOUND');
   const {rows:[approval]}=await tx.query(job.kind==='SWEEP'?'SELECT "claimId","expiresAt">clock_timestamp() AS fresh FROM "SweepDispatchAuthorization" WHERE "sweepId"=$1':'SELECT "consumedAt","expiresAt">clock_timestamp() AS fresh FROM "PayoutDispatchApproval" WHERE "payoutId"=$1',[job.id]);
   return {...r,approved:!!approval&&(approval.fresh===true||!!approval.claimId||!!approval.consumedAt)} as Record<string,unknown>&{approved:boolean};
  });
  if(row.approved||row.state!=='SIGNED')return {state:'EXISTING'};
  if(row.network!=='BEP20'&&row.network!=='TRC20')throw new Error('OUTBOX_NETWORK');
  let resourceCost=0n;
  if(row.network==='TRC20'){
   const signed=JSON.parse(String(row.signedPayload)),data=signed.raw_data.contract[0].parameter.value.data;
   const recipient=TronWeb.address.fromHex('41'+data.slice(32,72)),amount=BigInt('0x'+data.slice(-64));
   const intent=await db.transaction(async tx=>{const {rows:[i]}=await tx.query(`SELECT * FROM "EnergyRentalIntent" WHERE "requestKey"=$1 AND "senderAddress"=$2 AND "recipientAddress"=$3 AND "amountBaseUnits"=$4`,[job.kind==='SWEEP'?'energy:sweep:'+createHash('sha256').update(String(row.addressId)+':'+String(row.requestKey)).digest('hex'):'energy:payout:'+String(row.operationId),row.sender,recipient,amount.toString()]);return i});
   if(intent){
    const recovery=await energy(String(intent.id),signal);
    if(recovery.state!=='DELIVERED')throw new Error('ENERGY_NOT_DELIVERED');
    resourceCost=recovery.actualCostSun;
   }
  }else{
   // Parse before observer; exact signature/recipient/amount are revalidated by authorization.
   new Interface(['function transfer(address,uint256)']).decodeFunctionData('transfer',Transaction.from(String(row.signedPayload)).data);
  }
  const e=await options.resources({network:row.network,txId:String(row.txId),signedPayload:String(row.signedPayload),resourceCost,signal});
  if(signal.aborted)throw new Error('WORKER_ABORTED');
  if(job.kind==='SWEEP')return authorizeSweepDispatch(db,job.id,e);
  const common={network:e.network,txId:e.txId,sender:e.sender,observerReference:'resource:'+randomUUID(),observedAt:e.observedAt,expiresAt:e.expiresAt,tokenBalanceBaseUnits:e.tokenBalance,nativeBalanceBaseUnits:e.nativeBalance,resourceCostBaseUnits:e.resourceCost};
  if(e.network==='BEP20')return authorizePayoutDispatch(db,job.id,{...common,network:'BEP20',pendingNonce:e.pendingNonce!,estimatedGas:e.estimatedGas!});
  return authorizePayoutDispatch(db,job.id,{...common,network:'TRC20',accountActive:e.accountActive!,requiredEnergy:e.requiredEnergy!,availableEnergy:e.availableEnergy!,requiredBandwidth:e.requiredBandwidth!,availableBandwidth:e.availableBandwidth!});
 }
 return {energy,authorize};
}
