import 'server-only';
import {productionDepositDiscovery} from './deposit-discovery-runtime';
import {createDepositValuationWorker} from './deposit-valuation-worker';
import {createUnsentTronRenewal} from './unsent-tron-renewal';
import {createFinancialPreflight} from './financial-preflight';
import {createFinancialPreparation} from './financial-preparation';
import {createNativeGasWorker} from './native-gas';
import {treasuryDestination} from './treasury-addresses';
import type {FinancialJob} from './financial-worker';
import {createFinancialExecution} from './financial-execution';
import {createOutboxResourceObserver} from './outbox-resource-observer';
import {createEnergyDeliveryObserver} from './energy-delivery-observer';
import {tronZapOrderClient} from './tronzap-orders';
import {tronZapCredentials} from './tronzap';
import {runFinancialWorkerBatch} from './financial-worker';
import type {WalletDb} from './wallet-engine';
import {productionBep20ReadRpc} from './bep20-rpc';
import {productionTronRead} from './tron-receipt-observer';
import {productionChainBroadcaster} from './chain-broadcast';
import {processPayoutNetwork} from './payout-network-worker';
import {processSweepObservation} from './sweep-network-observer';
/** Private composition for a reviewed scheduler with dedicated financial DB authority.
 * Scheduler-only authenticated route; the normal auth runtime role MUST stay restricted.
 * Both payout and sweep dispatch consume durable resource/expense approval before sending.
 * Never pass the broadcaster directly to a customer endpoint.
 */
