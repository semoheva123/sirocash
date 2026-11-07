import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {HDKey} from '@scure/bip32';
import {base58} from '@scure/base';
import {depositScannerHealthy} from '../lib/deposit-scanner-health';
import {createNetworkDepositScanner} from '../lib/deposit-network-scanner';
import {allocateDepositAddress} from '../lib/deposit-address-allocation';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
import {createDepositValuationWorker} from '../lib/deposit-valuation-worker';
import {observeUsdtUsdPrice} from '../lib/financial-price';
import {walletBalances,type WalletDb} from '../lib/wallet-engine';
async function main(){const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated');
 for(const d of (await readdir('prisma/migrations')).sort())if(d!=='migration_lock.toml')await pg.exec(await readFile(`prisma/migrations/${d}/migration.sql`,'utf8'));
 const admin:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(q,p)=>({rows:(await tx.query(q,p)).rows as Record<string,unknown>[]})}))};
 const worker:WalletDb={transaction:run=>admin.transaction(async tx=>{await tx.query('SET LOCAL ROLE sirocash_financial_worker');return run(tx)})};
 const sql=(q:string,p:unknown[]=[])=>admin.transaction(tx=>tx.query(q,p));
 const root=HDKey.fromMasterSeed(new Uint8Array(32).fill(29)),owners=[randomUUID(),randomUUID()],vaults={BEP20:randomUUID(),TRC20:randomUUID()};
 for(const id of owners)await sql('INSERT INTO "User"(id,email,"emailVerifiedAt") VALUES($1,$2,now())',[id,id+'@scanner.test']);
 for(const network of ['BEP20','TRC20'] as const){await sql('INSERT INTO "DepositAddressVault"(id,network,"accountXpub",enabled,"originVerified") VALUES($1,$2,$3,true,true)',[vaults[network],network,root.derive(network==='BEP20'?"m/44'/60'/0'":"m/44'/195'/0'").publicExtendedKey]);for(const owner of owners)await allocateDepositAddress(worker,owner,vaults[network],network,100)}
 const rows=(await sql('SELECT * FROM "UserDepositAddress" ORDER BY network,"ownerId"')).rows;
 const bep=rows.filter(r=>r.network==='BEP20'),tron=rows.filter(r=>r.network==='TRC20');
 const hex=(n:number)=>n.toString(16).padStart(64,'0'),tronHash=(n:number)=>n.toString(16).padStart(16,'0')+'ab'.repeat(24),topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
 const txs=[hex(1001),hex(1002)];let head=130,genesis=tronHash(0),reorg=false,incomplete=false,blockReads=0,bulkReads=0,logReads=0;
 const logs=bep.map((a,i)=>({address:bep20UsdtContract,transactionHash:'0x'+txs[i],blockNumber:'0x64',blockHash:'0x'+hex(100),transactionIndex:'0x'+i.toString(16),logIndex:'0x'+(7+i).toString(16),removed:false,topics:['0x'+topic,'0x'+'0'.repeat(24)+'1'.repeat(40),'0x'+'0'.repeat(24)+String(a.address).slice(2).toLowerCase()],data:'0x'+(20n*10n**18n).toString(16).padStart(64,'0')}));
 const rpc=async(method:string,p:unknown[])=>{
  if(method==='eth_chainId')return '0x38';if(method==='eth_blockNumber')return '0x'+head.toString(16);
  if(method==='eth_getBlockByNumber'){blockReads++;const n=p[0]==='finalized'?head-2:Number(BigInt(String(p[0])));return {number:'0x'+n.toString(16),hash:'0x'+(reorg&&n===116?'ff'.repeat(32):hex(n)),parentHash:'0x'+hex(n-1),transactions:n===100?txs.map(t=>'0x'+t):[]}}
  if(method==='eth_getLogs'){logReads++;const f=p[0] as {fromBlock:string;toBlock:string;topics:unknown[]},tos=Array.isArray(f.topics[2])?f.topics[2]:[f.topics[2]];return logs.filter(l=>Number(BigInt(l.blockNumber))>=Number(BigInt(f.fromBlock))&&Number(BigInt(l.blockNumber))<=Number(BigInt(f.toBlock))&&tos.includes(l.topics[2]))}
  if(method==='eth_getTransactionReceipt'){const i=txs.indexOf(String(p[0]).slice(2));return {transactionHash:p[0],status:'0x1',blockNumber:'0x64',blockHash:'0x'+hex(100),transactionIndex:'0x'+i.toString(16),logs:[logs[i]]}}
  throw Error('unexpected RPC');
 };
 const addressHex=(a:string)=>Buffer.from(base58.decode(a)).subarray(1,21).toString('hex');
 const tronLogs=tron.map(a=>({address:addressHex(tronUsdtContract),topics:[topic,'0'.repeat(24)+'1'.repeat(40),'0'.repeat(24)+addressHex(String(a.address))],data:(20n*1000000n).toString(16).padStart(64,'0')}));
 const tronTxs=[...txs,...Array.from({length:1000},(_,i)=>hex(10000+i))];
 const failedTx=hex(7777),selfTx=hex(7778),farTx=hex(7779);
 const tronReceipts=txs.map((id,i)=>({id,blockNumber:100,receipt:{result:'SUCCESS'},log:[tronLogs[i]]})).concat(tronTxs.slice(2).map(id=>({id,blockNumber:100,receipt:{result:'SUCCESS'},log:[]})));
 // Block 105 holds a FAILED transfer and a self-transfer to tron[0]: indexed, never credited.
 tronReceipts.push({id:failedTx,blockNumber:105,receipt:{result:'OUT_OF_ENERGY'},log:[tronLogs[0]]},{id:selfTx,blockNumber:105,receipt:{result:'SUCCESS'},log:[{...tronLogs[0],topics:[topic,tronLogs[0].topics[2],tronLogs[0].topics[2]]}]},{id:farTx,blockNumber:140,receipt:{result:'SUCCESS'},log:[tronLogs[0]]});
 const tronTs=(n:number)=>1700000000000+n*3000;
 const blockTxs=(n:number)=>n===100?tronTxs:n===105?[failedTx,selfTx]:n===140?[farTx]:[];
 let fullBlockReads=0,headerReads=0,indexReads=0,latestFullReads=0,indexDown=false,wrongRecipient=false,dense=false,misplaced=false;
 const read=async(path:string,body:Record<string,unknown>)=>{
  if(path==='/walletsolidity/getblock'){headerReads++;assert.equal(body.detail,false);const n=body.id_or_num===undefined?head:Number(body.id_or_num);return {blockID:n===0?genesis:tronHash(n),block_header:{raw_data:{number:n,parentHash:tronHash(n-1),timestamp:tronTs(n)}}}}
  if(path==='/walletsolidity/getblockbynum'){fullBlockReads++;const n=Number(body.num);return {blockID:n===0?genesis:tronHash(n),block_header:{raw_data:{number:n,parentHash:tronHash(n-1),timestamp:tronTs(n)}},transactions:blockTxs(n).map(txID=>({txID,ret:[{contractRet:'SUCCESS'}]}))}}
  if(path==='/walletsolidity/getnowblock'){latestFullReads++;return {blockID:tronHash(head),block_header:{raw_data:{number:head,parentHash:tronHash(head-1),timestamp:tronTs(head)}},transactions:[]}}
  if(path==='/wallet/gettransactioninfobyblocknum'){bulkReads++;const inBlock=tronReceipts.filter(r=>r.blockNumber===Number(body.num));return incomplete&&Number(body.num)===100?inBlock.slice(1):inBlock}
  if(path==='/walletsolidity/gettransactioninfobyid')return tronReceipts.find(r=>r.id===body.value)??{};
  throw Error('unexpected TRON path');
 };
 // Indexed listing: USDT transfers INTO one address, second-granularity inclusive timestamp bounds.
 const index=async(address:string,q:{minTimestamp:number;maxTimestamp:number})=>{
  indexReads++;
  if(indexDown)return {success:false,error:'unavailable'};
  const inWindow=(n:number)=>Math.floor(tronTs(n)/1000)>=Math.floor(q.minTimestamp/1000)&&Math.floor(tronTs(n)/1000)<=Math.floor(q.maxTimestamp/1000);
  const owner=tron.find(a=>a.address===address);
  if(dense&&owner===tron[0]&&inWindow(100))return {success:true,data:Array.from({length:200},(_,i)=>({transaction_id:hex(10000+i),to:address,block_timestamp:tronTs(100),type:'Transfer',value:'1'})),meta:{at:Date.now(),page_size:200,fingerprint:'next-page'}};
  const data=[] as {transaction_id:string;to:string;block_timestamp:number;type:string;value:string}[];
  if(owner){const i=tron.indexOf(owner);if(inWindow(100))data.push({transaction_id:txs[i],to:wrongRecipient?String(tron[1-i].address):address,block_timestamp:tronTs(100),type:'Transfer',value:'20000000'});
   if(i===0&&inWindow(105))data.push({transaction_id:failedTx,to:address,block_timestamp:tronTs(105),type:'Transfer',value:'20000000'},{transaction_id:selfTx,to:address,block_timestamp:tronTs(105),type:'Transfer',value:'20000000'});
   if(i===0&&misplaced&&inWindow(100))data.push({transaction_id:farTx,to:address,block_timestamp:tronTs(100),type:'Transfer',value:'1'});}
  return {success:true,data,meta:{at:Date.now(),page_size:data.length}};
 };
 const options={bep20:rpc,tron:read,tronIndex:index,genesisId:genesis,minimumConfirmations:15,maxAmount:()=>10n**30n,maxEvents:1,tronWindow:2000};
 const scan=createNetworkDepositScanner(worker,options),signal=()=>AbortSignal.timeout(10000);
 const broken:WalletDb={transaction:run=>worker.transaction(tx=>run({query:(q,p)=>{if(q.startsWith('UPDATE "DepositScanCursor" SET'))throw Error('CHECKPOINT_FAILURE');return tx.query(q,p)}}))};
 await assert.rejects(()=>createNetworkDepositScanner(broken,options).scan('BEP20',signal()),/CHECKPOINT_FAILURE/);assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,0);
 logReads=0;
 assert.equal(await depositScannerHealthy(worker),false);
 const first=await scan.scan('BEP20',signal());assert.equal(first.state,'PROGRESSED');assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,1);
 assert.equal(Number((await sql('SELECT "transactionOffset" FROM "DepositScanCursor" WHERE "addressId"=$1',[bep[0].id])).rows[0].transactionOffset),8);
 await scan.scan('BEP20',signal());assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,2);
 assert.equal(Number((await sql('SELECT "nextBlock" FROM "DepositScanCursor" WHERE "addressId"=$1',[bep[0].id])).rows[0].nextBlock),117);
 assert.equal(logReads,2,'shared OR filters replace per-address/per-block scans');
 for(let i=0;i<65;i++){const id=randomUUID();await sql('INSERT INTO "User"(id,email,"emailVerifiedAt") VALUES($1,$2,now())',[id,id+'@scanner.test']);await allocateDepositAddress(worker,id,vaults.BEP20,'BEP20',117)}
 const before=blockReads;head=1130;await scan.scan('BEP20',signal());assert(blockReads-before<10,'1000 empty blocks require bounded reads, not 1000 block fetches');assert.equal(logReads,4);
 // A new assignment behind the network checkpoint must be backfilled, not skipped.
 const third=randomUUID();await sql('INSERT INTO "User"(id,email,"emailVerifiedAt") VALUES($1,$2,now())',[third,third+'@scanner.test']);await allocateDepositAddress(worker,third,vaults.BEP20,'BEP20',100);
 await scan.scan('BEP20',signal());assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,2,'rewind deduplicates prior events');
 head=130;
 const tronCursor=async()=>{const r=(await sql('SELECT "nextBlock","transactionOffset" FROM "DepositScanCursor" WHERE "addressId"=$1',[tron[0].id])).rows[0];return [Number(r.nextBlock),Number(r.transactionOffset)]};
 indexDown=true;await assert.rejects(()=>scan.scan('TRC20',signal()),/SCAN_INDEX_UNAVAILABLE/);assert.deepEqual(await tronCursor(),[100,0]);indexDown=false;
 wrongRecipient=true;await assert.rejects(()=>scan.scan('TRC20',signal()),/UNREQUESTED_RECIPIENT/);assert.deepEqual(await tronCursor(),[100,0]);wrongRecipient=false;
 misplaced=true;await assert.rejects(()=>scan.scan('TRC20',signal()),/SCAN_INDEX_CONTEXT/);assert.deepEqual(await tronCursor(),[100,0]);misplaced=false;
 assert.equal(bulkReads,0,'no whole-block receipt sets before discovery');
 const tronFirst=await scan.scan('TRC20',signal());assert.equal(tronFirst.state,'PROGRESSED');assert.equal('staged' in tronFirst&&tronFirst.staged,1);
 assert.deepEqual(await tronCursor(),[100,1],'partial replay resumes after the first transaction of the block');
 indexReads=0;fullBlockReads=0;headerReads=0;latestFullReads=0;
 const tronSecond=await scan.scan('TRC20',signal());assert.equal(tronSecond.state,'PROGRESSED');assert.equal('blocks' in tronSecond&&tronSecond.blocks,31,'one indexed window covers the whole catch-up range');
 assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,4);
 assert.equal(indexReads,2,'one recipient-filtered listing per address per window');
 assert.equal(latestFullReads,1,'the full latest block is read only inside canonical receipt observation');
 assert.equal(bulkReads,0,'indexed discovery never parses every receipt of every block');
 assert.equal(fullBlockReads,5,'full blocks: two candidate blocks for transaction order, plus genesis/inclusion/recheck inside canonical observation of the single staged event');
 assert(headerReads<=8,'anchors use header-only reads');
 assert.deepEqual(await tronCursor(),[131,0]);
 assert.equal((await sql('SELECT count(*)::int AS n FROM "ChainDepositInbox" WHERE "txId" IN ($1,$2)',[failedTx,selfTx])).rows[0].n,0,'failed and self transfers are never credited');
 assert.equal(await depositScannerHealthy(worker),true);
 // Dense single block: a full indexed page falls back to the complete canonical block/receipt set.
 await sql('UPDATE "DepositScanCursor" SET "nextBlock"=100,"transactionOffset"=0,"blockHash"=NULL,"previousBlockHash"=NULL WHERE "addressId"=ANY($1::uuid[])',[tron.map(a=>a.id)]);
 await sql('UPDATE "DepositNetworkScanner" SET "lastBlock"=NULL,"lastHash"=NULL WHERE network=\'TRC20\'');
 dense=true;bulkReads=0;incomplete=true;await assert.rejects(()=>scan.scan('TRC20',signal()),/INCOMPLETE_RECEIPTS/);assert.deepEqual(await tronCursor(),[100,0]);incomplete=false;
 const denseScan=await scan.scan('TRC20',signal());assert.equal(denseScan.state,'PROGRESSED');assert.equal(bulkReads,2,'dense fallback reads the single block receipt set, never trusting a truncated listing');
 assert.deepEqual(await tronCursor(),[100,1]);dense=false;
 await scan.scan('TRC20',signal());assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,4,'rewind deduplicates prior TRON events');
 assert.throws(()=>createNetworkDepositScanner(worker,{...options,tronWindow:4001}),/CONFIGURATION/);
 assert.throws(()=>createNetworkDepositScanner(worker,{...options,tronCandidateLimit:201}),/CONFIGURATION/);
 const pool=randomUUID();await sql('INSERT INTO "LedgerAccount"(id,"accountType") VALUES($1,\'MASTER_POOL\')',[pool]);
 const valuer=createDepositValuationWorker(worker,{enabled:true,settlementAccountId:pool,price:()=>observeUsdtUsdPrice(async()=>new Response(JSON.stringify({data:{base:'USDT',currency:'USD',amount:'0.998'}})))});
 for(const row of (await sql('SELECT id FROM "ChainDepositInbox"')).rows){await valuer(String(row.id),signal());await valuer(String(row.id),signal())}
 for(const owner of owners)assert.equal((await walletBalances(worker,owner)).posted,'39.920000');
 assert.equal((await sql('SELECT count(*)::int AS n FROM "WalletOperation"')).rows[0].n,4);
 assert.equal((await sql('SELECT sum(amount)::text AS total FROM "LedgerEntry"')).rows[0].total,'0.000000');
 // A provider answering from a node behind our checkpoint is skipped for the round, never treated as a reorg.
 await sql('UPDATE "DepositNetworkScanner" SET "lastBlock"=116,"lastHash"=$1 WHERE network=\'BEP20\'',[hex(116)]);
 head=120;assert.equal((await scan.scan('BEP20',signal())).state,'PROVIDER_BEHIND');
 assert.deepEqual((await sql('SELECT paused,"lastBlock"::int AS b,"claimId" FROM "DepositNetworkScanner" WHERE network=\'BEP20\'')).rows[0],{paused:false,b:116,claimId:null},'provider lag never pauses or moves the checkpoint');
 assert.equal(await depositScannerHealthy(worker),true);
 // Fail closed on canonical anchor change; all affected owners stop on the same network.
 head=130;reorg=true;
 await assert.rejects(()=>scan.scan('BEP20',signal()),/CHAIN_REORG/);assert.equal((await sql('SELECT paused FROM "DepositNetworkScanner" WHERE network=\'BEP20\'')).rows[0].paused,true);
 assert.equal((await scan.scan('BEP20',signal())).state,'BUSY_OR_PAUSED');assert.equal(await depositScannerHealthy(worker),false);
 console.log('Shared scanner PASS: 1000-block bounded range, OR recipients, recipient-filtered indexed TRON discovery with header-only anchors and canonical receipts, dense-block fallback, partial replay, new-address backfill, owner-bound credits exactly once, balanced ledger and network-wide reorg pause. Isolated DB only.');
}finally{await pg.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
