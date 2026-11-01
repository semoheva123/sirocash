import {probeNetworkReadiness} from '../lib/network-readiness';
import {createBep20ReadRpc} from '../lib/bep20-rpc';
import {observeUsdtUsdPrice} from '../lib/financial-price';
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
  console.log('DEPOSIT_READ_CAPACITY:NOT_ACCEPTED_CURRENT_SCANNER_MAX_ONE_BLOCK_THREE_TRANSACTIONS_PER_ADDRESS_JOB');
 }catch{console.log('DEPOSIT_READ_PROBE:REFUSED_REQUIRES_DISABLED_FINANCIAL_EXECUTION')}
 console.log('DEPOSIT_READ_PROBE:NO_ACTIVATION_NO_WRITES_NO_PURCHASE_NO_BROADCAST');
}
void main().catch(()=>{console.error('DEPOSIT_READ_PROBE:FAILED_NO_RESPONSE_LOGGED');process.exitCode=1});
