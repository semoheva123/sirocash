import 'server-only';
import {dispatchSavedSweep} from './sweep-dispatch';
import type {ChainSendInput} from './chain-broadcast';
import {Transaction} from 'ethers';
import type {WalletDb} from './wallet-engine';
import {observeOutboxTransfer,type OutboxObservationOptions} from './outbox-observer';
import {confirmBep20Sweep,confirmTronSweep} from './sweep-confirmation';
import {treasuryDestination} from './treasury-addresses';
/** Reconcile saved sweeps, including broadcast-unknown/expired signatures. No signing or sending.
 * Source is released only by the existing signature-bound successful finality transaction.
 */
export async function processSweepObservation(db:WalletDb,sweepId:string,options:OutboxObservationOptions&{enabled?:boolean;dispatchEnabled?:boolean;send?:(i:ChainSendInput)=>Promise<{txId:string}>}){
 if(options.enabled!==true)throw new Error('SWEEP_OBSERVER_DISABLED');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sweepId))throw new Error('SWEEP_OBSERVER_INPUT');
 const row=await db.transaction(async tx=>{
  const {rows:[r]}=await tx.query('SELECT s.*,a.address AS sender FROM "SignedSweepOutbox" s JOIN "UserDepositAddress" a ON a.id=s."addressId" AND a.network=s.network WHERE s.id=$1',[sweepId]);
  if(!r)throw new Error('SWEEP_NOT_FOUND');return r;
 });
 if(row.state==='CONFIRMED')return {state:'CONFIRMED'};
 if(!['SIGNED','BROADCAST_UNKNOWN'].includes(String(row.state)))throw new Error('SWEEP_OBSERVER_STATE');
 if(options.dispatchEnabled===true){
  if(!options.send)throw new Error('SWEEP_SEND_ADAPTER_MISSING');
  try{await dispatchSavedSweep(db,sweepId,{enabled:true,send:options.send})}catch{/* Reconcile an older uncertain attempt even if a new dispatch is denied. */}
 }
 try{
  if(row.network!=='TRC20'&&row.network!=='BEP20')throw new Error();
  const data=row.network==='BEP20'?Transaction.from(String(row.signedPayload)).data:JSON.parse(String(row.signedPayload)).raw_data.contract[0].parameter.value.data;
  if(typeof data!=='string'||! /^(0x)?a9059cbb[0-9a-f]{128}$/i.test(data))throw new Error();
  const amountBaseUnits=BigInt('0x'+data.slice(-64)).toString();
  const observed=await observeOutboxTransfer(options,{network:row.network,txId:row.txId,sender:row.sender,recipient:treasuryDestination(row.network,'operating'),amountBaseUnits});
  if(observed.network==='BEP20')await confirmBep20Sweep(db,{sweepId,evidence:observed.evidence});
  else await confirmTronSweep(db,{sweepId,evidence:observed.evidence});
  return {state:'CONFIRMED'};
 }catch{return {state:'HELD',reason:'FINAL_TRANSFER_NOT_PROVEN'}}
}
