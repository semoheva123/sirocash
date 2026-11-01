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
 const tronReceipts=txs.map((id,i)=>({id,blockNumber:100,receipt:{result:'SUCCESS'},log:[tronLogs[i]]})).concat(tronTxs.slice(2).map(id=>({id,blockNumber:100,receipt:{result:'SUCCESS'},log:[]})));
 const read=async(path:string,body:Record<string,unknown>)=>{
  if(path==='/walletsolidity/getblockbynum'||path==='/walletsolidity/getnowblock'){const n=path.endsWith('getnowblock')?head:Number(body.num);return {blockID:n===0?genesis:tronHash(n),block_header:{raw_data:{number:n,parentHash:tronHash(n-1)}},transactions:n===100?tronTxs.map(txID=>({txID,ret:[{contractRet:'SUCCESS'}]})):[]}}
  if(path==='/wallet/gettransactioninfobyblocknum'){bulkReads++;return Number(body.num)===100?incomplete?tronReceipts.slice(1):tronReceipts:[]}
  if(path==='/walletsolidity/gettransactioninfobyid')return tronReceipts.find(r=>r.id===body.value);
  throw Error('unexpected TRON path');
 };
 const options={bep20:rpc,tron:read,genesisId:genesis,minimumConfirmations:15,maxAmount:()=>10n**30n,maxEvents:1};
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
 let inFlight=0,peak=0;const beforeChunks=logReads;
 const chunked=createNetworkDepositScanner(worker,{...options,bep20QueryWindow:10,bep20:async(m,p)=>{if(m!=='eth_getLogs')return rpc(m,p);inFlight++;peak=Math.max(peak,inFlight);await new Promise<void>(resolve=>setImmediate(resolve));try{return await rpc(m,p)}finally{inFlight--}}});
 await chunked.scan('BEP20',signal());assert.equal(logReads-beforeChunks,100);assert(peak>1&&peak<=4,'wire ranges use bounded parallel reads, one atomic logical checkpoint');assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,2,'rewind deduplicates prior events');
 head=130;incomplete=true;await assert.rejects(()=>scan.scan('TRC20',signal()),/INCOMPLETE_RECEIPTS/);assert.equal(Number((await sql('SELECT "nextBlock" FROM "DepositScanCursor" WHERE "addressId"=$1',[tron[0].id])).rows[0].nextBlock),100);
 incomplete=false;await scan.scan('TRC20',signal());await scan.scan('TRC20',signal());assert.equal((await sql('SELECT * FROM "ChainDepositInbox"')).rows.length,4);assert.equal(bulkReads,3,'one full receipt request per network block, not per transaction/customer');
 assert.equal(await depositScannerHealthy(worker),true);
 const pool=randomUUID();await sql('INSERT INTO "LedgerAccount"(id,"accountType") VALUES($1,\'MASTER_POOL\')',[pool]);
 const valuer=createDepositValuationWorker(worker,{enabled:true,settlementAccountId:pool,price:()=>observeUsdtUsdPrice(async()=>new Response(JSON.stringify({data:{base:'USDT',currency:'USD',amount:'0.998'}})))});
 for(const row of (await sql('SELECT id FROM "ChainDepositInbox"')).rows){await valuer(String(row.id),signal());await valuer(String(row.id),signal())}
 for(const owner of owners)assert.equal((await walletBalances(worker,owner)).posted,'39.920000');
 assert.equal((await sql('SELECT count(*)::int AS n FROM "WalletOperation"')).rows[0].n,4);
 assert.equal((await sql('SELECT sum(amount)::text AS total FROM "LedgerEntry"')).rows[0].total,'0.000000');
 // Fail closed on canonical anchor change; all affected owners stop on the same network.
 head=130;await sql('UPDATE "DepositNetworkScanner" SET "lastBlock"=116,"lastHash"=$1 WHERE network=\'BEP20\'',[hex(116)]);reorg=true;
 await assert.rejects(()=>scan.scan('BEP20',signal()),/CHAIN_REORG/);assert.equal((await sql('SELECT paused FROM "DepositNetworkScanner" WHERE network=\'BEP20\'')).rows[0].paused,true);
 assert.equal((await scan.scan('BEP20',signal())).state,'BUSY_OR_PAUSED');assert.equal(await depositScannerHealthy(worker),false);
 const cached=createNetworkDepositScanner(worker,{...options,headCacheMs:5000});const reads=blockReads;await cached.finalHeight('BEP20');await cached.finalHeight('BEP20');assert.equal(blockReads-reads,1,'bounded head cache avoids repeated chain metadata reads during catch-up');
 console.log('Shared scanner PASS: 1000-block bounded range, OR recipients, complete bulk TRON receipts, partial replay, new-address backfill, owner-bound credits exactly once, balanced ledger and network-wide reorg pause. Isolated DB only.');
}finally{await pg.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
