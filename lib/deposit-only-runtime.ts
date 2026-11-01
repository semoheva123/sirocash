import 'server-only';
import {assertDepositOnlyIsolation,depositOnlyConfiguration} from './deposit-only-mode';
import {productionDepositDiscovery} from './deposit-discovery-runtime';
import {createDepositValuationWorker} from './deposit-valuation-worker';
import {runFinancialWorkerBatch} from './financial-worker';
import type {WalletDb} from './wallet-engine';
/** Isolated composition: never constructs a signer, broadcaster, gas or resource worker. */
export function productionDepositOnlyWorkers(db:WalletDb){
 assertDepositOnlyIsolation();
 if(!depositOnlyConfiguration().configurationReady)throw Error('DEPOSIT_ONLY_CONFIGURATION_REQUIRED');
 const blocked=async()=>{throw Error('DEPOSIT_ONLY_SEND_FORBIDDEN')};
 const value=createDepositValuationWorker(db,{enabled:true,settlementAccountId:process.env.SIRO_SETTLEMENT_ACCOUNT_ID??''});
 return {payout:blocked,sweep:blocked,batch:()=>runFinancialWorkerBatch(db,{enabled:true,depositOnly:true,process:async(job,signal)=>{
  assertDepositOnlyIsolation();
  if(job.kind==='DEPOSIT_SCAN')return productionDepositDiscovery(db,signal).process(job.id,signal);
  if(job.kind==='DEPOSIT_VALUE')return value(job.id,signal);
  throw Error('DEPOSIT_ONLY_JOB_FORBIDDEN');
 }})};
}
