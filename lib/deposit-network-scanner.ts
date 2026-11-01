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
type Network='TRC20'|'BEP20';
type Options={bep20:Bep20Rpc;tron:TronRead;genesisId:string;minimumConfirmations:number;maxAmount:(network:Network)=>bigint;bep20Window?:number;bep20QueryWindow?:number;maxEvents?:number;headCacheMs?:number;requireFreshHead?:boolean};
type Address={id:string;address:string;next:number;offset:number;previous:string|null;partial:string|null};
const transfer='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('SCAN_INVALID_OBJECT');return v as Record<string,unknown>}
function num(v:unknown){const n=typeof v==='string'&&/^0x[0-9a-f]+$/i.test(v)?Number(BigInt(v)):Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('SCAN_INVALID_HEIGHT');return n}
function hash(v:unknown){if(typeof v!=='string'||! /^(?:0x)?[a-f0-9]{64}$/i.test(v))throw Error('SCAN_INVALID_HASH');return v.replace(/^0x/,'').toLowerCase()}
const tronHex=(address:string)=>Buffer.from(base58.decode(address)).subarray(1,21).toString('hex');
/** Shared per-network reads, not one full blockchain scan per customer. Index results are
 * candidates only: every credit candidate still passes the independent canonical receipt observer.
 * Progress + inbox staging commit together; newly allocated addresses retain their own start.
 */
