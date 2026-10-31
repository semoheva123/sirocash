import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {depositDiscoveryAcceptance} from './deposit-discovery-acceptance';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated');
 for(const d of (await readdir('prisma/migrations')).sort())if(d!=='migration_lock.toml')await pg.exec(await readFile(`prisma/migrations/${d}/migration.sql`,'utf8'));
 const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(q,p)=>({rows:(await tx.query(q,p)).rows as Record<string,unknown>[]})}))};
 const worker:WalletDb={transaction:run=>db.transaction(async tx=>{await tx.query('SET LOCAL ROLE sirocash_financial_worker');return run(tx)})};
 await depositDiscoveryAcceptance(db,worker);
}finally{await pg.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
