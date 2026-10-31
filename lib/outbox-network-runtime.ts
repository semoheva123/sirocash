import 'server-only';
import type {WalletDb} from './wallet-engine';
import {productionBep20ReadRpc} from './bep20-rpc';
import {productionTronRead} from './tron-receipt-observer';
import {productionChainBroadcaster} from './chain-broadcast';
import {processPayoutNetwork} from './payout-network-worker';
import {processSweepObservation} from './sweep-network-observer';
/** Private composition for a reviewed scheduler with dedicated financial DB authority.
 * No public route/cron is installed, and the normal auth runtime role MUST stay restricted.
 * Sweep here is OBSERVATION ONLY: separate durable resource/budget authorization for its
 * broadcasting is not implemented. Never pass broadcaster directly to a customer endpoint.
 */
export function productionOutboxNetworkWorkers(db:WalletDb){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true')throw new Error('OUTBOX_NETWORK_RUNTIME_DISABLED');
 const genesis=process.env.SIRO_TRON_GENESIS_ID,minimum=process.env.SIRO_BEP20_MIN_CONFIRMATIONS??'15';
 if(!genesis||!/^0{16}[a-f0-9]{48}$/.test(genesis)||!/^\d{1,5}$/.test(minimum)||Number(minimum)<15||Number(minimum)>10000)throw new Error('OUTBOX_NETWORK_RUNTIME_CONFIGURATION');
 const observations={enabled:true,bep20:productionBep20ReadRpc(),tron:productionTronRead(),tronGenesisId:genesis,minimumBep20Confirmations:Number(minimum)};
 const dispatchEnabled=process.env.SIRO_BROADCAST_ENABLED==='true';
 const send=dispatchEnabled?productionChainBroadcaster():undefined;
 return {
  payout:(id:string)=>processPayoutNetwork(db,id,{...observations,dispatchEnabled,send}),
  sweep:(id:string)=>processSweepObservation(db,id,observations),
 };
}
