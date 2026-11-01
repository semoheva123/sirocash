import 'server-only';
import {randomUUID} from 'node:crypto';
import {base58} from '@scure/base';
import {getAddress} from 'ethers';
import type {WalletDb} from './wallet-engine';
import {observeBep20UsdtReceipt,type Bep20Rpc} from './bep20-receipt-observer';
import {observeTronUsdtReceipt,type TronRead} from './tron-receipt-observer';
import {stageBep20Deposit,stageTronDeposit} from './deposit-inbox';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {tronUsdtContract} from './tron-deposit-verification';
const topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function checkAbort(signal:AbortSignal){if(signal.aborted)throw Error('DISCOVERY_ABORTED')}
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('DISCOVERY_INVALID_RESPONSE');return v as Record<string,unknown>}
function integer(v:unknown){const n=typeof v==='string'&&/^0x[0-9a-f]+$/i.test(v)?Number(BigInt(v)):v;if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)throw Error('DISCOVERY_INVALID_HEIGHT');return n}
function hash(v:unknown){if(typeof v!=='string'||! /^(?:0x)?[a-f0-9]{64}$/i.test(v))throw Error('DISCOVERY_INVALID_HASH');return v.replace(/^0x/,'').toLowerCase()}
export type DiscoveryOptions={enabled:boolean;bep20:Bep20Rpc;tron:TronRead;tronGenesisId:string;minimumBep20Confirmations:number;maxBep20Amount:bigint;maxTronAmount:bigint;historicalStarts?:Partial<Record<'TRC20'|'BEP20',number>>};
/** Final blocks only. One leased address per job, bounded receipts per tick, fenced durable progress.
 * No explorer pagination, client evidence, latest-as-finalized fallback, paid calls or signing.
 */
