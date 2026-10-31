import 'server-only';
import {createBep20ReadRpc} from './bep20-rpc';
import {createTronRead} from './tron-receipt-observer';
const hex=/^[a-f0-9]{64}$/;
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v as Record<string,unknown>}
function quantity(v:unknown){if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(v))throw new Error();const n=Number(BigInt(v));if(!Number.isSafeInteger(n))throw new Error();return n}
function fresh(timestamp:number,now:number){if(!Number.isSafeInteger(timestamp)||timestamp>now+30000||now-timestamp>120000)throw new Error()}
/** Diagnostic ONLY. Public fallback endpoints never configure/enable production financial workers.
 * Returns only public chain metadata and safe statuses. No wallet/key/DB/order/broadcast calls.
 */
export async function probeNetworkReadiness(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch,now=Date.now()){
 if(env.VERCEL_ENV!=='production'||env.SIRO_SIGNER_ENABLED!=='false'||env.SIRO_BROADCAST_ENABLED==='true'||env.SIRO_OUTBOX_WORKER_ENABLED==='true')throw new Error('NETWORK_PROBE_REQUIRES_DISABLED_FINANCE');
 const bep20=async()=>{
  const configured=!!env.SIRO_BEP20_RPC_URL;
  try{
   const rpc=createBep20ReadRpc({endpoint:env.SIRO_BEP20_RPC_URL??'https://bsc-dataseed.binance.org',authorization:configured?env.SIRO_BEP20_RPC_AUTHORIZATION:undefined,fetch:fetcher});
   if(quantity(await rpc('eth_chainId',[]))!==56)throw new Error();
   const height=quantity(await rpc('eth_blockNumber',[]));
   const head=object(await rpc('eth_getBlockByNumber',['0x'+height.toString(16),false]));
   if(quantity(head.number)!==height||typeof head.hash!=='string'||!/^0x[a-f0-9]{64}$/i.test(head.hash))throw new Error();
   fresh(quantity(head.timestamp)*1000,now);
   const finalized=object(await rpc('eth_getBlockByNumber',['finalized',false]));
   const finalHeight=quantity(finalized.number);
   if(finalHeight>height||height-finalHeight>10000||typeof finalized.hash!=='string'||!/^0x[a-f0-9]{64}$/i.test(finalized.hash))throw new Error();
   return {network:'BEP20',source:configured?'OPERATOR_CONFIGURED':'PUBLIC_DIAGNOSTIC_ONLY',status:'READ_CHAIN56_FINALIZED_VERIFIED',height,finalizedHeight:finalHeight};
  }catch{return {network:'BEP20',source:configured?'OPERATOR_CONFIGURED':'PUBLIC_DIAGNOSTIC_ONLY',status:'READ_PREFLIGHT_FAILED'}}
 };
 const tron=async()=>{
  const configured=!!env.SIRO_TRON_RPC_URL;
  try{
   const read=createTronRead({endpoint:env.SIRO_TRON_RPC_URL??'https://api.trongrid.io',apiKey:configured?env.SIRO_TRON_RPC_API_KEY:undefined,fetch:fetcher});
   const genesis=object(await read('/walletsolidity/getblockbynum',{num:0}));
   const genesisId=genesis.blockID;
   if(typeof genesisId!=='string'||!hex.test(genesisId)||!genesisId.startsWith('0'.repeat(16)))throw new Error();
   if(env.SIRO_TRON_GENESIS_ID&&env.SIRO_TRON_GENESIS_ID!==genesisId)throw new Error();
   const tip=object(await read('/walletsolidity/getnowblock',{})),raw=object(object(tip.block_header).raw_data);
   const height=raw.number;
   if(typeof height!=='number'||!Number.isSafeInteger(height)||height<=0||typeof tip.blockID!=='string'||!hex.test(tip.blockID)||tip.blockID.slice(0,16)!==height.toString(16).padStart(16,'0'))throw new Error();
   fresh(Number(raw.timestamp),now);
   return {network:'TRC20',source:configured?'OPERATOR_CONFIGURED':'PUBLIC_DIAGNOSTIC_ONLY',status:'READ_SOLID_TIP_VERIFIED',height,observedGenesisId:genesisId,genesisPinned:!!env.SIRO_TRON_GENESIS_ID};
  }catch{return {network:'TRC20',source:configured?'OPERATOR_CONFIGURED':'PUBLIC_DIAGNOSTIC_ONLY',status:'READ_PREFLIGHT_FAILED'}}
 };
 return Promise.all([bep20(),tron()]);
}
