import {verifyFinancialSchema} from '../lib/financial-schema';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
async function main(){
 const db=new PGlite();try{
  // Reproduce hosted direct default grants; RLS alone would hide these grants from data tests.
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO anon,authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
  for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
  assert.equal((await db.query<{exposed:boolean}>("SELECT has_function_privilege('anon','public.financial_notify_change()','EXECUTE') OR has_function_privilege('authenticated','public.financial_notify_change()','EXECUTE') AS exposed")).rows[0].exposed,false,'hosted default grants must not expose the event trigger');
  assert.equal((await db.query<{exposed:boolean}>("SELECT has_function_privilege('anon','public.financial_notify_network_change()','EXECUTE') OR has_function_privilege('authenticated','public.financial_notify_network_change()','EXECUTE') AS exposed")).rows[0].exposed,false,'network-event trigger must resist hosted default grants');
  const names=['WalletOperation','EnergyRentalIntent','DepositAddressVault','UserDepositAddress','ChainDepositInbox','PlatformWithdrawalGuard','SignedSweepOutbox','SweepConfirmation','DurablePasskeyCredential','DurablePasskeyChallenge','DurablePaymentApproval','ApprovedDepositValuation','UsdtWithdrawalQuote','WithdrawalSigningGuard','SignedWithdrawalOutbox','PayoutDispatchApproval','PayoutDispatchAttempt','PayoutConfirmation','PayoutExpensePolicy','PayoutExpenseReservation','EnergyPurchasePolicy','EnergyPurchaseAttempt','SweepDispatchAuthorization','FinancialWorkerLease','NativeGasOutbox','DispatchApprovalHistory','FinancialPriceObservation','DepositScanCursor'];
  for(const name of names){
   const {rows:[row]}=await db.query<{rls:boolean;anon:boolean;authenticated:boolean;runtime:boolean}>(`SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated,has_table_privilege('sirocash_app',oid,'SELECT,INSERT,UPDATE,DELETE') AS runtime FROM pg_class WHERE oid=$1::regclass`,['"'+name+'"']);
   assert.equal(row.rls,true,name);assert.equal(row.anon,false,name);assert.equal(row.authenticated,false,name);
   assert.equal(row.runtime,name.startsWith('Durable'),name);
  }
  await db.exec('BEGIN; SET LOCAL ROLE sirocash_app;');
  const verified=await verifyFinancialSchema(async(sql,params)=>({rows:(await db.query(sql,params)).rows as Record<string,unknown>[]}));
  assert.equal(verified.tables,28);assert.equal(verified.status,'VERIFIED');assert.equal(verified.runtimeFinancialAccess,false);
  await db.exec('ROLLBACK;');
  await db.exec('GRANT EXECUTE ON FUNCTION public.financial_consume_approval(uuid,text,text,text,text) TO anon; BEGIN; SET LOCAL ROLE sirocash_app;');
  await assert.rejects(()=>verifyFinancialSchema(async(sql,params)=>({rows:(await db.query(sql,params)).rows as Record<string,unknown>[]})),/BRIDGE_ACCESS_UNSAFE/);
  await db.exec('ROLLBACK; REVOKE EXECUTE ON FUNCTION public.financial_consume_approval(uuid,text,text,text,text) FROM anon;');
  await db.exec('BEGIN;');
  await assert.rejects(()=>verifyFinancialSchema(async(sql,params)=>({rows:(await db.query(sql,params)).rows as Record<string,unknown>[]})),/UNSAFE_ROLE/);
  await db.exec('ROLLBACK;');
  await db.exec('GRANT SELECT ON \"WalletOperation\" TO sirocash_app; BEGIN; SET LOCAL ROLE sirocash_app;');
  await assert.rejects(()=>verifyFinancialSchema(async(sql,params)=>({rows:(await db.query(sql,params)).rows as Record<string,unknown>[]})),/ISOLATION_FAILED/);
  await db.exec('ROLLBACK;');
  await db.exec('REVOKE SELECT ON \"WalletOperation\" FROM sirocash_app; DROP INDEX payout_network_unresolved; BEGIN; SET LOCAL ROLE sirocash_app;');
  await assert.rejects(()=>verifyFinancialSchema(async(sql,params)=>({rows:(await db.query(sql,params)).rows as Record<string,unknown>[]})),/GUARDS_MISSING/);
  await db.exec('ROLLBACK;');
  console.log('28 financial/auth tables: hosted-style default grants removed, RLS enabled, runtime limited to durable authentication storage.');
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
