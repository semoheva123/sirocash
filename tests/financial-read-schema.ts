import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {financialReadTransactions} from '../lib/financial-read-transactions';
import {readFinancialSnapshot} from '../lib/financial-status';
import {displayLedgerBalance} from '../lib/account-overview';
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
  const owner='00000000-0000-0000-0000-000000000001',empty='00000000-0000-0000-0000-000000000002';
  await pg.query('INSERT INTO "User" (id,email) VALUES ($1,\'read-fixture@example.test\')',[owner]);
  await pg.query('INSERT INTO "LedgerAccount" (id,"userId","accountType") VALUES ($1,$2,\'USER\')',['00000000-0000-0000-0000-000000000003',owner]);
  const pool={connect:async()=>{await pg.exec('SET ROLE sirocash_financial_worker');return {query:(sql:string,params?:unknown[])=>pg.query(sql,params),release:()=>{}}}} as unknown as Pick<Pool,'connect'>;
  const db=financialReadTransactions(pool);
  const zero=await db.transaction(tx=>readFinancialSnapshot(tx,owner));assert.equal(zero.balance.posted,'0.000000');assert.equal(displayLedgerBalance({userId:owner,...zero},owner),'0.00');
  const missing=await db.transaction(tx=>readFinancialSnapshot(tx,empty));assert.equal(missing.balance.posted,'0');assert.equal(displayLedgerBalance({userId:empty,...missing},empty),'0.00');
  await assert.rejects(()=>db.transaction(tx=>tx.query('UPDATE "LedgerAccount" SET balance=1')),/read.only/i);
  await pg.exec('RESET ROLE');assert.equal((await pg.query<{balance:string}>('SELECT balance::text FROM "LedgerAccount"')).rows[0].balance,'0.000000');
  console.log('Full-schema read-only PASS: actual restricted role, all snapshot projection privileges, absent/existing zero scale, owner display and write rejection.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
