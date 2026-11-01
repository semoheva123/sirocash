import 'server-only';
import {depositScannerHealthy} from './deposit-scanner-health';
import {assertDepositOnlyIsolation,depositOnlyConfiguration} from './deposit-only-mode';
import {createNetworkDepositScanner} from './deposit-network-scanner';
import {productionBep20ReadRpc} from './bep20-rpc';
import {productionTronRead} from './tron-receipt-observer';
import {observeUsdtUsdPrice} from './financial-price';
import {createDepositValuationWorker} from './deposit-valuation-worker';
import {runFinancialWorkerBatch} from './financial-worker';
import type {WalletDb} from './wallet-engine';
/** Isolated watch-only composition. No signer, broadcaster, gas or resource worker. */
export function productionDepositOnlyWorkers(db:WalletDb){
 assertDepositOnlyIsolation();
 if(!depositOnlyConfiguration(process.env,{workerOnly:true}).configurationReady)throw Error('DEPOSIT_ONLY_CONFIGURATION_REQUIRED');
 const window=process.env.SIRO_BEP20_SCAN_WINDOW??'1000';
 if(!/^[1-9]\d{0,3}$/.test(window)||Number(window)>1000)throw Error('DEPOSIT_SCAN_WINDOW_INVALID');
 const blocked=async()=>{throw Error('DEPOSIT_ONLY_SEND_FORBIDDEN')};
 return {payout:blocked,sweep:blocked,batch:async()=>{
  let price:Awaited<ReturnType<typeof observeUsdtUsdPrice>>|undefined;
  const value=createDepositValuationWorker(db,{enabled:true,settlementAccountId:process.env.SIRO_SETTLEMENT_ACCOUNT_ID??'',price:async()=>{if(!price||Date.now()-Date.parse(price.observedAt)>10000)price=await observeUsdtUsdPrice();return price}});
  const deadline=Date.now()+110000;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),110000);
  const scanner=createNetworkDepositScanner(db,{bep20:productionBep20ReadRpc(abort.signal),tron:productionTronRead(abort.signal),genesisId:process.env.SIRO_TRON_GENESIS_ID!,bep20Window:Number(window),minimumConfirmations:Number(process.env.SIRO_BEP20_MIN_CONFIRMATIONS??'15'),maxAmount:network=>BigInt(process.env[`SIRO_${network}_MAX_TOKEN_BASE_UNITS`]!)});
  let scans=0,held=0,staged=0;
  const stopped=new Set<string>();
  try{
   // Shared reads: a BEP20 job covers <=1000 blocks for <=2048 addresses; a TRON job
   // reads one complete receipt batch for all addresses, not 3 transactions per user.
   for(let round=0;round<1000&&Date.now()+25000<deadline&&!abort.signal.aborted&&stopped.size<2;round++){
    for(const network of ['BEP20','TRC20'] as const){
     if(stopped.has(network)||abort.signal.aborted)continue;
     assertDepositOnlyIsolation();
     try{const result=await scanner.scan(network,abort.signal);scans++;staged+='staged' in result?result.staged??0:0;if(result.state!=='PROGRESSED')stopped.add(network)}catch{held++;stopped.add(network)}
    }
   }
   const credit=await runFinancialWorkerBatch(db,{enabled:true,depositOnly:true,depositValuesOnly:true,limit:128,jobTimeoutMs:5000,batchTimeoutMs:Math.max(100,Math.min(25000,deadline-Date.now()-1000)),process:async(job,signal)=>{
    assertDepositOnlyIsolation();if(job.kind!=='DEPOSIT_VALUE')throw Error('DEPOSIT_ONLY_JOB_FORBIDDEN');return value(job.id,signal);
   }});
   return {state:'COMPLETED',scans,staged,held:held+credit.held,valuations:credit.processed,healthy:await depositScannerHealthy(db)};
  }finally{clearTimeout(timer);abort.abort()}
 },};
}
