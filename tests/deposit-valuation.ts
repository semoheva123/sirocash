import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {postValuedDeposit} from '../lib/deposit-valuation';
import {walletBalances,type WalletDb} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  const owner='00000000-0000-0000-0000-000000000001',vault='00000000-0000-0000-0000-000000000002',address='00000000-0000-0000-0000-000000000003',inbox='00000000-0000-0000-0000-000000000004',pool='00000000-0000-0000-0000-000000000005';
  await pg.query('INSERT INTO "User" (id,email,"emailVerifiedAt") VALUES ($1,\'valuation@example.test\',now())',[owner]);
  await pg.query('INSERT INTO "LedgerAccount" (id,"accountType") VALUES ($1,\'MASTER_POOL\')',[pool]);
  await pg.query('INSERT INTO "DepositAddressVault" (id,network,"accountXpub") VALUES ($1,\'BEP20\',\'xpub-fixture-only\')',[vault]);
  await pg.query('INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ($1,$2,$3,\'BEP20\',\'0x0000000000000000000000000000000000000002\',0)',[address,owner,vault]);
  const eventKey=`bsc:56:usdt:${'ab'.repeat(32)}:7`;
  await pg.query('INSERT INTO "ChainDepositInbox" (id,"eventKey","addressId",network,"txId","logIndex","blockNumber","blockHash","amountBaseUnits",fingerprint) VALUES ($1,$2,$3,\'BEP20\',$4,7,100,$5,$6,$7)',[inbox,eventKey,address,'ab'.repeat(32),'cd'.repeat(32),(20n*10n**18n).toString(),'ef'.repeat(32)]);
  await assert.rejects(()=>postValuedDeposit(db,inbox),/VALUATION_REQUIRED/);
  // Explicit 0.98 USD/token test quote, NOT a stablecoin peg.
  await pg.query(`INSERT INTO "ApprovedDepositValuation" ("inboxId","inboxFingerprint","quoteReference","rateUsdMicrosPerToken",policy,"settlementAccountId","approvedAt","expiresAt") VALUES ($1,$2,'reviewed:fixture:001',980000,'floor-usd-micros-v1',$3,now()-interval '1 minute',now()+interval '1 hour')`,[inbox,'ef'.repeat(32),pool]);
  await pg.exec('UPDATE "ApprovedDepositValuation" SET "expiresAt"=now()-interval \'1 second\'');
  await assert.rejects(()=>postValuedDeposit(db,inbox),/EXPIRED_OR_INVALID_STATE/);
  await pg.exec('UPDATE "ApprovedDepositValuation" SET "expiresAt"=now()+interval \'1 hour\',"inboxFingerprint"=repeat(\'ab\',32)');
  await assert.rejects(()=>postValuedDeposit(db,inbox),/VALUATION_CONFLICT/);
  await pg.exec('UPDATE "ApprovedDepositValuation" SET "inboxFingerprint"=repeat(\'ef\',32)');
  const failing:WalletDb={transaction:run=>db.transaction(tx=>run({query:(sql,params)=>{if(sql.startsWith('UPDATE "ChainDepositInbox"'))throw Error('injected persistence failure');return tx.query(sql,params)}}))};
  await assert.rejects(()=>postValuedDeposit(failing,inbox),/injected persistence failure/);
  assert.equal((await pg.query('SELECT * FROM "WalletOperation"')).rows.length,0);
  assert.equal((await walletBalances(db,owner)).posted,'0.000000');
  const posted=await postValuedDeposit(db,inbox);assert.equal(posted.amount,'19.600000');assert.equal((await walletBalances(db,owner)).posted,'19.600000');
  await pg.exec('UPDATE "ApprovedDepositValuation" SET "expiresAt"=now()-interval \'1 second\'');
  assert.deepEqual(await postValuedDeposit(db,inbox),posted);
  assert.equal((await pg.query('SELECT * FROM "WalletOperation"')).rows.length,1);
  const {rows:[sum]}=await pg.query<{total:string}>('SELECT sum(amount)::text AS total FROM "LedgerEntry"');assert.equal(Number(sum.total),0);
  await pg.exec('SET ROLE sirocash_app');await assert.rejects(()=>pg.exec('SELECT * FROM "ApprovedDepositValuation"'),/permission denied/);
  console.log('Deposit valuation: explicit non-peg USD rate, BEP20 decimals, expiry/evidence checks, atomic ledger+inbox rollback, exact replay after expiry, balanced journal and denied app privileges passed. No pricing authority or live posting enabled.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
