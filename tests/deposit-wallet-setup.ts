import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
import {deriveBep20DepositAddress} from '../lib/evm-deposit-addresses';
import {checkDepositWalletSetup} from '../lib/deposit-wallet-setup';
import {allocateTronDepositAddress,allocateBep20DepositAddress,allocateDepositAddress} from '../lib/deposit-address-allocation';
import type {WalletDb} from '../lib/wallet-engine';
// Known PUBLIC fixture seed only, not an owner's production wallet. Never fund fixtures.
const root=HDKey.fromMasterSeed(new Uint8Array(32).fill(7));
const tron=root.derive("m/44'/195'/0'").publicExtendedKey;
const evm=root.derive("m/44'/60'/0'").publicExtendedKey;
const ta=deriveTronDepositAddress(tron,0),ea=deriveBep20DepositAddress(evm,0);
assert.notEqual(ea.address,deriveBep20DepositAddress(evm,1).address);
for(const network of ['TRC20','BEP20'] as const){
 const input={network,accountXpub:network==='TRC20'?tron:evm,firstAddress:network==='TRC20'?ta.address:ea.address,origin:network==='TRC20'?"m/44'/195'/0'":"m/44'/60'/0'"};
 const checked=checkDepositWalletSetup(input);assert.equal(checked.enabled,false);assert.equal(checked.signingVerified,false);assert.ok(!JSON.stringify(checked).includes(input.accountXpub));
 assert.throws(()=>checkDepositWalletSetup({...input,origin:"m/44'/0'/0'"}));
 assert.throws(()=>checkDepositWalletSetup({...input,firstAddress:network==='TRC20'?deriveTronDepositAddress(tron,1).address:deriveBep20DepositAddress(evm,1).address}));
}
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
  for(const m of ['20261031030000_deposit_addresses','20261031060000_bep20_deposit_addresses'])await pg.exec(await readFile(`prisma/migrations/${m}/migration.sql`,'utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  const owner='00000000-0000-0000-0000-000000000001',tv='00000000-0000-0000-0000-000000000002',ev='00000000-0000-0000-0000-000000000003';
  await pg.query('INSERT INTO "User" VALUES ($1)',[owner]);
  await pg.query('INSERT INTO "DepositAddressVault" (id,network,"accountXpub","originVerified",enabled) VALUES ($1,\'TRC20\',$2,true,true),($3,\'BEP20\',$4,true,true)',[tv,tron,ev,evm]);
  const t=await allocateTronDepositAddress(db,owner,tv),e=await allocateBep20DepositAddress(db,owner,ev);
  assert.equal(t.address,ta.address);assert.equal(e.address,ea.address);
  assert.deepEqual(await allocateBep20DepositAddress(db,owner,ev),e);
  await assert.rejects(()=>allocateDepositAddress(db,owner,tv,'BEP20'),/NOT_READY/);
  assert.equal(Number((await pg.query<{n:number}>('SELECT count(*) AS n FROM "UserDepositAddress"')).rows[0].n),2);
  await assert.rejects(()=>pg.query('INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ($1,$2,$3,\'BEP20\',\'test-mismatch\',9)',['00000000-0000-0000-0000-000000000009',owner,tv]));
  console.log('Dual-network watch-only setup, address comparison, per-user allocations and network-binding tests passed. No production wallet created.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
