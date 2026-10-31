import 'server-only';
import {getAddress} from 'ethers';
import {verifyBep20UsdtDeposit,type Bep20ReceiptEvidence} from './bep20-deposit-verification';
/** Trusted RPC transport must enforce endpoint auth, timeout, response-size and error limits.
 * No transport supplied by customers. RPC assertions are not a cryptographic inclusion proof.
 */
export type Bep20Rpc=(method:string,params:unknown[])=>Promise<unknown>;
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('INVALID_RPC_OBJECT');return v as Record<string,unknown>}
function hash(v:unknown){if(typeof v!=='string'||!/^0x[a-f0-9]{64}$/i.test(v))throw new Error('INVALID_RPC_HASH');return v.toLowerCase()}
function quantity(v:unknown){
 if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(v))throw new Error('INVALID_RPC_QUANTITY');
 const n=BigInt(v);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('RPC_QUANTITY_OUT_OF_RANGE');return Number(n);
}
function address(v:unknown){if(typeof v!=='string')throw new Error('INVALID_RPC_ADDRESS');return getAddress(v)}
/** Read-only successful receipt observation. Not a watcher/checkpoint/reorg worker or a ledger poster.
 * Requires finalized-tag support; never silently substitutes latest for finalized.
 */
export async function observeBep20UsdtReceipt(rpc:Bep20Rpc,input:{txId:string;logIndex:number;assignedAddress:string;maxAmountBaseUnits:bigint;minimumConfirmations:number}){
 const txId=hash(input.txId);
 if(quantity(await rpc('eth_chainId',[]))!==56)throw new Error('WRONG_DEPOSIT_CHAIN');
 const raw=await rpc('eth_getTransactionReceipt',[txId]);
 if(raw===null)throw new Error('DEPOSIT_RECEIPT_UNAVAILABLE');
 const receipt=object(raw),blockNumber=quantity(receipt.blockNumber),blockHash=hash(receipt.blockHash);
 if(hash(receipt.transactionHash)!==txId||quantity(receipt.status)!==1)throw new Error('DEPOSIT_RECEIPT_FAILED_OR_MISMATCHED');
 const transactionIndex=quantity(receipt.transactionIndex);
 const block=object(await rpc('eth_getBlockByNumber',['0x'+blockNumber.toString(16),false]));
 if(quantity(block.number)!==blockNumber||hash(block.hash)!==blockHash||!Array.isArray(block.transactions)||
   transactionIndex>=block.transactions.length||hash(block.transactions[transactionIndex])!==txId||
   block.transactions.filter(v=>typeof v==='string'&&v.toLowerCase()===txId).length!==1)throw new Error('DEPOSIT_BLOCK_INCLUSION_MISMATCH');
 const finalized=object(await rpc('eth_getBlockByNumber',['finalized',false]));
 hash(finalized.hash);
 const finalizedHeight=quantity(finalized.number);
 const headHeight=quantity(await rpc('eth_blockNumber',[]));
 if(!Array.isArray(receipt.logs)||receipt.logs.length>10000)throw new Error('INVALID_RPC_LOGS');
 const logs:Bep20ReceiptEvidence['logs']=receipt.logs.map(rawLog=>{
  const log=object(rawLog);
  if(hash(log.transactionHash)!==txId||hash(log.blockHash)!==blockHash||quantity(log.blockNumber)!==blockNumber||
   quantity(log.transactionIndex)!==transactionIndex||log.removed!==false||!Array.isArray(log.topics)||
   log.topics.length>4||typeof log.data!=='string'||!/^0x(?:[a-f0-9]{2})*$/i.test(log.data)||log.data.length>131074)throw new Error('DEPOSIT_RPC_LOG_CONTEXT_MISMATCH');
  return {address:address(log.address),topics:log.topics.map(hash),data:log.data,logIndex:quantity(log.logIndex),removed:false};
 });
 const evidence={receipt:{chainId:56,txId,blockNumber,blockHash,execution:'SUCCESS' as const,logs},block:{chainId:56,height:blockNumber,hash:blockHash,headHeight,finalizedHeight},logIndex:input.logIndex,assignedAddress:input.assignedAddress,maxAmountBaseUnits:input.maxAmountBaseUnits,minimumConfirmations:input.minimumConfirmations};
 const event=verifyBep20UsdtDeposit(evidence);
 // Detect a reorg/provider inconsistency during the observation window.
 const recheck=object(await rpc('eth_getBlockByNumber',['0x'+blockNumber.toString(16),false]));
 if(hash(recheck.hash)!==blockHash||quantity(recheck.number)!==blockNumber)throw new Error('DEPOSIT_OBSERVATION_REORG');
 return {evidence,event};
}
