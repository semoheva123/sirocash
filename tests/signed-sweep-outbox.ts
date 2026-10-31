import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {Transaction} from 'ethers';
import {prepareSignedSweep} from '../lib/signed-sweep-outbox';
import {deriveBep20DepositAddress} from '../lib/evm-deposit-addresses';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
  for(const migration of ['20261031030000_deposit_addresses','20261031060000_bep20_deposit_addresses','20261031070000_signed_sweep_outbox'])await pg.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  const account=HDKey.fromMasterSeed(new Uint8Array(32).fill(11)).derive("m/44'/60'/0'");
  const owner='00000000-0000-0000-0000-000000000001',vault='00000000-0000-0000-0000-000000000002',addressId='00000000-0000-0000-0000-000000000003';
  const address=deriveBep20DepositAddress(account.publicExtendedKey,0).address;
  await pg.query('INSERT INTO "User" VALUES ($1)',[owner]);
  await pg.query('INSERT INTO "DepositAddressVault" (id,network,"accountXpub",enabled,"originVerified") VALUES ($1,\'BEP20\',$2,true,true)',[vault,account.publicExtendedKey]);
  await pg.query('INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ($1,$2,$3,\'BEP20\',$4,0)',[addressId,owner,vault,address]);
  let keyLoads=0;const options={loadKeys:()=>{keyLoads++;return {accountXpub:account.publicExtendedKey,accountXprv:account.privateExtendedKey}}};
  const command={network:'BEP20' as const,addressId,requestKey:'sweep:test:001',maxAmountBaseUnits:100000000000000000000n,maxNetworkFeeBaseUnits:10000000000000000n,transaction:{amountBaseUnits:10000000000000000000n,nonce:0,gasLimit:100000n,gasPrice:1000000000n}};
  const signed=await prepareSignedSweep(db,command,options);assert.equal(signed.state,'SIGNED');
  assert.deepEqual(await prepareSignedSweep(db,command,options),signed);assert.equal(keyLoads,1);
  const {rows:[saved]}=await pg.query<{signedPayload:string}>('SELECT "signedPayload" FROM "SignedSweepOutbox" WHERE id=$1',[signed.id]);
  assert.equal(Transaction.from(saved.signedPayload).hash,signed.txId);
  assert.equal(Transaction.from(saved.signedPayload).from,address);
  assert.ok(!JSON.stringify(signed).includes(saved.signedPayload));
  await assert.rejects(()=>prepareSignedSweep(db,{...command,transaction:{...command.transaction,amountBaseUnits:1n}},options),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(()=>prepareSignedSweep(db,{...command,requestKey:'sweep:test:002'},options),/RECONCILIATION_REQUIRED/);
  assert.equal(Number((await pg.query<{n:number}>('SELECT count(*) AS n FROM "SignedSweepOutbox"')).rows[0].n),1);
  console.log('Signed sweep outbox: persistent exact bytes/TXID, DB-owned source, retry without re-signing, conflicting/new pending request rejection passed. No broadcast.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
