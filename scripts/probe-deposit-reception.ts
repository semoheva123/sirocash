import {probeNetworkReadiness} from '../lib/network-readiness';
import {createBep20DiscoveryRpc} from '../lib/bep20-rpc';
import {observeUsdtUsdPrice} from '../lib/financial-price';
import {createTronRead} from '../lib/tron-receipt-observer';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
const safeFailure=(e:unknown)=>e instanceof Error&&/^RPC_(?:HTTP_FAILURE|CONTENT_TYPE_INVALID|RESPONSE_TOO_LARGE|EMPTY_RESPONSE|TIMEOUT|INVALID_JSON|INVALID_ENVELOPE|TRANSPORT_FAILURE|READ_METHOD_NOT_ALLOWED)$/.test(e.message)?e.message:'UNEXPECTED_RESULT';
/** Opt-in read-only BUILD diagnostic. Cannot enable reception, sign, buy, post or allocate.
 * No accounts, wallet balances, secrets or provider response bodies are logged. */
async function main(){
 if(process.env.SIRO_DEPOSIT_READINESS_PROBE!=='true'){console.log('Deposit reception probe: skipped.');return}
 try{
  for(const result of await probeNetworkReadiness(process.env))console.log('DEPOSIT_READ_NETWORK:'+JSON.stringify(result));
  try{
   if(!process.env.SIRO_BEP20_RPC_URL)throw Error();
   const rpc=createBep20DiscoveryRpc({endpoint:process.env.SIRO_BEP20_RPC_URL,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION,diagnostic:info=>console.log('DEPOSIT_READ_CONFIGURED_RPC:'+JSON.stringify(info))},process.env.SIRO_BEP20_LOG_RPC_URL?{endpoint:process.env.SIRO_BEP20_LOG_RPC_URL,diagnostic:info=>console.log('DEPOSIT_READ_INDEX_RPC:'+JSON.stringify(info))}:undefined);
   const block=await rpc('eth_getBlockByNumber',['finalized',false]) as {number?:unknown};
   if(typeof block?.number!=='string'||!/^0x[0-9a-f]+$/i.test(block.number))throw Error();
   const result=await rpc('eth_getLogs',[{fromBlock:'0x'+(BigInt(block.number)-20n).toString(16),toBlock:'0x'+(BigInt(block.number)-20n).toString(16),address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,'0x'+'0'.repeat(64)]}]);
   if(!Array.isArray(result))throw Error();
   console.log('DEPOSIT_READ_BEP20_LOGS:SUPPORTED');
  }catch(e){console.log('DEPOSIT_READ_BEP20_LOGS:FAILED:'+safeFailure(e))}
  try{await observeUsdtUsdPrice();console.log('DEPOSIT_READ_PRICE:OBSERVED')}catch{console.log('DEPOSIT_READ_PRICE:FAILED')}
  for(const [name,endpoint] of [['ONE_RPC_PUBLIC','https://1rpc.io/bnb']] as const){
   let phase='CHAIN';
   try{
    const rpc=createBep20DiscoveryRpc({endpoint:process.env.SIRO_BEP20_RPC_URL!,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION},{endpoint,diagnostic:info=>console.log('DEPOSIT_READ_CANDIDATE_RPC:'+name+':'+JSON.stringify(info))});if(await rpc('eth_chainId',[])!=='0x38')throw Error();
    phase='FINALIZED';const b=await rpc('eth_getBlockByNumber',['finalized',false]) as {number:string};
    const n=BigInt(b.number)-20n,from='0x'+(n>999n?n-999n:0n).toString(16);
    phase='FILTERED_LOGS';const filter={fromBlock:from,toBlock:'0x'+n.toString(16),address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,['0x'+'0'.repeat(64),'0x'+'0'.repeat(63)+'1']]};
    let logs:unknown;try{logs=await rpc('eth_getLogs',[filter])}catch(e){
     console.log('DEPOSIT_READ_CANDIDATE:'+name+':RANGE1000_REJECTED:'+safeFailure(e));
     const began=Date.now();let window=100;
     try{logs=await rpc('eth_getLogs',[{...filter,fromBlock:'0x'+(n-99n).toString(16)}])}catch{window=10;logs=await rpc('eth_getLogs',[{...filter,fromBlock:'0x'+(n-9n).toString(16)}])}
     console.log('DEPOSIT_READ_CANDIDATE_LATENCY:'+name+':'+JSON.stringify({window,milliseconds:Date.now()-began}));
     if(!Array.isArray(logs))throw Error();console.log('DEPOSIT_READ_CANDIDATE:'+name+':CHAIN56_FINALIZED_RANGE'+window+'_OR_LOGS_VERIFIED');continue;
    }
    if(!Array.isArray(logs))throw Error();console.log('DEPOSIT_READ_CANDIDATE:'+name+':CHAIN56_FINALIZED_RANGE1000_OR_LOGS_VERIFIED');
   }catch(e){console.log('DEPOSIT_READ_CANDIDATE:'+name+':FAILED:'+phase+':'+safeFailure(e))}
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
