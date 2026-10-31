import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {HDKey} from '@scure/bip32';
import {base58} from '@scure/base';
import type {WalletDb} from '../lib/wallet-engine';
import {customerDepositAddress} from '../lib/customer-deposit-address';
import {createDepositValuationWorker} from '../lib/deposit-valuation-worker';
import {observeUsdtUsdPrice} from '../lib/financial-price';
import {walletBalances} from '../lib/wallet-engine';
import {createDepositDiscovery} from '../lib/deposit-discovery';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
/** Same fixtures execute against PGlite and a restricted worker on real PostgreSQL. */
export async function depositDiscoveryAcceptance(admin:WalletDb,worker:WalletDb){
 const sql=(q:string,p:unknown[]=[])=>admin.transaction(tx=>tx.query(q,p));
 const owner=randomUUID(),session='de'.repeat(32),c={userId:owner,sessionHash:session,origin:'https://deposit.example.test',rpID:'deposit.example.test'};
 await sql('INSERT INTO "User" (id,email,"emailVerifiedAt") VALUES ($1,$2,now())',[owner,owner+'@discovery.test']);
 await sql('INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt") VALUES ($1,$2,now()+interval \'1 hour\')',[session,owner]);
 const root=HDKey.fromMasterSeed(new Uint8Array(32).fill(13)),vaults={TRC20:randomUUID(),BEP20:randomUUID()};
 for(const network of ['TRC20','BEP20'] as const)await sql('INSERT INTO "DepositAddressVault" (id,network,"accountXpub",enabled,"originVerified") VALUES ($1,$2,$3,true,true)',[vaults[network],network,root.derive(network==='TRC20'?"m/44'/195'/0'":"m/44'/60'/0'").publicExtendedKey]);
 const addresses={} as Record<string,string>,ids={} as Record<string,string>;
 for(const network of ['TRC20','BEP20'] as const){
  const options={vaultId:vaults[network],finalHeight:async()=>100};
  const all=await Promise.all(Array.from({length:8},()=>customerDepositAddress(worker,c,{chain:network,asset:'USDT'},options)));
  assert.equal(new Set(all.map(v=>v.address)).size,1);addresses[network]=all[0].address;
  const {rows:[a]}=await sql('SELECT id FROM "UserDepositAddress" WHERE "ownerId"=$1 AND network=$2',[owner,network]);ids[network]=String(a.id);
  assert.equal(String((await sql('SELECT "nextIndex" FROM "DepositAddressVault" WHERE id=$1',[vaults[network]])).rows[0].nextIndex),'1');
  assert.equal(String((await sql('SELECT "nextBlock" FROM "DepositScanCursor" WHERE "addressId"=$1',[a.id])).rows[0].nextBlock),'100');
 }
 await assert.rejects(()=>customerDepositAddress(worker,c,{chain:'BEP20',asset:'USDT',ownerId:randomUUID()},{vaultId:vaults.BEP20,finalHeight:async()=>100}));
 await assert.rejects(()=>worker.transaction(tx=>tx.query('UPDATE "DepositAddressVault" SET "nextIndex"="nextIndex"+2 WHERE id=$1',[vaults.BEP20])),/INCREMENT_ONLY/);
 const topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',blockHash='cd'.repeat(32),parent='ab'.repeat(32),genesis='0'.repeat(16)+'ab'.repeat(24);
 const txs=Array.from({length:4},(_,i)=>(i+1).toString(16).padStart(64,'0'));
 const logs=txs.map((tx,i)=>({address:bep20UsdtContract,transactionHash:'0x'+tx,blockHash:'0x'+blockHash,blockNumber:'0x64',transactionIndex:'0x'+i.toString(16),removed:false,logIndex:'0x'+(i+7).toString(16),topics:['0x'+topic,'0x'+'0'.repeat(63)+'1','0x'+'0'.repeat(24)+addresses.BEP20.slice(2).toLowerCase()],data:'0x'+(20n*10n**18n).toString(16).padStart(64,'0')}));
 let reorg=false,fail=false,release:()=>void=()=>{},entered:()=>void=()=>{};
 let gate:Promise<void>|undefined;
 const bep20=async(method:string,params:unknown[])=>{
  if(gate){entered();await gate;gate=undefined}
  if(fail)throw Error('FIXTURE_RPC_UNAVAILABLE');
  if(method==='eth_chainId')return '0x38';if(method==='eth_blockNumber')return '0x78';if(method==='eth_getLogs')return logs;
  if(method==='eth_getTransactionReceipt'){const i=txs.indexOf(String(params[0]).slice(2));return {transactionHash:params[0],blockHash:'0x'+blockHash,blockNumber:'0x64',transactionIndex:'0x'+i.toString(16),status:'0x1',logs:[logs[i]]}}
  return params[0]==='finalized'?{number:'0x73',hash:'0x'+parent}:{number:params[0],hash:'0x'+(reorg?parent:blockHash),parentHash:'0x'+parent,transactions:txs.map(t=>'0x'+t)};
 };
 const tronBlock='0000000000000064'+'cd'.repeat(24),tronParent='0000000000000063'+'cd'.repeat(24);
 const tron=async(path:string,body:Record<string,unknown>)=>{
  if(path.endsWith('getnowblock'))return {blockID:'0000000000000069'+'cd'.repeat(24),block_header:{raw_data:{number:105}}};
  if(path.endsWith('getblockbynum'))return body.num===0?{blockID:genesis,block_header:{raw_data:{number:0}}}:{blockID:tronBlock,block_header:{raw_data:{number:100,parentHash:tronParent}},transactions:txs.map(txID=>({txID,ret:[{contractRet:'SUCCESS'}]}))};
  return {id:body.value,blockNumber:100,receipt:{result:'SUCCESS'},log:[{address:Buffer.from(base58.decode(tronUsdtContract)).subarray(1,21).toString('hex'),topics:[topic,'0'.repeat(63)+'1','0'.repeat(24)+Buffer.from(base58.decode(addresses.TRC20)).subarray(1,21).toString('hex')],data:(20n*10n**6n).toString(16).padStart(64,'0')}]};
 };
 const options={enabled:true,bep20,tron,tronGenesisId:genesis,minimumBep20Confirmations:15,maxBep20Amount:100n*10n**18n,maxTronAmount:100n*10n**6n};
 const discovery=createDepositDiscovery(worker,options),signal=()=>new AbortController().signal;
 await sql('DELETE FROM "DepositScanCursor" WHERE "addressId"=$1',[ids.TRC20]);
 await assert.rejects(()=>customerDepositAddress(worker,c,{chain:'TRC20',asset:'USDT'},{vaultId:vaults.TRC20,finalHeight:async()=>105}),/HISTORICAL_START_REQUIRED/);
 assert.equal((await discovery.process(ids.TRC20,signal())).state,'HELD');
 const bootstrap=createDepositDiscovery(worker,{...options,historicalStarts:{TRC20:100}});
 await bootstrap.process(ids.TRC20,signal());
 assert.equal(Number((await sql('SELECT "transactionOffset" FROM "DepositScanCursor" WHERE "addressId"=$1',[ids.TRC20])).rows[0].transactionOffset),3);

 fail=true;await assert.rejects(()=>discovery.process(ids.BEP20,signal()),/UNAVAILABLE/);fail=false;
 assert.equal(String((await sql('SELECT "nextBlock" FROM "DepositScanCursor" WHERE "addressId"=$1',[ids.BEP20])).rows[0].nextBlock),'100');
 // A fenced cursor and its inbox inserts must roll back together.
 const broken:WalletDb={transaction:run=>worker.transaction(tx=>run({query:(q,p)=>{if(q.startsWith('UPDATE "DepositScanCursor" SET "nextBlock"'))throw Error('FIXTURE_CHECKPOINT_FAILURE');return tx.query(q,p)}}))};
 await assert.rejects(()=>createDepositDiscovery(broken,options).process(ids.BEP20,signal()),/CHECKPOINT_FAILURE/);
 assert.equal((await sql('SELECT id FROM "ChainDepositInbox" WHERE "addressId"=$1',[ids.BEP20])).rows.length,0);
 // Concurrent ticks cannot duplicate RPC processing or steal the lease.
 gate=new Promise<void>(resolve=>{release=resolve});const waiting=new Promise<void>(resolve=>{entered=resolve});
 const running=discovery.process(ids.BEP20,signal());await waiting;
 assert.equal((await discovery.process(ids.BEP20,signal())).state,'BUSY_OR_PAUSED');release();await running;
 assert.equal((await sql('SELECT id FROM "ChainDepositInbox" WHERE "addressId"=$1',[ids.BEP20])).rows.length,3);
 assert.equal(Number((await sql('SELECT "transactionOffset" FROM "DepositScanCursor" WHERE "addressId"=$1',[ids.BEP20])).rows[0].transactionOffset),3);
 await discovery.process(ids.BEP20,signal());
 assert.equal((await sql('SELECT id FROM "ChainDepositInbox" WHERE "addressId"=$1',[ids.BEP20])).rows.length,4);
 await discovery.process(ids.TRC20,signal());
 assert.equal((await sql('SELECT id FROM "ChainDepositInbox" WHERE "addressId"=$1',[ids.TRC20])).rows.length,4);
 assert.equal(Number((await sql('SELECT "nextBlock" FROM "DepositScanCursor" WHERE "addressId"=$1',[ids.TRC20])).rows[0].nextBlock),101);
 assert.equal((await sql('SELECT id FROM "WalletOperation" WHERE "ownerId"=$1',[owner])).rows.length,0,'discovery cannot post money');
 const settlement=randomUUID();await sql('INSERT INTO "LedgerAccount" (id,"accountType") VALUES ($1,\'MASTER_POOL\')',[settlement]);
 const valuer=createDepositValuationWorker(worker,{enabled:true,settlementAccountId:settlement,price:()=>observeUsdtUsdPrice(async()=>new Response(JSON.stringify({data:{base:'USDT',currency:'USD',amount:'0.998'}})))});
 const inboxes=(await sql('SELECT i.id FROM "ChainDepositInbox" i JOIN "UserDepositAddress" a ON a.id=i."addressId" WHERE a."ownerId"=$1 ORDER BY a.network,i.id',[owner])).rows;
 for(const inbox of inboxes.slice(1))await valuer(String(inbox.id),signal());
 assert.equal((await walletBalances(worker,owner)).posted,'139.720000');
 // Rewind only the fixture's cursor to model a crash/replay: inbox identity remains exact.
 await sql('UPDATE "DepositScanCursor" SET "nextBlock"=100,"transactionOffset"=0,"previousBlockHash"=NULL WHERE "addressId"=$1',[ids.BEP20]);
 await discovery.process(ids.BEP20,signal());assert.equal((await sql('SELECT id FROM "ChainDepositInbox" WHERE "addressId"=$1',[ids.BEP20])).rows.length,4);
 reorg=true;await assert.rejects(()=>discovery.process(ids.BEP20,signal()),/CHAIN_REORG/);
 assert.equal((await sql('SELECT paused FROM "DepositScanCursor" WHERE "addressId"=$1',[ids.BEP20])).rows[0].paused,true);
 assert.equal((await discovery.process(ids.BEP20,signal())).state,'BUSY_OR_PAUSED');
 await assert.rejects(()=>customerDepositAddress(worker,c,{chain:'BEP20',asset:'USDT'},{vaultId:vaults.BEP20,finalHeight:async()=>100}),/NOT_ACTIVE/);
 await assert.rejects(()=>valuer(String(inboxes[0].id),signal()),/CHAIN_REVIEW_REQUIRED/);
 assert.equal((await walletBalances(worker,owner)).posted,'139.720000');
 console.log('Deposit discovery acceptance PASS: two networks, 8-way address allocation, trusted owner/vault, cursor creation, finality, bounded resumption, rollback, lease exclusion, replay, reorg pause, no discovery ledger writes and real non-peg valuation/credit composition.');
}
