import 'server-only';
import type {WalletDb} from './wallet-engine';
import {dispatchSavedPayout} from './payout-dispatch';
import {confirmPayout} from './payout-confirmation';
import {observeOutboxTransfer,type OutboxObservationOptions} from './outbox-observer';
import type {ChainSendInput} from './chain-broadcast';
type Options=OutboxObservationOptions&{enabled?:boolean;send?:(input:ChainSendInput)=>Promise<{txId:string}>;dispatchEnabled?:boolean};
/** One bounded durable-outbox job. No public receipt input, signing, refund or failure inference.
 * Durable dispatch handles concurrent/duplicate send claims. Confirmation is replay-safe.
 * Failed/missing/unfinalized/reorganized receipts keep reservations, including after TRON expiry.
 */
export async function processPayoutNetwork(db:WalletDb,payoutId:string,options:Options){
 if(options.enabled!==true)throw new Error('PAYOUT_NETWORK_WORKER_DISABLED');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payoutId)||!Number.isSafeInteger(options.minimumBep20Confirmations)||options.minimumBep20Confirmations<15||options.minimumBep20Confirmations>10000)throw new Error('PAYOUT_NETWORK_WORKER_INPUT');
 const row=await db.transaction(async tx=>{
  const {rows:[r]}=await tx.query('SELECT id,network,"txId",sender,recipient,"amountBaseUnits",state FROM "SignedWithdrawalOutbox" WHERE id=$1',[payoutId]);
  if(!r)throw new Error('PAYOUT_NOT_FOUND');return r;
 });
 if(['CONFIRMED','REJECTED'].includes(String(row.state)))return {state:String(row.state)};
 if(!['SIGNED','BROADCAST_UNKNOWN'].includes(String(row.state)))throw new Error('PAYOUT_NETWORK_STATE');
 if(options.dispatchEnabled===true){
  if(!options.send)throw new Error('PAYOUT_SEND_ADAPTER_MISSING');
  try{await dispatchSavedPayout(db,payoutId,{enabled:true,send:options.send})}
  catch{/* Still observe: an earlier attempt may have landed despite an ambiguous send result. */}
 }
 try{
  const observed=await observeOutboxTransfer(options,row as Parameters<typeof observeOutboxTransfer>[1]);
  if(observed.network==='BEP20')await confirmPayout(db,{payoutId,network:'BEP20',evidence:observed.evidence});
  else await confirmPayout(db,{payoutId,network:'TRC20',evidence:observed.evidence});
  return {state:'CONFIRMED'};
 }catch{return {state:'HELD',reason:'FINAL_TRANSFER_NOT_PROVEN'}}
}
