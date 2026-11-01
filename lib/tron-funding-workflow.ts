/** Private deterministic workflow planner. Actions are NOT authority to sign/broadcast.
 * Worker must persist/claim each action and revalidate policy, approvals and chain evidence.
 */
import {createHash} from 'node:crypto';
import {quoteUsdtWithdrawal} from './withdrawal-fees';
import {planTronEnergy,type EnergyPackage} from './tron-energy';
import {validTronAddress} from './tron-addresses';

type Resource = {
 required:number;available:number;bandwidthReady:boolean;nativeFeeReserveReady:boolean;
 rentalState:'NONE'|'PENDING'|'UNKNOWN'|'DELIVERED';rentalPriceSun:bigint;
 quoteExpiresAt:number;delegationExpiresAt:number;priceCapEnforceable:boolean;
};
type SweepSource={address:string;spendable:bigint;economical:boolean;resource:Resource};
export type TronFundingInput={
 operationId:string;gross:string;destination:string;operatingAddress:string;
 operatingSpendable:bigint;fundingReservedForOperation:boolean;reservationValid:boolean;
 deviceApprovalValid:boolean;reconciled:boolean;observedAt:number;now:number;
 maxEvidenceAgeMs:number;maxRentalSun:bigint;minExecutionWindowMs:number;
 catalog:EnergyPackage[];payoutResource:Resource;sources:SweepSource[];
 pendingSweepTxId:string|null;payoutTxId:string|null;
 payoutFinality:'UNKNOWN'|'CONFIRMED'|'REJECTED';
};
export type TronFundingAction=
 | {type:'WAIT';reason:string}
 | {type:'RECONCILE';kind:'SWEEP'|'PAYOUT';txId:string}
 | {type:'RENT_ENERGY';sender:string;package:EnergyPackage;maxRentalSun:string;actionKey:string}
 | {type:'PREPARE_TRANSFER';kind:'SWEEP'|'PAYOUT';sender:string;destination:string;amountBaseUnits:string;actionKey:string}
 | {type:'SETTLE';txId:string;outcome:'CONFIRMED'|'REJECTED'};
