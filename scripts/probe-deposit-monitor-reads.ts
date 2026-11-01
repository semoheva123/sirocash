import {depositOnlyMode,assertDepositOnlyIsolation} from '../lib/deposit-only-mode';
import {productionBep20ReadRpc} from '../lib/bep20-rpc';
import {productionTronRead} from '../lib/tron-receipt-observer';
import {createNetworkDepositScanner} from '../lib/deposit-network-scanner';
import {financialReadDatabase} from '../lib/financial-database';
import {depositMonitorFailureCode} from '../lib/deposit-monitor-diagnostics';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
async function main(){
 if(process.env.VERCEL_ENV!=='production'||!depositOnlyMode()||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true'){console.log('Deposit monitor live reads: disabled.');return}
 assertDepositOnlyIsolation();
 const signal=AbortSignal.timeout(40000),bep20=productionBep20ReadRpc(signal),tron=productionTronRead(signal);
 const scanner=createNetworkDepositScanner(financialReadDatabase(),{bep20,tron,genesisId:process.env.SIRO_TRON_GENESIS_ID??'',minimumConfirmations:Number(process.env.SIRO_BEP20_MIN_CONFIRMATIONS??'15'),maxAmount:()=>1n});
 const results=await Promise.all((['BEP20','TRC20'] as const).map(async network=>{
  let stage='FINALITY';
  try{
   const head=await scanner.finalHeight(network);stage='DISCOVERY';
   if(network==='BEP20'){
    const logs=await bep20('eth_getLogs',[{fromBlock:'0x'+head.toString(16),toBlock:'0x'+head.toString(16),address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,'0x'+'0'.repeat(64)]}]);
    if(!Array.isArray(logs))throw Error('SCAN_INVALID_OBJECT');
   }else if(!Array.isArray(await tron('/wallet/gettransactioninfobyblocknum',{num:head})))throw Error('SCAN_BULK_RECEIPTS_UNAVAILABLE');
   return {network,stage,status:'PASS'};
  }catch(error){return {network,stage,status:'FAILED',failureCode:depositMonitorFailureCode(error)}}
 }));
 for(const result of results)console.log('DEPOSIT_MONITOR_READ_CHECK:'+JSON.stringify(result));
 if(results.some(r=>r.status!=='PASS'))throw Error('LIVE_READ_FAILED');
}
void main().catch(()=>{console.error('Deposit monitor live reads: FAILED; no scanner timestamps or funds changed.');process.exitCode=1});
