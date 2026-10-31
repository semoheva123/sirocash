import 'server-only';
import {randomUUID} from 'node:crypto';
import {chainJsonPost,type ChainHttpOptions} from './chain-http';
export function rpcObject(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('FINANCIAL_RPC_OBJECT');return v as Record<string,unknown>}
export function rpcQuantity(v:unknown){if(typeof v!=='string'||v.length>66||!/^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(v))throw new Error('FINANCIAL_RPC_QUANTITY');return BigInt(v)}
export function financialBscRpc(options:ChainHttpOptions){
 const post=chainJsonPost(options);
 return async(method:'eth_chainId'|'eth_getTransactionCount'|'eth_getBalance'|'eth_gasPrice'|'eth_call'|'eth_estimateGas'|'eth_sendRawTransaction'|'eth_getTransactionReceipt'|'eth_getBlockByNumber'|'eth_blockNumber',params:unknown[],signal:AbortSignal)=>{
  const id=randomUUID(),r=rpcObject(await post('/',JSON.stringify({jsonrpc:'2.0',id,method,params}),signal));
  if(r.jsonrpc!=='2.0'||r.id!==id||Object.hasOwn(r,'error')||!Object.hasOwn(r,'result'))throw new Error('FINANCIAL_RPC_ENVELOPE');return r.result;
 };
}
