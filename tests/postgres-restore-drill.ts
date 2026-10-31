import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,chmod,mkdir} from 'node:fs/promises';
import {Client} from 'pg';
import type {Pool} from 'pg';
import {verifyFinancialSchema} from '../lib/financial-schema';
const exec=promisify(execFile);
async function snapshot(db:Client|Pool){
 const {rows:tables}=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const result:Record<string,string>={};
 for(const {tablename} of tables){
  if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(tablename))throw Error('UNEXPECTED_FIXTURE_TABLE');
  // Sorting row JSON avoids insertion-order differences and covers every column, including holds/audit.
  const {rows:[r]}=await db.query(`SELECT md5(COALESCE(string_agg(v,E'\\n' ORDER BY v),'')) AS digest FROM (SELECT row_to_json(t)::text AS v FROM public."${tablename}" t) q`);
  result[tablename]=r.digest;
 }
 return result;
}
/** Actual pg_dump/pg_restore, isolated local fixture databases only. No production URL fallback. */
export async function restoreFixtureDrill(source:Pool,admin:Client,sourceUrl:URL){
 if(!sourceUrl.pathname.startsWith('/siro_test_'))throw Error('FIXTURE_RESTORE_ONLY');
 const target=sourceUrl.pathname.slice(1)+'_restore',directory=await (async()=>{await mkdir('.cache',{recursive:true});return mkdtemp('.cache/restore-drill-')})();
 await chmod(directory,0o700);
 const file=directory+'/fixture.dump',password=decodeURIComponent(sourceUrl.password),safe=new URL(sourceUrl);safe.password='';
 const env={...process.env,PGPASSWORD:password};
 let restored:Client|undefined,created=false;
 try{
  const before=await snapshot(source);
  await exec(process.env.SIRO_TEST_PG_DUMP??'pg_dump',['--format=custom','--no-owner','--file',file,'--dbname',safe.toString()],{env,maxBuffer:1024*1024});
  await chmod(file,0o600);
  await admin.query(`CREATE DATABASE "${target}"`);created=true;
  safe.pathname='/'+target;
  await exec(process.env.SIRO_TEST_PG_RESTORE??'pg_restore',['--exit-on-error','--no-owner','--dbname',safe.toString(),file],{env,maxBuffer:1024*1024});
  const targetUrl=new URL(sourceUrl);targetUrl.pathname='/'+target;
  restored=new Client({connectionString:targetUrl.toString(),options:'-c timezone=UTC'});await restored.connect();
  assert.deepEqual(await snapshot(restored),before,'all application rows/columns must survive a real dump/restore');
  await restored.query('BEGIN READ ONLY');await restored.query('SET LOCAL ROLE sirocash_app');
  assert.equal((await verifyFinancialSchema((sql,params)=>restored!.query(sql,params))).tables,28);await restored.query('ROLLBACK');
  assert.equal((await restored.query('SELECT "transactionId" FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM(amount)<>0')).rowCount,0);
  assert.equal((await restored.query('SELECT a.id FROM "LedgerAccount" a LEFT JOIN "LedgerEntry" e ON e."accountId"=a.id GROUP BY a.id HAVING a.balance<>COALESCE(SUM(e.amount),0)')).rowCount,0);
  await assert.rejects(()=>restored!.query('DELETE FROM "LedgerEntry"'),/immutable/);
  console.log('Real backup/restore PASS: pg_dump -> separate database -> pg_restore; every public table digest, balance cache, balanced journal, application isolation and immutable ledger guard verified. Fixture data only; dump removed.');
 }catch(error){
  // Child-process failures can contain connection details. Never forward stdout/stderr or arguments.
  throw Error(error instanceof assert.AssertionError?error.message:'ISOLATED_RESTORE_DRILL_FAILED (verify local pg_dump/pg_restore versions and permissions)');
 }finally{
  await restored?.end();if(created)await admin.query(`DROP DATABASE "${target}"`);await rm(directory,{recursive:true,force:true});
 }
}
