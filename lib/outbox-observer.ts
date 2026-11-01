import 'server-only';
import {TronWeb} from 'tronweb';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {tronUsdtContract} from './tron-deposit-verification';
import {observeBep20UsdtReceipt,type Bep20Rpc} from './bep20-receipt-observer';
import {observeTronUsdtReceipt,type TronRead} from './tron-receipt-observer';
export type OutboxObservationOptions={bep20:Bep20Rpc;tron:TronRead;tronGenesisId:string;minimumBep20Confirmations:number};
export type OutboxTransfer={network:unknown;txId:unknown;sender:unknown;recipient:unknown;amountBaseUnits:unknown};
const topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('OUTBOX_RECEIPT_INVALID');return v as Record<string,unknown>}
/** Locate exactly one full matching Transfer, then invoke the canonical/finality observer ONCE.
 * Bounded 128 logs, no log-index brute-force RPC loop, no latest/finality fallback.
 */
export async function observeOutboxTransfer(options:OutboxObservationOptions,row:OutboxTransfer){
 if(!Number.isSafeInteger(options.minimumBep20Confirmations)||options.minimumBep20Confirmations<15||options.minimumBep20Confirmations>10000)throw new Error('OUTBOX_CONFIRMATION_POLICY');
 const bsc=row.network==='BEP20';if(!bsc&&row.network!=='TRC20')throw new Error('OUTBOX_NETWORK');
 const clean=(v:unknown)=>{if(typeof v!=='string')throw new Error('OUTBOX_LOG_ENCODING');return v.replace(/^0x/,'').toLowerCase()};
 const address=(v:unknown)=>{const a=bsc?clean(v):TronWeb.address.toHex(String(v)).slice(2).toLowerCase();if(!/^[a-f0-9]{40}$/.test(a))throw new Error('OUTBOX_ADDRESS');return a};
 const sender=address(row.sender).padStart(64,'0'),recipient=address(row.recipient).padStart(64,'0');
 const amount=BigInt(String(row.amountBaseUnits));if(amount<=0n||amount>=2n**256n)throw new Error('OUTBOX_AMOUNT');
 const data=amount.toString(16).padStart(64,'0'),contract=address(bsc?bep20UsdtContract:tronUsdtContract);
 const raw=object(bsc?await options.bep20('eth_getTransactionReceipt',[String(row.txId)]):await options.tron('/walletsolidity/gettransactioninfobyid',{value:String(row.txId)}));
 const logs=bsc?raw.logs:raw.log;
 if(!Array.isArray(logs)||logs.length>128)throw new Error('OUTBOX_RECEIPT_UNAVAILABLE_OR_LARGE');
 const matches:{index:number}[]=[];
 for(let i=0;i<logs.length;i++){
  const l=object(logs[i]);
  if(!Array.isArray(l.topics)||l.topics.length!==3||clean(l.address)!==contract||clean(l.topics[0])!==topic||clean(l.topics[1])!==sender||clean(l.topics[2])!==recipient||clean(l.data)!==data)continue;
  let index=i;
  if(bsc){if(typeof l.logIndex!=='string'||!/^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(l.logIndex))throw new Error('OUTBOX_LOG_INDEX');const n=BigInt(l.logIndex);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('OUTBOX_LOG_INDEX');index=Number(n)}
  matches.push({index});
 }
 if(matches.length!==1)throw new Error('OUTBOX_EXACT_TRANSFER_NOT_UNIQUE');
 const input={txId:String(row.txId),assignedAddress:String(row.recipient),maxAmountBaseUnits:amount,logIndex:matches[0].index};
 if(bsc)return {network:'BEP20' as const,...await observeBep20UsdtReceipt(options.bep20,{...input,minimumConfirmations:options.minimumBep20Confirmations})};
 return {network:'TRC20' as const,...await observeTronUsdtReceipt(options.tron,{...input,genesisId:options.tronGenesisId})};
}
