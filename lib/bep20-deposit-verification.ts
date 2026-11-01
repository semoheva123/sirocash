/** Private normalized evidence only. Not an RPC authenticity/inclusion proof or USD valuation. */
import {getAddress} from 'ethers';
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const bep20UsdtContract='0x55d398326f99059fF775485246999027B3197955';
function hex(value:string,bytes:number){
 if(typeof value!=='string'||!new RegExp(`^0x[a-fA-F0-9]{${bytes*2}}$`).test(value))throw new Error('INVALID_CHAIN_ENCODING');
 return value.toLowerCase();
}
function address(value:string){return getAddress(value)}
function topicAddress(value:string){
 const raw=hex(value,32).slice(2);
 if(!raw.startsWith('0'.repeat(24)))throw new Error('INVALID_ADDRESS_PADDING');
 return address('0x'+raw.slice(24));
}
export type Bep20ReceiptEvidence={chainId:number;txId:string;blockNumber:number;blockHash:string;execution:'SUCCESS'|'FAILED';logs:{address:string;topics:string[];data:string;logIndex:number;removed:boolean}[]};
export type CanonicalBep20Block={chainId:number;height:number;hash:string;headHeight:number;finalizedHeight:number};
export function verifyBep20UsdtDeposit(input:{receipt:Bep20ReceiptEvidence;block:CanonicalBep20Block;logIndex:number;assignedAddress:string;maxAmountBaseUnits:bigint;minimumConfirmations:number}){
 const {receipt:r,block:b}=input;
 if(r.chainId!==56||b.chainId!==56)throw new Error('WRONG_DEPOSIT_CHAIN');
 const txId=hex(r.txId,32).slice(2),blockHash=hex(r.blockHash,32).slice(2);
 if(![r.blockNumber,b.height,b.headHeight,b.finalizedHeight].every(n=>Number.isSafeInteger(n)&&n>=0)||
 r.blockNumber!==b.height||b.height>b.finalizedHeight||b.finalizedHeight>b.headHeight||blockHash!==hex(b.hash,32).slice(2))throw new Error('DEPOSIT_NOT_CANONICAL_AND_FINAL');
 if(!Number.isSafeInteger(input.minimumConfirmations)||input.minimumConfirmations<1||b.headHeight-b.height+1<input.minimumConfirmations)throw new Error('INSUFFICIENT_DEPOSIT_CONFIRMATIONS');
 if(r.execution!=='SUCCESS')throw new Error('DEPOSIT_TRANSACTION_FAILED');
 if(typeof input.maxAmountBaseUnits!=='bigint'||input.maxAmountBaseUnits<=0n)throw new Error('INVALID_DEPOSIT_LIMIT');
 // EVM logIndex is block-global, NOT the offset in the receipt logs array.
 if(!Number.isSafeInteger(input.logIndex)||input.logIndex<0||input.logIndex>2147483647||
 r.logs.some(l=>!Number.isSafeInteger(l.logIndex)||l.logIndex<0)||new Set(r.logs.map(l=>l.logIndex)).size!==r.logs.length)throw new Error('INVALID_LOG_INDEX');
 const log=r.logs.find(l=>l.logIndex===input.logIndex);
 if(!log||log.removed!==false)throw new Error('INVALID_OR_REMOVED_LOG');
 if(address(log.address)!==address(bep20UsdtContract))throw new Error('WRONG_DEPOSIT_TOKEN');
 if(log.topics.length!==3||hex(log.topics[0],32)!==transferTopic)throw new Error('NOT_TRANSFER_EVENT');
 const from=topicAddress(log.topics[1]),to=topicAddress(log.topics[2]);
 if(to!==address(input.assignedAddress))throw new Error('WRONG_DEPOSIT_BENEFICIARY');
 if(from===to)throw new Error('SELF_TRANSFER_NOT_DEPOSIT');
 const amountBaseUnits=BigInt(hex(log.data,32));
 if(amountBaseUnits<=0n||amountBaseUnits>input.maxAmountBaseUnits)throw new Error('DEPOSIT_AMOUNT_OUT_OF_BOUNDS');
 return {asset:'USDT' as const,network:'BEP20' as const,decimals:18,txId,logIndex:input.logIndex,blockNumber:r.blockNumber,blockHash,from,to,amountBaseUnits:amountBaseUnits.toString(),eventKey:`bsc:56:usdt:${txId}:${input.logIndex}`};
}
