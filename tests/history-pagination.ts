import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {historyRequest,readFinancialHistoryPage} from '../lib/financial-history-page';
import {readFinancialSnapshot} from '../lib/financial-status';
import {walletActivity} from '../lib/wallet-activity';
import type {WalletTx} from '../lib/wallet-engine';
const uuid=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  for(const dir of (await readdir('prisma/migrations')).sort())if(dir!=='migration_lock.toml')await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
  const owner=uuid(1),foreign=uuid(2);
  await pg.query('INSERT INTO "User"(id,email) VALUES ($1,\'owner@test.invalid\'),($2,\'foreign@test.invalid\')',[owner,foreign]);
  for(let n=10;n<45;n++)await pg.query(`INSERT INTO "WalletOperation"(id,"ownerId","requestKey",fingerprint,kind,amount,destination,state,"createdAt") VALUES ($1,$2,$3,'fixture','WITHDRAWAL',6,'fixture','RESERVED','2026-11-01')`,[uuid(n),owner,'fixture:'+n]);
  for(let n=100;n<140;n++)await pg.query(`INSERT INTO "WalletOperation"(id,"ownerId","counterpartyId","requestKey",fingerprint,kind,amount,state,"createdAt") VALUES ($1,$2,$3,$4,'fixture','TRANSFER',1,'PENDING','2026-11-02')`,[uuid(n),owner,foreign,'fixture:'+n]);
  await pg.query(`INSERT INTO "WalletOperation"(id,"ownerId","requestKey",fingerprint,kind,amount,destination,state) VALUES ($1,$2,'foreign:fixture','fixture','WITHDRAWAL',999,'fixture','RESERVED')`,[uuid(500),foreign]);
  await pg.exec('SET ROLE sirocash_financial_worker');
  const tx:WalletTx={query:async(sql,params)=>({rows:(await pg.query(sql,params)).rows as Record<string,unknown>[]})};
  const snapshot=await readFinancialSnapshot(tx,owner);assert.equal(snapshot.operations.filter(r=>r.kind==='WITHDRAWAL').length,0);assert.equal(snapshot.withdrawals.length,30,'Separate latest withdrawal projection cannot be crowded out by transfers');
  const first=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'withdrawals'}));
  const rows=first.operations as {id:string}[];assert.equal(rows.length,30);assert.equal(rows[0].id,uuid(44));assert(first.next);
  const second=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'withdrawals',before:first.next}));
  const older=second.operations as {id:string}[];assert.equal(older.length,5);assert.equal(second.next,null);assert.equal(new Set([...rows,...older].map(r=>r.id)).size,35,'Same timestamp keyset does not skip or repeat');
  const pending=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'pending',type:'WITHDRAWAL'}));assert.equal((pending.activity as unknown[]).length,30);assert(pending.next);
  const pendingOlder=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'pending',type:'WITHDRAWAL',before:pending.next}));assert.equal((pendingOlder.activity as unknown[]).length,5);
  const dated=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'withdrawals',from:'2026-11-02'}));assert.equal((dated.operations as unknown[]).length,0);
  const searched=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'withdrawals',q:uuid(44)}));assert.equal((searched.operations as unknown[]).length,1);
  const emptyActivity=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'activity',network:'TRC20',q:"' OR true",type:'DEPOSIT'}));assert.equal((emptyActivity.activity as unknown[]).length,0);
  const stolen=await readFinancialHistoryPage(tx,owner,historyRequest.parse({scope:'withdrawals',id:uuid(500)}));assert.equal((stolen.operations as unknown[]).length,0);assert(!JSON.stringify(first).includes('999'));
  const unrelated=await readFinancialHistoryPage(tx,foreign,historyRequest.parse({scope:'operation',id:uuid(10)}));assert.equal(unrelated.resolved,null);
  for(const bad of [{scope:'withdrawals',owner:foreign},{scope:'withdrawals',before:{at:'bad',id:uuid(1)}},{scope:'deposits',id:'../../secret'},{scope:'operation'},{scope:'withdrawals',id:uuid(1),before:first.next}])assert.equal(historyRequest.safeParse(bad).success,false);
  await pg.exec('RESET ROLE');
  const activity=walletActivity({enabled:true,userId:owner,activity:[{id:'posted',type:'P2P',amount:'3',status:'COMPLETED',createdAt:'2026-11-01'}],operations:[{id:'pending',kind:'WITHDRAWAL',amount:'6',feeAmount:'0',state:'RESERVED',createdAt:'2026-11-03'},{id:'done',kind:'WITHDRAWAL',amount:'9',feeAmount:'0',state:'COMPLETED',createdAt:'2026-11-01'}],deposits:[{id:'observed',network:'BEP20',txId:'0x'+'a'.repeat(64),amountBaseUnits:'1000000000000000001',state:'AWAITING_VALUATION',createdAt:'2026-11-02'}]});
  assert.equal(activity.length,3);assert.equal(activity[0].status,'RESERVED');assert.equal(activity[0].amount,'-6');assert.equal(activity[1].amount,'1.000000000000000001');assert.equal(activity[1].currency,'USDT');assert(!activity.some(r=>r.id==='done'));
  console.log('History PASS: restricted-role real-schema reads, 35 withdrawals despite 40 newer transfers, deterministic tied-date keyset/no skips/duplicates, owner isolation and strict cursor validation; pending requests/observations without double counting posted activity. Offline only.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