const micros=(s:string)=>{const [w,f='']=s.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'))};
export function planTronFunding(input:TronFundingInput):TronFundingAction {
 const i=input;
 if(!/^[a-zA-Z0-9:_-]{8,128}$/.test(i.operationId)||!validTronAddress(i.destination)||!validTronAddress(i.operatingAddress)||i.destination===i.operatingAddress)throw new Error('INVALID_WORKFLOW_ID_OR_ADDRESS');
 if(i.operatingSpendable<0n||i.maxRentalSun<=0n||!Number.isSafeInteger(i.maxEvidenceAgeMs)||i.maxEvidenceAgeMs<=0||!Number.isSafeInteger(i.minExecutionWindowMs)||i.minExecutionWindowMs<=0)throw new Error('INVALID_WORKFLOW_POLICY');
 const quote=quoteUsdtWithdrawal('TRC20',i.gross),net=micros(quote.net);
 const wait=(reason:string):TronFundingAction=>({type:'WAIT',reason});
 const tx=(value:string)=>{if(!/^[a-f0-9]{64}$/.test(value))throw new Error('INVALID_TRANSACTION_ID');return value};
 // Always reconcile existing external attempts before selecting another sender or rental.
 if(i.payoutTxId){
  const txId=tx(i.payoutTxId);
  if(i.payoutFinality==='UNKNOWN')return {type:'RECONCILE',kind:'PAYOUT',txId};
  // Finality and rejection must come from trusted chain reconciliation, never a timeout.
  if(!i.reconciled)return wait('RECONCILIATION_REQUIRED');
  return {type:'SETTLE',txId,outcome:i.payoutFinality};
 }
 if(i.payoutFinality!=='UNKNOWN')throw new Error('FINALITY_WITHOUT_TRANSACTION');
 if(i.pendingSweepTxId)return {type:'RECONCILE',kind:'SWEEP',txId:tx(i.pendingSweepTxId)};
 if(!i.reconciled)return wait('RECONCILIATION_REQUIRED');
 if(!Number.isSafeInteger(i.now)||!Number.isSafeInteger(i.observedAt)||i.observedAt<0||i.now<0||i.observedAt>i.now||i.now-i.observedAt>i.maxEvidenceAgeMs)return wait('STALE_CHAIN_EVIDENCE');
 if(!i.reservationValid||!i.deviceApprovalValid)return wait('EXACT_RESERVATION_AND_DEVICE_APPROVAL_REQUIRED');
 const resource=(sender:string,r:Resource,key:string):TronFundingAction|null=>{
  if(!Number.isSafeInteger(r.required)||r.required<=0||!Number.isSafeInteger(r.available)||r.available<0||r.rentalPriceSun<0n)throw new Error('INVALID_RESOURCE_EVIDENCE');
  if(r.rentalState==='UNKNOWN'||r.rentalState==='PENDING')return wait('RECONCILE_EXISTING_RENTAL');
  if(!r.nativeFeeReserveReady||!r.bandwidthReady)return wait('NATIVE_GAS_OR_BANDWIDTH_REQUIRED');
  if(r.available>=r.required){
   if(r.rentalState==='DELIVERED'&&(!Number.isSafeInteger(r.delegationExpiresAt)||r.delegationExpiresAt-i.now<i.minExecutionWindowMs))return wait('DELEGATION_WINDOW_TOO_SHORT');
   return null;
  }
  // Do not pay again for allegedly delivered but insufficient resources.
  if(r.rentalState==='DELIVERED')return wait('DELIVERED_RESOURCES_INSUFFICIENT');
  if(!r.priceCapEnforceable)return wait('PROVIDER_PRICE_CAP_NOT_ENFORCED');
  if(!Number.isSafeInteger(r.quoteExpiresAt)||r.quoteExpiresAt<=i.now||r.rentalPriceSun<=0n||r.rentalPriceSun>i.maxRentalSun)return wait('RENTAL_QUOTE_INVALID_OR_OVER_BUDGET');
  const planned=planTronEnergy(r.required,r.available,i.catalog);
  if(!planned.package)throw new Error('INVALID_ENERGY_PLAN');
  return {type:'RENT_ENERGY',sender,package:planned.package,maxRentalSun:i.maxRentalSun.toString(),actionKey:key+':energy'};
 };
 const keyFor=(kind:string,sender:string,destination:string,amount:bigint)=>'tron:'+createHash('sha256').update(JSON.stringify([i.operationId,quote.policy,quote.gross,quote.fee,quote.net,kind,sender,destination,amount.toString()])).digest('hex');
 if(i.operatingSpendable>=net){
  if(!i.fundingReservedForOperation)return wait('ATOMIC_TREASURY_ALLOCATION_REQUIRED');
  const key=keyFor('PAYOUT',i.operatingAddress,i.destination,net);
  const energy=resource(i.operatingAddress,i.payoutResource,key);if(energy)return energy;
  return {type:'PREPARE_TRANSFER',kind:'PAYOUT',sender:i.operatingAddress,destination:i.destination,amountBaseUnits:net.toString(),actionKey:key};
 }
 // No unnecessary sweep: only cover the currently missing payout liquidity.
 const shortage=net-i.operatingSpendable;
 const seen=new Set<string>();
 for(const s of i.sources){
  if(!validTronAddress(s.address)||s.address===i.operatingAddress||seen.has(s.address)||s.spendable<0n)throw new Error('INVALID_SWEEP_SOURCE');seen.add(s.address);
 }
 const source=i.sources.filter(s=>s.economical&&s.spendable>0n).sort((a,b)=>a.spendable===b.spendable?a.address.localeCompare(b.address):a.spendable>b.spendable?-1:1)[0];
 if(!source)return wait('NO_ECONOMICAL_SWEEP_SOURCE');
 const amount=source.spendable<shortage?source.spendable:shortage;
 const key=keyFor('SWEEP',source.address,i.operatingAddress,amount);
 const energy=resource(source.address,source.resource,key);if(energy)return energy;
 return {type:'PREPARE_TRANSFER',kind:'SWEEP',sender:source.address,destination:i.operatingAddress,amountBaseUnits:amount.toString(),actionKey:key};
}
