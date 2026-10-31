import 'server-only';
import {randomUUID} from 'node:crypto';
import {Transaction,Interface} from 'ethers';
import {TronWeb,utils} from 'tronweb';
import {chainJsonPost,type ChainHttpOptions} from './chain-http';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {tronUsdtContract} from './tron-deposit-verification';
import type {signTrc20Usdt} from './vercel-treasury-signer';
const abi=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
export type ChainSendInput={network:'TRC20'|'BEP20';txId:string;signedPayload:string;signal:AbortSignal};
/** Use ONLY as the send callback AFTER a durable dispatch claim. No retries, signing or key loads.
 * Throws for every rejection/duplicate/timeout; caller retains UNKNOWN, never refunds on error.
 */
export function createChainBroadcaster(options:{bep20:ChainHttpOptions;tron:ChainHttpOptions;tronGenesisId:string;enabled?:boolean}){
 if(options.enabled!==true)throw new Error('CHAIN_BROADCAST_DISABLED');
 if(!/^0{16}[a-f0-9]{48}$/.test(options.tronGenesisId))throw new Error('CHAIN_GENESIS_CONFIGURATION');
 const bsc=chainJsonPost(options.bep20),tron=chainJsonPost(options.tron);
 async function rpc(method:string,params:unknown[],signal:AbortSignal){
  const id=randomUUID();const raw=await bsc('/',JSON.stringify({jsonrpc:'2.0',id,method,params}),signal);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('BROADCAST_RPC_RESPONSE');
  const r=raw as Record<string,unknown>;
  if(r.id!==id||r.jsonrpc!=='2.0'||Object.hasOwn(r,'error')||!Object.hasOwn(r,'result'))throw new Error('BROADCAST_RPC_RESPONSE');
  return r.result;
 }
 return async(input:ChainSendInput):Promise<{txId:string}>=>{
  try{
   if(input.signal.aborted||typeof input.signedPayload!=='string'||input.signedPayload.length>131072)throw new Error();
   if(input.network==='BEP20'){
    if(!/^0x[a-f0-9]{64}$/i.test(input.txId)||!/^0x(?:[a-f0-9]{2})+$/i.test(input.signedPayload))throw new Error();
    const tx=Transaction.from(input.signedPayload),call=abi.decodeFunctionData('transfer',tx.data);
    if(!tx.signature||!tx.from||tx.hash?.toLowerCase()!==input.txId.toLowerCase()||tx.chainId!==56n||tx.type!==0||tx.value!==0n||tx.to?.toLowerCase()!==bep20UsdtContract.toLowerCase()||call[1]<=0n||tx.data!==abi.encodeFunctionData('transfer',[call[0],call[1]]))throw new Error();
    if(await rpc('eth_chainId',[],input.signal)!=='0x38')throw new Error();
    const result=await rpc('eth_sendRawTransaction',[input.signedPayload],input.signal);
    if(typeof result!=='string'||result.toLowerCase()!==input.txId.toLowerCase())throw new Error();
   }else if(input.network==='TRC20'){
    if(!/^[a-f0-9]{64}$/.test(input.txId))throw new Error();
    const tx=JSON.parse(input.signedPayload) as ReturnType<typeof signTrc20Usdt>['transaction'];
    if(!utils.transaction.txCheck(tx)||tx.txID!==input.txId||tx.signature?.length!==1||tx.raw_data.contract.length!==1||!Number.isSafeInteger(tx.raw_data.expiration)||tx.raw_data.expiration<=Date.now())throw new Error();
    const c=tx.raw_data.contract[0],v=c.parameter.value as {owner_address:string;contract_address:string;data:string;call_value?:number;call_token_value?:number;token_id?:number};
    if(c.type!=='TriggerSmartContract'||v.contract_address.toLowerCase()!==TronWeb.address.toHex(tronUsdtContract).toLowerCase()||!/^a9059cbb[0-9a-f]{128}$/.test(v.data)||BigInt('0x'+v.data.slice(-64))<=0n||(v.call_value??0)!==0||(v.call_token_value??0)!==0||(v.token_id??0)!==0||utils.crypto.ecRecover(tx.txID,tx.signature[0]).toLowerCase()!==v.owner_address.toLowerCase())throw new Error();
    const genesis=await tron('/walletsolidity/getblockbynum',JSON.stringify({num:0}),input.signal) as Record<string,unknown>;
    if(genesis?.blockID!==options.tronGenesisId||tx.raw_data.expiration<=Date.now())throw new Error();
    const result=await tron('/wallet/broadcasttransaction',input.signedPayload,input.signal) as Record<string,unknown>;
    if(result?.result!==true||result.txid!==input.txId||Object.hasOwn(result,'code'))throw new Error();
   }else throw new Error();
   return {txId:input.txId};
  }catch{throw new Error('CHAIN_BROADCAST_UNCERTAIN')}
 };
}
/** Independent fail-closed gate. Does not switch signing on or expose a route. */
export function productionChainBroadcaster(){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_BROADCAST_ENABLED!=='true')throw new Error('CHAIN_BROADCAST_DISABLED');
 const bep20=process.env.SIRO_BEP20_RPC_URL,tron=process.env.SIRO_TRON_RPC_URL,genesis=process.env.SIRO_TRON_GENESIS_ID;
 if(!bep20||!tron||!genesis)throw new Error('CHAIN_BROADCAST_CONFIGURATION');
 return createChainBroadcaster({enabled:true,bep20:{endpoint:bep20,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION},tron:{endpoint:tron,apiKey:process.env.SIRO_TRON_RPC_API_KEY},tronGenesisId:genesis});
}
