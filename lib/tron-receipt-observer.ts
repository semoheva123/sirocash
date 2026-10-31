import 'server-only';
import {chainJsonPost,type ChainHttpOptions} from './chain-http';
import {verifyTronUsdtDeposit,type TronReceiptEvidence} from './tron-deposit-verification';
export type TronRead=(path:'/walletsolidity/getblockbynum'|'/walletsolidity/getnowblock'|'/walletsolidity/gettransactioninfobyid',body:Record<string,unknown>)=>Promise<unknown>;
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('TRON_INVALID_OBJECT');return v as Record<string,unknown>}
function hash(v:unknown){if(typeof v!=='string'||! /^[a-f0-9]{64}$/.test(v))throw new Error('TRON_INVALID_HASH');return v}
function height(v:unknown){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error('TRON_INVALID_HEIGHT');return v}
function block(v:unknown){const b=object(v),raw=object(object(b.block_header).raw_data),n=height(raw.number??0),id=hash(b.blockID);if(id.slice(0,16)!==n.toString(16).padStart(16,'0'))throw new Error('TRON_BLOCK_ID_HEIGHT');return {raw:b,height:n,id}}
export function createTronRead(options:ChainHttpOptions&{signal?:AbortSignal}):TronRead{
 const post=chainJsonPost(options);
 return async(path,body)=>{
  const keys=Object.keys(body);
  if(path==='/walletsolidity/getblockbynum'){if(keys.length!==1||keys[0]!=='num')throw new Error('TRON_READ_NOT_ALLOWED');height(body.num)}
  else if(path==='/walletsolidity/getnowblock'){if(keys.length)throw new Error('TRON_READ_NOT_ALLOWED')}
  else if(path==='/walletsolidity/gettransactioninfobyid'){if(keys.length!==1||keys[0]!=='value')throw new Error('TRON_READ_NOT_ALLOWED');hash(body.value)}
  else throw new Error('TRON_READ_NOT_ALLOWED');
  return post(path,JSON.stringify(body),options.signal);
 };
}
/** Solidified node only: no latest fallback, no credit/posting, no customer receipts.
 * Operator pins a separately verified MAINNET genesis block ID. RPC trust is still required.
 */
export async function observeTronUsdtReceipt(read:TronRead,input:{txId:string;logIndex:number;assignedAddress:string;maxAmountBaseUnits:bigint;genesisId:string}){
 const txId=hash(input.txId),genesisId=hash(input.genesisId);
 if(!genesisId.startsWith('0'.repeat(16)))throw new Error('TRON_GENESIS_CONFIGURATION');
 const genesis=block(await read('/walletsolidity/getblockbynum',{num:0}));
 if(genesis.height!==0||genesis.id!==genesisId)throw new Error('TRON_WRONG_CHAIN');
 const info=object(await read('/walletsolidity/gettransactioninfobyid',{value:txId}));
 if(info.id!==txId||info.result==='FAILED'||object(info.receipt).result!=='SUCCESS')throw new Error('TRON_RECEIPT_UNAVAILABLE_OR_FAILED');
 const n=height(info.blockNumber),solid=block(await read('/walletsolidity/getnowblock',{}));
 if(n>solid.height)throw new Error('TRON_NOT_SOLIDIFIED');
 const included=block(await read('/walletsolidity/getblockbynum',{num:n}));
 if(included.height!==n||!Array.isArray(included.raw.transactions)||included.raw.transactions.length>10000)throw new Error('TRON_BLOCK_INCLUSION');
 const matches=included.raw.transactions.filter(v=>object(v).txID===txId);
 if(matches.length!==1)throw new Error('TRON_BLOCK_INCLUSION');
 const tx=object(matches[0]);
 if(!Array.isArray(tx.ret)||tx.ret.length!==1||object(tx.ret[0]).contractRet!=='SUCCESS')throw new Error('TRON_EXECUTION_FAILED');
 if(!Array.isArray(info.log)||info.log.length>10000)throw new Error('TRON_INVALID_LOGS');
 const logs:TronReceiptEvidence['logs']=info.log.map(v=>{const l=object(v);if(typeof l.address!=='string'||! /^[a-f0-9]{40}$/i.test(l.address)||!Array.isArray(l.topics)||l.topics.length>4||l.topics.some(t=>typeof t!=='string'||! /^[a-f0-9]{64}$/i.test(t))||typeof l.data!=='string'||! /^(?:[a-f0-9]{2})*$/i.test(l.data)||l.data.length>131072)throw new Error('TRON_INVALID_LOG');return {address:l.address,topics:l.topics as string[],data:l.data}});
 const evidence={receipt:{txId,blockNumber:n,blockHash:included.id,execution:'SUCCESS' as const,logs},block:{height:n,hash:included.id,solidHeight:solid.height},logIndex:input.logIndex,assignedAddress:input.assignedAddress,maxAmountBaseUnits:input.maxAmountBaseUnits};
 const event=verifyTronUsdtDeposit(evidence);
 const recheck=block(await read('/walletsolidity/getblockbynum',{num:n}));
 if(recheck.height!==n||recheck.id!==included.id)throw new Error('TRON_OBSERVATION_REORG');
 return {event,evidence};
}
export function productionTronRead(signal?:AbortSignal){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_RPC_READ_ENABLED!=='true')throw new Error('RPC_LIVE_READ_DISABLED');
 const endpoint=process.env.SIRO_TRON_RPC_URL;if(!endpoint)throw new Error('TRON_RPC_CONFIGURATION');
 return createTronRead({endpoint,signal,apiKey:process.env.SIRO_TRON_RPC_API_KEY});
}
