import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {HDKey} from '@scure/bip32';
import {createNetworkDepositScanner} from '../lib/deposit-network-scanner';
import {createBep20ReadRpc} from '../lib/bep20-rpc';
import {createTronRead} from '../lib/tron-receipt-observer';
import {allocateDepositAddress} from '../lib/deposit-address-allocation';
import type {WalletDb} from '../lib/wallet-engine';
/** Real public-chain reads, isolated in-memory fixture DB only. No production credentials,
 * customer addresses, valuation, signer, broadcast, native gas or provider purchases. */
async function main(){
 if(process.env.SIRO_DEPOSIT_CAPACITY_PROBE!=='true')return;
 if(process.env.SIRO_SIGNER_ENABLED!=='false'||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='false')throw Error('WATCH_ONLY_REQUIRED');
 const pg=new PGlite(),counts={BEP20:0,TRC20:0},target={BEP20:1000,TRC20:100};let started=Date.now(),staged=0;
 try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  for(const d of (await readdir('prisma/migrations')).sort())if(d!=='migration_lock.toml')await pg.exec(await readFile(`prisma/migrations/${d}/migration.sql`,'utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(q,p)=>({rows:(await tx.query(q,p)).rows as Record<string,unknown>[]})}))};
  const worker:WalletDb={transaction:run=>db.transaction(async tx=>{await tx.query('SET LOCAL ROLE sirocash_financial_worker');return run(tx)})};
  const signal=AbortSignal.timeout(110000);
  const scan=createNetworkDepositScanner(worker,{bep20:createBep20ReadRpc({endpoint:process.env.SIRO_BEP20_RPC_URL!,signal}),tron:createTronRead({endpoint:process.env.SIRO_TRON_RPC_URL!,maxResponseBytes:8388608,signal}),genesisId:process.env.SIRO_TRON_GENESIS_ID!,minimumConfirmations:15,maxAmount:()=>2n**256n-1n,bep20QueryWindow:Number(process.env.SIRO_BEP20_SCAN_WINDOW??'100'),headCacheMs:5000});
  // Public deterministic TEST fixture only. Never fund or reuse these fixture keys/addresses.
  const root=HDKey.fromMasterSeed(new Uint8Array(32).fill(77));
  for(const network of ['BEP20','TRC20'] as const){
   const vault=randomUUID(),head=await scan.finalHeight(network);
   await pg.query('INSERT INTO "DepositAddressVault"(id,network,"accountXpub",enabled,"originVerified") VALUES($1,$2,$3,true,true)',[vault,network,root.derive(network==='BEP20'?"m/44'/60'/0'":"m/44'/195'/0'").publicExtendedKey]);
   for(let i=0;i<(network==='BEP20'?64:1);i++){const owner=randomUUID();await pg.query('INSERT INTO "User"(id,email,"emailVerifiedAt") VALUES($1,$2,now())',[owner,owner+'@isolated-benchmark.test']);await allocateDepositAddress(worker,owner,vault,network,head-target[network]+1)}
  }
  started=Date.now();const deadline=started+85000;
  await Promise.all((['BEP20','TRC20'] as const).map(async network=>{
   while(Date.now()<deadline&&counts[network]<target[network]){
    const result=await scan.scan(network,signal);if(result.state!=='PROGRESSED')break;
    counts[network]+=result.blocks??0;staged+=result.staged??0;
   }
  }));
  const milliseconds=Date.now()-started,accepted=counts.BEP20>=target.BEP20&&counts.TRC20>=target.TRC20&&milliseconds<=85000;
  console.log('DEPOSIT_READ_BENCHMARK:'+JSON.stringify({accepted,milliseconds,blocks:counts,assignedFixtureAddresses:65,stagedFixtureEvents:staged,productionWrites:false,monetaryActions:false}));
  if(!accepted)process.exitCode=1;
 }catch(error){
  const reason=error instanceof Error&&/^[A-Z][A-Z0-9_]{1,79}$/.test(error.message)?error.message:'READ_INCOMPLETE_OR_DEADLINE';
  console.log('DEPOSIT_READ_BENCHMARK:'+JSON.stringify({accepted:false,milliseconds:Date.now()-started,blocks:counts,reason,productionWrites:false,monetaryActions:false}));process.exitCode=1;
 }finally{await pg.close()}
}
main().catch(()=>{console.error('DEPOSIT_READ_BENCHMARK:WATCH_ONLY_CONFIGURATION_FAILED');process.exitCode=1});
