import {PGlite} from '@electric-sql/pglite';
import {readdir,readFile} from 'node:fs/promises';
import {dualResourceBudgetAcceptance} from './dual-resource-budget';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated');
 for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 const query=async(sql:string,params?:unknown[])=>({rows:(await pg.query(sql,params)).rows as any[]});
 const db:WalletDb={transaction:run=>pg.transaction(async tx=>{
  await tx.exec('SET LOCAL ROLE sirocash_financial_worker');
  return run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})});
 })};
 await dualResourceBudgetAcceptance(query,db);
}finally{await pg.close()}}
void main().catch(e=>{console.error(e);process.exitCode=1});
