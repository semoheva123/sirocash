import 'server-only';
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
 * No public route/cron is installed, and the normal auth runtime role MUST stay restricted.
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
 const execution=(authorizeEnabled||energyEnabled)?createFinancialExecution(db,{
  purchaseEnabled:energyEnabled&&process.env.SIRO_ENERGY_PURCHASE_ENABLED==='true'&&process.env.SIRO_ACCEPT_VARIABLE_ENERGY_PRICE==='true',
  client:energyEnabled?tronZapOrderClient({credentials:tronZapCredentials(),purchaseEnabled:process.env.SIRO_ENERGY_PURCHASE_ENABLED==='true',acceptVariableProviderPrice:process.env.SIRO_ACCEPT_VARIABLE_ENERGY_PRICE==='true'}):undefined,
  delivery:energyEnabled?createEnergyDeliveryObserver({...tron,genesisId:genesis}):undefined,
  resources:createOutboxResourceObserver({bep20:{endpoint:process.env.SIRO_BEP20_RPC_URL!,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION},tron,tronGenesisId:genesis}),
 }):undefined;
 return {
  payout:(id:string)=>processPayoutNetwork(db,id,{...observations,dispatchEnabled,send}),
  sweep:(id:string)=>processSweepObservation(db,id,{...observations,dispatchEnabled,send}),
  batch:()=>runFinancialWorkerBatch(db,{enabled:true,process:async(job,signal)=>{
   if(signal.aborted)throw new Error('WORKER_ABORTED');
   if(job.kind==='ENERGY')return execution?execution.energy(job.id,signal):{state:'HELD',reason:'ENERGY_WORKER_DISABLED'};
   if(authorizeEnabled&&execution){try{await execution.authorize(job,signal)}catch{/* Observe anyway: an existing transfer may have landed. No approval means no send. */}}
   const scopedSend=send?(input:Parameters<typeof send>[0])=>send({...input,signal:AbortSignal.any([signal,input.signal])}):undefined;
   const scopedObservations={...observations,bep20:productionBep20ReadRpc(signal),tron:productionTronRead(signal)};
   return job.kind==='PAYOUT'?processPayoutNetwork(db,job.id,{...scopedObservations,dispatchEnabled,send:scopedSend}):processSweepObservation(db,job.id,{...scopedObservations,dispatchEnabled,send:scopedSend});
  }}),
 };
}