export function createDepositDiscovery(db:WalletDb,o:DiscoveryOptions){
 async function block(network:string,n:number){
  if(network==='BEP20'){const b=obj(await o.bep20('eth_getBlockByNumber',['0x'+n.toString(16),false]));if(integer(b.number)!==n)throw Error('DISCOVERY_BLOCK_MISMATCH');return {hash:hash(b.hash),parent:hash(b.parentHash),transactions:[] as unknown[]}}
  const b=obj(await o.tron('/walletsolidity/getblockbynum',{num:n})),raw=obj(obj(b.block_header).raw_data);
  if(integer(raw.number??0)!==n||hash(b.blockID).slice(0,16)!==n.toString(16).padStart(16,'0'))throw Error('DISCOVERY_BLOCK_MISMATCH');
  const transactions=b.transactions??[];if(!Array.isArray(transactions)||transactions.length>10000)throw Error('DISCOVERY_BLOCK_TOO_LARGE');
  return {hash:hash(b.blockID),parent:n===0?'0'.repeat(64):hash(raw.parentHash),transactions};
 }
 async function finalHeight(network:string){
  if(network==='BEP20'){
   if(integer(await o.bep20('eth_chainId',[]))!==56)throw Error('WRONG_DEPOSIT_CHAIN');
   const finalized=obj(await o.bep20('eth_getBlockByNumber',['finalized',false])),head=integer(await o.bep20('eth_blockNumber',[]));hash(finalized.hash);
   const n=integer(finalized.number);if(n>head)throw Error('DISCOVERY_INVALID_FINALITY');const primaryFinal=Math.min(n,head-o.minimumBep20Confirmations+1);return o.bep20.discoveryHeight?o.bep20.discoveryHeight(primaryFinal):primaryFinal;
  }
  const g=obj(await o.tron('/walletsolidity/getblockbynum',{num:0}));if(hash(g.blockID)!==o.tronGenesisId)throw Error('TRON_WRONG_CHAIN');
  const b=obj(await o.tron('/walletsolidity/getnowblock',{})),n=integer(obj(obj(b.block_header).raw_data).number??0);
  if(hash(b.blockID).slice(0,16)!==n.toString(16).padStart(16,'0'))throw Error('DISCOVERY_INVALID_FINALITY');return n;
 }
 return {finalHeight,process:async(addressId:string,signal:AbortSignal)=>{
  if(!o.enabled)return {state:'HELD',reason:'DEPOSIT_DISCOVERY_DISABLED'};
  if(!Number.isSafeInteger(o.minimumBep20Confirmations)||o.minimumBep20Confirmations<15||o.maxBep20Amount<=0n||o.maxTronAmount<=0n)throw Error('DISCOVERY_CONFIGURATION');
  const existing=await db.transaction(async tx=>(await tx.query('SELECT a.network,s."addressId" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" LEFT JOIN "DepositScanCursor" s ON s."addressId"=a.id WHERE a.id=$1 AND v.enabled AND v."originVerified"',[addressId])).rows[0]);
  if(!existing)throw Error('DISCOVERY_VAULT_DISABLED');
  if(!existing.addressId){
   const network=String(existing.network) as 'TRC20'|'BEP20',start=o.historicalStarts?.[network];
   if(start===undefined)return {state:'HELD',reason:'DEPOSIT_HISTORICAL_START_REQUIRED'};
   if(!Number.isSafeInteger(start)||start<0||start>await finalHeight(network))throw Error('DISCOVERY_INVALID_START');
   checkAbort(signal);
   await db.transaction(tx=>tx.query('INSERT INTO "DepositScanCursor" ("addressId","nextBlock") VALUES ($1,$2) ON CONFLICT DO NOTHING',[addressId,start]));
  }
  const claim=randomUUID();
  const cursor=await db.transaction(async tx=>{
   const {rows:[r]}=await tx.query('UPDATE "DepositScanCursor" SET "claimId"=$2,"expiresAt"=clock_timestamp()+interval \'2 minutes\' WHERE "addressId"=$1 AND NOT paused AND ("expiresAt" IS NULL OR "expiresAt"<=clock_timestamp()) RETURNING *',[addressId,claim]);
   if(!r)return undefined;
   const {rows:[a]}=await tx.query('SELECT a.network,a.address FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" WHERE a.id=$1 AND v.enabled AND v."originVerified"',[addressId]);
   if(!a)throw Error('DISCOVERY_VAULT_DISABLED');return {...r,...a};
  });
  if(!cursor)return {state:'BUSY_OR_PAUSED'};
  const active=cursor;
  const network=String(cursor.network),n=integer(Number(cursor.nextBlock));
  const check=()=>{if(signal.aborted)throw Error('DISCOVERY_ABORTED')};
  async function commit(offset:number,complete:boolean,blockHash:string,stage?:(db:WalletDb)=>Promise<unknown>){
   check();
   await db.transaction(async tx=>{
    const {rows:[lease]}=await tx.query('SELECT "addressId" FROM "DepositScanCursor" WHERE "addressId"=$1 AND "claimId"=$2 AND "expiresAt">clock_timestamp() AND NOT paused FOR UPDATE',[addressId,claim]);
    if(!lease)throw Error('DISCOVERY_LEASE_LOST');
    if(stage)await stage({transaction:run=>run(tx)});
    await tx.query('UPDATE "DepositScanCursor" SET "nextBlock"=$3,"transactionOffset"=$4,"blockHash"=$5,"previousBlockHash"=$6 WHERE "addressId"=$1 AND "claimId"=$2',[addressId,claim,complete?n+1:n,complete?0:offset,complete?null:blockHash,complete?blockHash:active.previousBlockHash]);
   });
  }
  try{
   check();const head=await finalHeight(network);
   if(cursor.previousBlockHash&&(n-1>head||(await block(network,n-1)).hash!==cursor.previousBlockHash))throw Error('CHAIN_REORG');
   if(n>head)return {state:'WAITING_FINALITY'};
   const b=await block(network,n);
   if((cursor.blockHash&&cursor.blockHash!==b.hash)||(cursor.previousBlockHash&&cursor.previousBlockHash!==b.parent))throw Error('CHAIN_REORG');
   const offset=integer(cursor.transactionOffset);
   if(network==='BEP20'){
    const recipient='0x'+'0'.repeat(24)+String(cursor.address).slice(2).toLowerCase();
    const raw=await o.bep20('eth_getLogs',[{fromBlock:'0x'+n.toString(16),toBlock:'0x'+n.toString(16),address:bep20UsdtContract,topics:['0x'+topic,null,recipient]}]);
    if(!Array.isArray(raw)||raw.length>10000)throw Error('DISCOVERY_LOG_LIMIT');
    // Offset is an index into the block's canonical, sorted log list; duplicate indices are forbidden.
    const logs=raw.map(obj).sort((a,b)=>integer(a.logIndex)-integer(b.logIndex));
    if(new Set(logs.map(l=>integer(l.logIndex))).size!==logs.length||offset>logs.length)throw Error('DISCOVERY_LOG_CONFLICT');
    for(let i=offset;i<Math.min(logs.length,offset+3);i++){
     check();const l=logs[i];
     if(integer(l.blockNumber)!==n||hash(l.blockHash)!==b.hash||l.removed!==false||getAddress(String(l.address))!==bep20UsdtContract||!Array.isArray(l.topics)||l.topics.length!==3||l.topics[0]!=='0x'+topic||l.topics[2]!==recipient||typeof l.data!=='string'||!/^0x[a-f0-9]{64}$/i.test(l.data))throw Error('DISCOVERY_LOG_CONFLICT');
     const skip=BigInt(l.data)===0n||l.topics[1]===l.topics[2];
     const observed=skip?undefined:await observeBep20UsdtReceipt(o.bep20,{txId:'0x'+hash(l.transactionHash),logIndex:integer(l.logIndex),assignedAddress:String(cursor.address),maxAmountBaseUnits:o.maxBep20Amount,minimumConfirmations:o.minimumBep20Confirmations});
     if(observed&&(observed.event.blockNumber!==n||observed.event.blockHash!==b.hash))throw Error('CHAIN_REORG');
     if((await block(network,n)).hash!==b.hash)throw Error('CHAIN_REORG');
     await commit(i+1,i+1===logs.length,b.hash,observed?db=>stageBep20Deposit(db,observed.evidence):undefined);
    }
    if(logs.length===0)await commit(0,true,b.hash);
   }else{
    if(offset>b.transactions.length)throw Error('DISCOVERY_TRANSACTION_CONFLICT');
    for(let i=offset;i<Math.min(b.transactions.length,offset+3);i++){
     check();const tx=obj(b.transactions[i]),txId=hash(tx.txID),info=obj(await o.tron('/walletsolidity/gettransactioninfobyid',{value:txId}));
     if(info.id!==txId||integer(info.blockNumber)!==n)throw Error('DISCOVERY_RECEIPT_MISMATCH');
     const receipt=obj(info.receipt??{}),logs=info.log??[];if(!Array.isArray(logs)||logs.length>10000)throw Error('DISCOVERY_LOG_LIMIT');
     const observed:Awaited<ReturnType<typeof observeTronUsdtReceipt>>[]=[];
     if(info.result!=='FAILED'&&receipt.result==='SUCCESS')for(let j=0;j<logs.length;j++){
      const l=obj(logs[j]),topics=Array.isArray(l.topics)?l.topics.map(t=>typeof t==='string'?t.toLowerCase():t):l.topics;
      if((typeof l.address==='string'?l.address.toLowerCase():l.address)!==Buffer.from(base58.decode(tronUsdtContract)).subarray(1,21).toString('hex')||!Array.isArray(topics)||topics.length!==3||topics[0]!==topic)continue;
      const to='0'.repeat(24)+Buffer.from(base58.decode(String(cursor.address))).subarray(1,21).toString('hex');
      if(topics[2]!==to||topics[1]===topics[2]||l.data==='0'.repeat(64))continue;
      const observation=await observeTronUsdtReceipt(o.tron,{txId,logIndex:j,assignedAddress:String(cursor.address),maxAmountBaseUnits:o.maxTronAmount,genesisId:o.tronGenesisId});
      if(observation.event.blockHash!==b.hash||observation.event.blockNumber!==n)throw Error('CHAIN_REORG');observed.push(observation);
     }
     if((await block(network,n)).hash!==b.hash)throw Error('CHAIN_REORG');
     await commit(i+1,i+1===b.transactions.length,b.hash,async db=>{for(const event of observed)await stageTronDeposit(db,event.evidence)});
    }
    if(b.transactions.length===0)await commit(0,true,b.hash);
   }
   return {state:'PROGRESSED'};
  }catch(error){
   const message=error instanceof Error?error.message:'';
   if(message==='CHAIN_REORG'||message==='DEPOSIT_EVIDENCE_CONFLICT')await db.transaction(tx=>tx.query('UPDATE "DepositScanCursor" SET paused=true,reason=$3 WHERE "addressId"=$1 AND "claimId"=$2',[addressId,claim,message==='CHAIN_REORG'?'CHAIN_REORG':'EVIDENCE_CONFLICT']));
   throw error;
  }finally{await db.transaction(tx=>tx.query('UPDATE "DepositScanCursor" SET "claimId"=NULL,"expiresAt"=NULL WHERE "addressId"=$1 AND "claimId"=$2',[addressId,claim]))}
 }};
}