export function createNetworkDepositScanner(db:WalletDb,o:Options){
 const window=o.bep20Window??1000,maxEvents=o.maxEvents??32,queryWindow=o.bep20QueryWindow??1000,headCacheMs=o.headCacheMs??0;
 const heads=new Map<Network,{height:number;at:number}>();
 if(!Number.isSafeInteger(queryWindow)||queryWindow<1||queryWindow>1000||!Number.isSafeInteger(headCacheMs)||headCacheMs<0||headCacheMs>10000||!/^0{16}[a-f0-9]{48}$/.test(o.genesisId)||!Number.isSafeInteger(o.minimumConfirmations)||o.minimumConfirmations<15||!Number.isSafeInteger(window)||window<1||window>1000||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>128)throw Error('SCAN_CONFIGURATION');
 async function block(network:Network,n:number){
  if(network==='BEP20'){
   const b=obj(await o.bep20('eth_getBlockByNumber',['0x'+n.toString(16),false]));
   if(num(b.number)!==n)throw Error('SCAN_BLOCK_MISMATCH');
   return {hash:hash(b.hash),parent:hash(b.parentHash),raw:b};
  }
  const b=obj(await o.tron('/walletsolidity/getblockbynum',{num:n})),raw=obj(obj(b.block_header).raw_data);
  if(num(raw.number??0)!==n||hash(b.blockID).slice(0,16)!==n.toString(16).padStart(16,'0'))throw Error('SCAN_BLOCK_MISMATCH');
  return {hash:hash(b.blockID),parent:n?hash(raw.parentHash):'0'.repeat(64),raw:b};
 }
 async function observeFinalHeight(network:Network){
  if(network==='BEP20'){
   if(num(await o.bep20('eth_chainId',[]))!==56)throw Error('SCAN_WRONG_CHAIN');
   const b=obj(await o.bep20('eth_getBlockByNumber',['finalized',false])),head=num(await o.bep20('eth_blockNumber',[]));hash(b.hash);
   const n=num(b.number);if(n>head||head-n>2000||head<o.minimumConfirmations-1)throw Error('SCAN_INVALID_FINALITY');
   if(o.requireFreshHead){const tip=obj(await o.bep20('eth_getBlockByNumber',['0x'+head.toString(16),false]));const age=Date.now()-num(tip.timestamp)*1000,finalAge=Date.now()-num(b.timestamp)*1000;if(num(tip.number)!==head||age>120000||age< -30000||finalAge>120000||finalAge< -30000)throw Error('SCAN_STALE_HEAD')}
   return Math.min(n,head-o.minimumConfirmations+1);
  }
  const genesis=obj(await o.tron('/walletsolidity/getblockbynum',{num:0}));if(hash(genesis.blockID)!==o.genesisId)throw Error('SCAN_WRONG_CHAIN');
  const b=obj(await o.tron('/walletsolidity/getnowblock',{})),n=num(obj(obj(b.block_header).raw_data).number);
  if(o.requireFreshHead){const age=Date.now()-num(obj(obj(b.block_header).raw_data).timestamp);if(age>120000||age< -30000)throw Error('SCAN_STALE_HEAD')}
  if(hash(b.blockID).slice(0,16)!==n.toString(16).padStart(16,'0'))throw Error('SCAN_INVALID_FINALITY');return n;
 }
 async function finalHeight(network:Network){
  const prior=heads.get(network);if(prior&&Date.now()-prior.at<headCacheMs)return prior.height;
  const height=await observeFinalHeight(network);heads.set(network,{height,at:Date.now()});return height;
 }
 return {finalHeight,scan:async(network:Network,signal:AbortSignal)=>{
  if(!['TRC20','BEP20'].includes(network))throw Error('SCAN_NETWORK');
  const check=()=>{if(signal.aborted)throw Error('SCAN_ABORTED')};check();
  const claim=randomUUID();
  const lease=await db.transaction(async tx=>(await tx.query('UPDATE "DepositNetworkScanner" SET "claimId"=$2,"expiresAt"=clock_timestamp()+interval \'150 seconds\' WHERE network=$1 AND NOT paused AND ("expiresAt" IS NULL OR "expiresAt"<=clock_timestamp()) RETURNING *',[network,claim])).rows[0]);
  if(!lease)return {state:'BUSY_OR_PAUSED'};
  try{
   const head=await finalHeight(network);check();
   if(lease.lastBlock!==null&&(num(lease.lastBlock)>head||(await block(network,num(lease.lastBlock))).hash!==lease.lastHash))throw Error('CHAIN_REORG');
   const addresses=await db.transaction(async tx=>{
    const {rows}=await tx.query('SELECT a.id,a.address,s."nextBlock",s."transactionOffset",s."previousBlockHash",s."blockHash" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" JOIN "DepositScanCursor" s ON s."addressId"=a.id WHERE a.network=$1 AND v.enabled AND v."originVerified" AND NOT s.paused AND (s."expiresAt" IS NULL OR s."expiresAt"<=clock_timestamp()) ORDER BY s."nextBlock",s."transactionOffset",a.id LIMIT 2049',[network]);
    if(rows.length>2048)throw Error('SCAN_ADDRESS_CAPACITY');
    return rows.map(r=>({id:String(r.id),address:String(r.address),next:num(r.nextBlock),offset:num(r.transactionOffset),previous:r.previousBlockHash as string|null,partial:r.blockHash as string|null}));
   });
   const start=addresses[0]?.next??head+1;
   if(start>head){
    // Even an empty network must demonstrate the actual discovery method before becoming healthy.
    if(!addresses.length){
     if(network==='BEP20')await o.bep20('eth_getLogs',[{fromBlock:'0x'+head.toString(16),toBlock:'0x'+head.toString(16),address:bep20UsdtContract,topics:['0x'+transfer,null,'0x'+'0'.repeat(64)]}]);
     else if(!Array.isArray(await o.tron('/wallet/gettransactioninfobyblocknum',{num:head})))throw Error('SCAN_BULK_RECEIPTS_UNAVAILABLE');
    }
    check();await db.transaction(tx=>tx.query('UPDATE "DepositNetworkScanner" SET "lastHead"=$3,"lagBlocks"=0,"lastSuccessAt"=clock_timestamp() WHERE network=$1 AND "claimId"=$2 AND "expiresAt">clock_timestamp()',[network,claim,head]));
    return {state:'WAITING_FINALITY',lagBlocks:0};
   }
   let end=Math.min(head,start+(network==='BEP20'?window:1)-1);
   const first=await block(network,start);
   for(const a of addresses.filter(a=>a.next===start)){
    if(a.partial&&a.partial!==first.hash||a.previous&&a.previous!==first.parent)throw Error('CHAIN_REORG');
   }
   let selected=addresses.filter(a=>a.next<=end);
   type Candidate={address:Address;n:number;offset:number;txId:string;logIndex:number;blockHash:string};
   const candidates:Candidate[]=[];
   if(network==='BEP20'){
    // Server-controlled ranges/contract, OR-recipient groups <=64; never accept a client filter.
    const unique=new Map<string,Record<string,unknown>>();
    const requests:{from:number;to:number;topics:string[]}[]=[];
    for(let i=0;i<selected.length;i+=64){
     const topics=selected.slice(i,i+64).map(a=>'0x'+'0'.repeat(24)+a.address.slice(2).toLowerCase());
     for(let from=start;from<=end;from+=queryWindow)requests.push({from,to:Math.min(end,from+queryWindow-1),topics});
    }
    let requestIndex=0,failed=false;
    const workers=await Promise.allSettled(Array.from({length:Math.min(4,requests.length)},async()=>{
     try{while(!failed&&requestIndex<requests.length){
      check();const r=requests[requestIndex++];
      const raw=await o.bep20('eth_getLogs',[{fromBlock:'0x'+r.from.toString(16),toBlock:'0x'+r.to.toString(16),address:bep20UsdtContract,topics:['0x'+transfer,null,r.topics.length===1?r.topics[0]:r.topics]}]);
      if(!Array.isArray(raw)||raw.length>10000)throw Error('SCAN_LOG_LIMIT');
      for(const value of raw){const l=obj(value),key=hash(l.transactionHash)+':'+num(l.logIndex);if(num(l.blockNumber)<r.from||num(l.blockNumber)>r.to)throw Error('SCAN_LOG_CONTEXT');if(unique.has(key))throw Error('DEPOSIT_EVIDENCE_CONFLICT');unique.set(key,l);if(unique.size>20000)throw Error('SCAN_LOG_LIMIT')}
     }}catch(error){failed=true;throw error}
    }));
    const rejected=workers.find(r=>r.status==='rejected');if(rejected?.status==='rejected')throw rejected.reason;
    const recipients=new Map(selected.map(a=>[a.address.toLowerCase(),a]));
    for(const l of unique.values()){
     const n=num(l.blockNumber),index=num(l.logIndex);
     if(n<start||n>end||l.removed!==false||getAddress(String(l.address))!==bep20UsdtContract||!Array.isArray(l.topics)||l.topics.length!==3||l.topics[0]!=='0x'+transfer||typeof l.topics[2]!=='string'||!/^0x0{24}[a-f0-9]{40}$/.test(l.topics[2])||typeof l.data!=='string'||!/^0x[a-f0-9]{64}$/i.test(l.data))throw Error('SCAN_LOG_CONTEXT');
     const a=recipients.get('0x'+l.topics[2].slice(-40));if(!a)throw Error('SCAN_UNREQUESTED_RECIPIENT');
     if(n<a.next||n===a.next&&index<a.offset)continue;
     if(l.data==='0x'+'0'.repeat(64)||l.topics[1]===l.topics[2])continue;
     candidates.push({address:a,n,offset:index,txId:'0x'+hash(l.transactionHash),logIndex:index,blockHash:hash(l.blockHash)});
    }
   }else{
    const txs=first.raw.transactions??[];
    if(!Array.isArray(txs)||txs.length>10000)throw Error('SCAN_BLOCK_LIMIT');
    const raw=await o.tron('/wallet/gettransactioninfobyblocknum',{num:start});
    if(!Array.isArray(raw)||raw.length>10000)throw Error('SCAN_BULK_RECEIPTS_UNAVAILABLE');
    const receipts=new Map<string,Record<string,unknown>>();
    for(const value of raw){const r=obj(value),id=hash(r.id);if(num(r.blockNumber)!==start||receipts.has(id))throw Error('SCAN_RECEIPT_CONTEXT');receipts.set(id,r)}
    // Missing receipts cannot be mistaken for an empty block, including native transfers.
    const ids=txs.map(t=>hash(obj(t).txID));if(new Set(ids).size!==ids.length||receipts.size!==ids.length||ids.some(id=>!receipts.has(id)))throw Error('SCAN_INCOMPLETE_RECEIPTS');
    const recipients=new Map(selected.map(a=>[tronHex(a.address),a]));
    const contract=tronHex(tronUsdtContract);
    for(let i=0;i<ids.length;i++){
     const receipt=receipts.get(ids[i])!,logs=receipt.log??[];
     if(!Array.isArray(logs)||logs.length>10000)throw Error('SCAN_LOG_LIMIT');
     if(receipt.result==='FAILED'||obj(receipt.receipt??{}).result!=='SUCCESS')continue;
     for(let j=0;j<logs.length;j++){
      const l=obj(logs[j]);if(String(l.address).toLowerCase()!==contract||!Array.isArray(l.topics)||l.topics.length!==3||String(l.topics[0]).toLowerCase()!==transfer)continue;
      const to=String(l.topics[2]).toLowerCase();if(!/^0{24}[a-f0-9]{40}$/.test(to))throw Error('SCAN_LOG_CONTEXT');
      const a=recipients.get(to.slice(-40));if(!a)continue;
      const offset=i*10001+j;
      if(start<a.next||start===a.next&&offset<a.offset||l.topics[1]===l.topics[2]||l.data==='0'.repeat(64))continue;
      candidates.push({address:a,n:start,offset,txId:ids[i],logIndex:j,blockHash:first.hash});
     }
    }
   }
   candidates.sort((a,b)=>a.n-b.n||a.offset-b.offset);
   if(candidates.some((c,i)=>i>0&&c.n===candidates[i-1].n&&c.offset===candidates[i-1].offset))throw Error('DEPOSIT_EVIDENCE_CONFLICT');
   const chosen=candidates.slice(0,maxEvents),partial=candidates.length>chosen.length;
   if(partial)end=chosen[chosen.length-1].n;
   const endBlock=end===start?first:await block(network,end);
   const next=partial?end:end+1,offset=partial?chosen[chosen.length-1].offset+1:0;
   selected=selected.filter(a=>a.next<=end);
   // Verify receipts outside the DB transaction, then recheck anchor before atomic staging.
   const observed=[] as ({network:'BEP20';evidence:Awaited<ReturnType<typeof observeBep20UsdtReceipt>>['evidence']}|{network:'TRC20';evidence:Awaited<ReturnType<typeof observeTronUsdtReceipt>>['evidence']})[];
   for(const c of chosen){
    check();
    if(network==='BEP20'){
     const v=await observeBep20UsdtReceipt(o.bep20,{txId:c.txId,logIndex:c.logIndex,assignedAddress:c.address.address,maxAmountBaseUnits:o.maxAmount(network),minimumConfirmations:o.minimumConfirmations});
     if(v.event.blockNumber!==c.n||v.event.blockHash!==c.blockHash)throw Error('SCAN_RECEIPT_CONTEXT');observed.push({network:'BEP20',evidence:v.evidence});
    }else{
     const v=await observeTronUsdtReceipt(o.tron,{txId:c.txId,logIndex:c.logIndex,assignedAddress:c.address.address,maxAmountBaseUnits:o.maxAmount(network),genesisId:o.genesisId});
     if(v.event.blockNumber!==c.n||v.event.blockHash!==c.blockHash)throw Error('SCAN_RECEIPT_CONTEXT');observed.push({network:'TRC20',evidence:v.evidence});
    }
   }
   if((await block(network,end)).hash!==endBlock.hash)throw Error('CHAIN_REORG');check();
   await db.transaction(async tx=>{
    const {rows:owned}=await tx.query('SELECT network FROM "DepositNetworkScanner" WHERE network=$1 AND "claimId"=$2 AND "expiresAt">clock_timestamp() AND NOT paused FOR UPDATE',[network,claim]);if(owned.length!==1)throw Error('SCAN_LEASE_LOST');
    const ids=selected.map(a=>a.id);
    const {rows:locked}=await tx.query('SELECT s."addressId" FROM "DepositScanCursor" s JOIN "UserDepositAddress" a ON a.id=s."addressId" JOIN "DepositAddressVault" v ON v.id=a."vaultId" WHERE s."addressId"=ANY($1::uuid[]) AND NOT s.paused AND v.enabled AND v."originVerified" AND (s."expiresAt" IS NULL OR s."expiresAt"<=clock_timestamp()) FOR UPDATE OF s',[ids]);if(locked.length!==ids.length)throw Error('SCAN_ASSIGNMENTS_CHANGED');
    for(const v of observed){const scoped={transaction:<T>(run:(tx:import('./wallet-engine').WalletTx)=>Promise<T>)=>run(tx)};if(v.network==='BEP20')await stageBep20Deposit(scoped,v.evidence);else await stageTronDeposit(scoped,v.evidence)}
    await tx.query('UPDATE "DepositScanCursor" SET "nextBlock"=$2,"transactionOffset"=$3,"blockHash"=$4,"previousBlockHash"=$5 WHERE "addressId"=ANY($1::uuid[]) AND ("nextBlock","transactionOffset")<($2,$3)',[ids,next,offset,partial?endBlock.hash:null,partial?endBlock.parent:endBlock.hash]);
    const {rows:[lag]}=await tx.query('SELECT COALESCE(MAX(GREATEST(0,$2-"nextBlock"+1)),0) AS lag FROM "DepositScanCursor" s JOIN "UserDepositAddress" a ON a.id=s."addressId" WHERE a.network=$1 AND NOT s.paused',[network,head]);
    await tx.query('UPDATE "DepositNetworkScanner" SET "lastBlock"=CASE WHEN "lastBlock" IS NULL OR "lastBlock"<=$3 THEN $3 ELSE "lastBlock" END,"lastHash"=CASE WHEN "lastBlock" IS NULL OR "lastBlock"<=$3 THEN $4 ELSE "lastHash" END,"lastHead"=$5,"lagBlocks"=$6,"lastSuccessAt"=clock_timestamp() WHERE network=$1 AND "claimId"=$2',[network,claim,end,endBlock.hash,head,lag.lag]);
   });
   return {state:'PROGRESSED',staged:chosen.length,blocks:partial?end-start:end-start+1};
  }catch(error){
   const message=error instanceof Error?error.message:'';
   if(['CHAIN_REORG','DEPOSIT_EVIDENCE_CONFLICT','DEPOSIT_OBSERVATION_REORG','TRON_OBSERVATION_REORG'].includes(message))await db.transaction(async tx=>{
    await tx.query('UPDATE "DepositNetworkScanner" SET paused=true,reason=$3 WHERE network=$1 AND "claimId"=$2',[network,claim,message==='DEPOSIT_EVIDENCE_CONFLICT'?'EVIDENCE_CONFLICT':'CHAIN_REORG']);
    await tx.query('UPDATE "DepositScanCursor" s SET paused=true,reason=$2 FROM "UserDepositAddress" a WHERE a.id=s."addressId" AND a.network=$1',[network,message==='DEPOSIT_EVIDENCE_CONFLICT'?'EVIDENCE_CONFLICT':'CHAIN_REORG']);
   });
   throw error;
  }finally{await db.transaction(tx=>tx.query('UPDATE "DepositNetworkScanner" SET "claimId"=NULL,"expiresAt"=NULL WHERE network=$1 AND "claimId"=$2',[network,claim]))}
 }};
}