export function productionOutboxNetworkWorkers(db:WalletDb){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true')throw new Error('OUTBOX_NETWORK_RUNTIME_DISABLED');
 const genesis=process.env.SIRO_TRON_GENESIS_ID,minimum=process.env.SIRO_BEP20_MIN_CONFIRMATIONS??'15';
 if(!genesis||!/^0{16}[a-f0-9]{48}$/.test(genesis)||!/^\d{1,5}$/.test(minimum)||Number(minimum)<15||Number(minimum)>10000)throw new Error('OUTBOX_NETWORK_RUNTIME_CONFIGURATION');
 const observations={enabled:true,bep20:productionBep20ReadRpc(),tron:productionTronRead(),tronGenesisId:genesis,minimumBep20Confirmations:Number(minimum)};
 const dispatchEnabled=process.env.SIRO_BROADCAST_ENABLED==='true';
 const send=dispatchEnabled?productionChainBroadcaster():undefined;
 const authorizeEnabled=process.env.SIRO_RESOURCE_AUTHORIZATION_ENABLED==='true',energyEnabled=process.env.SIRO_ENERGY_WORKER_ENABLED==='true';
 const tron={endpoint:process.env.SIRO_TRON_RPC_URL!,apiKey:process.env.SIRO_TRON_RPC_API_KEY};
 const client=energyEnabled?tronZapOrderClient({credentials:tronZapCredentials(),purchaseEnabled:process.env.SIRO_ENERGY_PURCHASE_ENABLED==='true',acceptVariableProviderPrice:process.env.SIRO_ACCEPT_VARIABLE_ENERGY_PRICE==='true'}):undefined;
 const execution=(authorizeEnabled||energyEnabled)?createFinancialExecution(db,{
  purchaseEnabled:energyEnabled&&process.env.SIRO_ENERGY_PURCHASE_ENABLED==='true'&&process.env.SIRO_ACCEPT_VARIABLE_ENERGY_PRICE==='true',
  client,
  delivery:energyEnabled?createEnergyDeliveryObserver({...tron,genesisId:genesis}):undefined,
  resources:createOutboxResourceObserver({bep20:{endpoint:process.env.SIRO_BEP20_RPC_URL!,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION},tron,tronGenesisId:genesis}),
 }):undefined;
 const gas=createNativeGasWorker(db,{rpc:{endpoint:process.env.SIRO_BEP20_RPC_URL!,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION},enabled:process.env.SIRO_NATIVE_GAS_ENABLED==='true'&&dispatchEnabled,minimumConfirmations:Number(minimum)});
 const valueDeposit=createDepositValuationWorker(db,{enabled:process.env.SIRO_DEPOSIT_VALUATION_ENABLED==='true'&&process.env.SIRO_PRICING_PROVIDER==='coinbase-spot-v1',settlementAccountId:process.env.SIRO_SETTLEMENT_ACCOUNT_ID??''});
 const preparationEnabled=process.env.SIRO_AUTOMATIC_PREPARATION_ENABLED==='true';
 const preparation=preparationEnabled&&execution?createFinancialPreparation(db,{
  enabled:true,gas,energy:execution.energy,bandwidthPackage:client?.bandwidthPackage,
  preflight:createFinancialPreflight({bep20:{endpoint:process.env.SIRO_BEP20_RPC_URL!,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION},tron,genesisId:genesis,tronReadOwner:treasuryDestination('TRC20','operating'),estimateEnergy:client?.estimateEnergy}),
  limits:(network,kind)=>{const read=(suffix:string)=>{const v=process.env[`SIRO_${network}_${suffix}`];if(!v||! /^[1-9]\d{0,77}$/.test(v))throw new Error('PREPARATION_LIMIT_MISSING');return BigInt(v)};return {maxAmount:read('MAX_TOKEN_BASE_UNITS'),maxFee:read('MAX_FEE_BASE_UNITS'),minimumSweep:kind==='PREPARE_SWEEP'?read('MIN_SWEEP_BASE_UNITS'):1n}}
 }):undefined;
 const renew=preparationEnabled?createUnsentTronRenewal(db,{preflight:createFinancialPreflight({bep20:{endpoint:process.env.SIRO_BEP20_RPC_URL!,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION},tron,genesisId:genesis,tronReadOwner:treasuryDestination('TRC20','operating'),estimateEnergy:client?.estimateEnergy})}):undefined;
 async function processSaved(job:FinancialJob,signal:AbortSignal){
   if(signal.aborted)throw new Error('WORKER_ABORTED');
   if(renew&&(job.kind==='SWEEP'||job.kind==='PAYOUT')){try{await renew({id:job.id,kind:job.kind},signal)}catch{/* No renewal is allowed for a consumed/unknown signature. */}}
   if(authorizeEnabled&&execution){try{await execution.authorize(job,signal)}catch{/* Observe anyway; no approval means no send. */}}
   const scopedSend=send?(input:Parameters<typeof send>[0])=>send({...input,signal:AbortSignal.any([signal,input.signal])}):undefined;
   const scopedObservations={...observations,bep20:productionBep20ReadRpc(signal),tron:productionTronRead(signal)};
   return job.kind==='PAYOUT'?processPayoutNetwork(db,job.id,{...scopedObservations,dispatchEnabled,send:scopedSend}):processSweepObservation(db,job.id,{...scopedObservations,dispatchEnabled,send:scopedSend});
 }
 return {
  payout:(id:string)=>processPayoutNetwork(db,id,{...observations,dispatchEnabled,send}),
  sweep:(id:string)=>processSweepObservation(db,id,{...observations,dispatchEnabled,send}),
  batch:()=>runFinancialWorkerBatch(db,{enabled:true,process:async(job,signal)=>{
   if(signal.aborted)throw new Error('WORKER_ABORTED');
   if((await db.transaction(tx=>tx.query('SELECT 1 FROM "DepositScanCursor" WHERE paused LIMIT 1'))).rows.length)return {state:'HELD',reason:'DEPOSIT_CHAIN_REVIEW_REQUIRED'};
   if(job.kind==='DEPOSIT_SCAN')return process.env.SIRO_DEPOSIT_DISCOVERY_ENABLED==='true'?productionDepositDiscovery(db,signal).process(job.id,signal):{state:'HELD',reason:'DEPOSIT_DISCOVERY_DISABLED'};
   if(job.kind==='DEPOSIT_VALUE')return valueDeposit(job.id,signal);
   if(job.kind==='ENERGY')return execution?execution.energy(job.id,signal):{state:'HELD',reason:'ENERGY_WORKER_DISABLED'};
   if(job.kind==='GAS')return gas.process(job.id,signal);
   if(job.kind==='PREPARE_PAYOUT'||job.kind==='PREPARE_SWEEP'){
    if(!preparation)return {state:'HELD',reason:'AUTOMATIC_PREPARATION_DISABLED'};
    const result=await preparation({id:job.id,kind:job.kind},signal);
    if(result.state!=='SAVED')return result;
    return processSaved({id:result.id,kind:result.kind,createdAt:job.createdAt},signal);
   }
   return processSaved(job,signal);
  }}),
 };
}
