import {probeNetworkReadiness} from '../lib/network-readiness';
import {createBep20ReadRpc} from '../lib/bep20-rpc';
import {observeUsdtUsdPrice} from '../lib/financial-price';
import {createTronRead} from '../lib/tron-receipt-observer';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
/** Opt-in read-only BUILD diagnostic. Cannot enable reception, sign, buy, post or allocate.
 * No accounts, wallet balances, secrets or provider response bodies are logged. */
async function main(){
 if(process.env.SIRO_DEPOSIT_READINESS_PROBE!=='true'){console.log('Deposit reception probe: skipped.');return}
 try{
  for(const result of await probeNetworkReadiness(process.env))console.log('DEPOSIT_READ_NETWORK:'+JSON.stringify(result));
  try{
   if(!process.env.SIRO_BEP20_RPC_URL)throw Error();
   const rpc=createBep20ReadRpc({endpoint:process.env.SIRO_BEP20_RPC_URL,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION});
   const block=await rpc('eth_getBlockByNumber',['finalized',false]) as {number?:unknown};
   if(typeof block?.number!=='string'||!/^0x[0-9a-f]+$/i.test(block.number))throw Error();
   const result=await rpc('eth_getLogs',[{fromBlock:block.number,toBlock:block.number,address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,'0x'+'0'.repeat(64)]}]);
   if(!Array.isArray(result))throw Error();
   console.log('DEPOSIT_READ_BEP20_LOGS:SUPPORTED');
  }catch{console.log('DEPOSIT_READ_BEP20_LOGS:FAILED')}
  try{await observeUsdtUsdPrice();console.log('DEPOSIT_READ_PRICE:OBSERVED')}catch{console.log('DEPOSIT_READ_PRICE:FAILED')}
  for(const [name,endpoint] of [['PUBLICNODE','https://bsc-rpc.publicnode.com'],['BLAST_PUBLIC','https://bsc-mainnet.public.blastapi.io']] as const){
   try{
    const rpc=createBep20ReadRpc({endpoint});if(await rpc('eth_chainId',[])!=='0x38')throw Error();
    const b=await rpc('eth_getBlockByNumber',['finalized',false]) as {number:string};
    const n=BigInt(b.number),from='0x'+(n>999n?n-999n:0n).toString(16);
    const logs=await rpc('eth_getLogs',[{fromBlock:from,toBlock:b.number,address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,['0x'+'0'.repeat(64),'0x'+'0'.repeat(63)+'1']]}]);
    if(!Array.isArray(logs))throw Error();console.log('DEPOSIT_READ_CANDIDATE:'+name+':CHAIN56_FINALIZED_RANGE1000_OR_LOGS_VERIFIED');
   }catch{console.log('DEPOSIT_READ_CANDIDATE:'+name+':FAILED')}
  }
  try{
   const read=createTronRead({endpoint:process.env.SIRO_TRON_RPC_URL!,apiKey:process.env.SIRO_TRON_RPC_API_KEY,maxResponseBytes:8388608});
   const tip=await read('/walletsolidity/getnowblock',{}) as {block_header:{raw_data:{number:number}}};
   const n=tip.block_header.raw_data.number;
   const b=await read('/walletsolidity/getblockbynum',{num:n}) as {transactions?:{txID:string}[]};
   const receipts=await read('/wallet/gettransactioninfobyblocknum',{num:n});
   if(!Array.isArray(receipts)||receipts.length!==(b.transactions??[]).length)throw Error();
   const ids=new Set(receipts.map((r:{id:string})=>r.id));if(ids.size!==receipts.length||(b.transactions??[]).some(t=>!ids.has(t.txID)))throw Error();
   console.log('DEPOSIT_READ_TRON_BULK:COMPLETE_CANONICAL_TRANSACTION_SET_VERIFIED');
  }catch{console.log('DEPOSIT_READ_TRON_BULK:FAILED')}
  console.log('DEPOSIT_READ_CAPACITY:SHARED_RANGE_AND_BULK_SCANNER_TESTED_OFFLINE_LIVE_LOAD_ACCEPTANCE_STILL_REQUIRED');
 }catch{console.log('DEPOSIT_READ_PROBE:REFUSED_REQUIRES_DISABLED_FINANCIAL_EXECUTION')}
 console.log('DEPOSIT_READ_PROBE:NO_ACTIVATION_NO_WRITES_NO_PURCHASE_NO_BROADCAST');
}
void main().catch(()=>{console.error('DEPOSIT_READ_PROBE:FAILED_NO_RESPONSE_LOGGED');process.exitCode=1});
