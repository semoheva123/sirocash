import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HDKey } from '@scure/bip32';
import { PGlite } from '@electric-sql/pglite';
import { deriveTronDepositAddress, validTronAddress } from '../lib/tron-addresses';
import { allocateTronDepositAddress } from '../lib/deposit-address-allocation';
import type { WalletDb } from '../lib/wallet-engine';
// PUBLIC TEST FIXTURE ONLY. Never use this deterministic seed for real funds.
const root=HDKey.fromMasterSeed(new Uint8Array(32).fill(1));
const account=root.derive("m/44'/195'/0'");
const xpub=account.publicExtendedKey;
const a=deriveTronDepositAddress(xpub,0),b=deriveTronDepositAddress(xpub,1);
assert.notEqual(a.address,b.address);assert.ok(validTronAddress(a.address));
assert.equal(deriveTronDepositAddress(xpub,0).address,a.address);
assert.equal(a.relativePath,'0/0');
assert.equal(validTronAddress(a.address.slice(0,-1)+(a.address.endsWith('1')?'2':'1')),false);
assert.equal(validTronAddress('0x1234'),false);
assert.equal(validTronAddress('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'),true);
for(const index of [-1,0.5,2147483648,NaN])assert.throws(()=>deriveTronDepositAddress(xpub,index));
for(const input of [account.privateExtendedKey,root.publicExtendedKey,'test recovery words',xpub.slice(0,-1)+'0'])assert.throws(()=>deriveTronDepositAddress(input,0));
async function main(){
 const pg=new PGlite();
 try {
  await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
  await pg.exec(await readFile('prisma/migrations/20261031030000_deposit_addresses/migration.sql','utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  const vault='00000000-0000-0000-0000-000000000001',alice='00000000-0000-0000-0000-000000000002',bob='00000000-0000-0000-0000-000000000003';
  await pg.query('INSERT INTO "User" VALUES ($1),($2)',[alice,bob]);
  await pg.query('INSERT INTO "DepositAddressVault" (id,network,"accountXpub") VALUES ($1,\'TRC20\',$2)',[vault,xpub]);
  await assert.rejects(()=>allocateTronDepositAddress(db,alice,vault),/NOT_READY/);
  await pg.query('UPDATE "DepositAddressVault" SET enabled=true,"originVerified"=true WHERE id=$1',[vault]);
  const allocated=await allocateTronDepositAddress(db,alice,vault);
  assert.equal(allocated.address,a.address);
  assert.deepEqual(await allocateTronDepositAddress(db,alice,vault),allocated);
  assert.equal((await allocateTronDepositAddress(db,bob,vault)).address,b.address);
  assert.equal(Number((await pg.query<{nextIndex:string}>('SELECT "nextIndex" FROM "DepositAddressVault"')).rows[0].nextIndex),2);
  assert.deepEqual(Object.keys(allocated).sort(),['address','network']);
  console.log('Watch-only TRON derivation, checksum, private-key rejection, gated allocation and retry tests passed. No live wallet provisioned. PGlite does not prove independent-connection concurrency.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
