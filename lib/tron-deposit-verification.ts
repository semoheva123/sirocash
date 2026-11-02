/** Private boundary for trusted node evidence. NEVER pass customer-supplied receipts here.
 * Does not query a node, prove RPC authenticity, credit USD, or activate deposits.
 */
import {base58} from '@scure/base';
import {sha256} from '@noble/hashes/sha256';
import {validTronAddress} from './tron-addresses';
const transferTopic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const tronUsdtContract='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
function hex(value:string,length:number){
 if(typeof value!=='string'||!new RegExp(`^[a-fA-F0-9]{${length}}$`).test(value))throw new Error('INVALID_CHAIN_ENCODING');
 return value.toLowerCase();
}
function encodeAddress(value:string){
 const payload=Uint8Array.from(Buffer.from('41'+hex(value,40),'hex'));
 return base58.encode(new Uint8Array([...payload,...sha256(sha256(payload)).slice(0,4)]));
}
function topicAddress(topic:string){
 const raw=hex(topic,64);
 if(!raw.startsWith('0'.repeat(24)))throw new Error('INVALID_ADDRESS_PADDING');
 return encodeAddress(raw.slice(24));
}
export type TronReceiptEvidence={
 txId:string; blockNumber:number; blockHash:string; execution:'SUCCESS'|'FAILED';
 logs:{address:string;topics:string[];data:string}[];
};
export type FinalizedTronBlock={height:number;hash:string;solidHeight:number};
export function verifyTronUsdtDeposit(input:{receipt:TronReceiptEvidence;block:FinalizedTronBlock;logIndex:number;assignedAddress:string;maxAmountBaseUnits:bigint}){
 const {receipt:r,block:b}=input;
 const txId=hex(r.txId,64),blockHash=hex(r.blockHash,64);
 if(!Number.isSafeInteger(r.blockNumber)||r.blockNumber<0||!Number.isSafeInteger(b.height)||
    !Number.isSafeInteger(b.solidHeight)||b.solidHeight<0||r.blockNumber!==b.height||
    b.height>b.solidHeight||blockHash!==hex(b.hash,64))throw new Error('DEPOSIT_NOT_CANONICAL_AND_FINAL');
 if(r.execution!=='SUCCESS')throw new Error('DEPOSIT_TRANSACTION_FAILED');
 if(!validTronAddress(input.assignedAddress))throw new Error('INVALID_ASSIGNED_ADDRESS');
 if(typeof input.maxAmountBaseUnits!=='bigint'||input.maxAmountBaseUnits<=0n)throw new Error('INVALID_DEPOSIT_LIMIT');
 if(!Number.isSafeInteger(input.logIndex)||input.logIndex<0||input.logIndex>=r.logs.length)throw new Error('INVALID_LOG_INDEX');
 const log=r.logs[input.logIndex];
 // TRON receipt contract address is 20-byte hex, without the 41 network prefix.
 if(encodeAddress(log.address)!==tronUsdtContract)throw new Error('WRONG_DEPOSIT_TOKEN');
 if(log.topics.length!==3||hex(log.topics[0],64)!==transferTopic)throw new Error('NOT_TRANSFER_EVENT');
 const from=topicAddress(log.topics[1]),to=topicAddress(log.topics[2]);
 if(to!==input.assignedAddress)throw new Error('WRONG_DEPOSIT_BENEFICIARY');
 if(from===to)throw new Error('SELF_TRANSFER_NOT_DEPOSIT');
 const amountBaseUnits=BigInt('0x'+hex(log.data,64));
 if(amountBaseUnits<=0n||amountBaseUnits>input.maxAmountBaseUnits)throw new Error('DEPOSIT_AMOUNT_OUT_OF_BOUNDS');
 return {asset:'USDT' as const,network:'TRC20' as const,decimals:6,txId,logIndex:input.logIndex,
   blockNumber:r.blockNumber,blockHash,from,to,amountBaseUnits:amountBaseUnits.toString(),
   eventKey:`tron:mainnet:usdt:${txId}:${input.logIndex}`};
}
