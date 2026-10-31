import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {Transaction,Interface} from 'ethers';
import {confirmBep20Sweep} from '../lib/sweep-confirmation';
import type {Bep20ReceiptEvidence} from '../lib/bep20-deposit-verification';
import {prepareSignedSweep} from '../lib/signed-sweep-outbox';
import {deriveBep20DepositAddress} from '../lib/evm-deposit-addresses';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
  for(const migration of ['20261031030000_deposit_addresses','20261031060000_bep20_deposit_addresses','20261031070000_signed_sweep_outbox','20261031090000_sweep_confirmation'])await pg.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8'));
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
  const parsed=Transaction.from(saved.signedPayload);
  const decoded=new Interface(['function transfer(address to,uint256 amount) returns (bool)']).decodeFunctionData('transfer',parsed.data);
  const topicAddress=(value:string)=>'0x'+value.slice(2).toLowerCase().padStart(64,'0');
  const receipt:Bep20ReceiptEvidence={chainId:56,txId:signed.txId,blockNumber:100,blockHash:'0x'+'cd'.repeat(32),execution:'SUCCESS',logs:[{
   address:parsed.to!,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topicAddress(address),topicAddress(decoded[0])],
   data:'0x'+BigInt(decoded[1]).toString(16).padStart(64,'0'),logIndex:7,removed:false,
  }]};
  const evidence={receipt,block:{chainId:56,height:100,hash:receipt.blockHash,headHeight:120,finalizedHeight:115},logIndex:7,assignedAddress:String(decoded[0]),maxAmountBaseUnits:command.maxAmountBaseUnits,minimumConfirmations:15};
  const confirm=(e=evidence)=>confirmBep20Sweep(db,{sweepId:signed.id,evidence:e});
  await assert.rejects(()=>confirm({...evidence,receipt:{...receipt,txId:'0x'+'ef'.repeat(32)}}),/IDENTITY_MISMATCH/);
  await assert.rejects(()=>confirm({...evidence,receipt:{...receipt,execution:'FAILED'}}),/TRANSACTION_FAILED/);
  await assert.rejects(()=>confirm({...evidence,receipt:{...receipt,logs:[{...receipt.logs[0],data:'0x'+'0'.repeat(63)+'1'}]}}),/EXECUTION_MISMATCH/);
  assert.equal((await pg.query<{state:string}>('SELECT state FROM "SignedSweepOutbox" WHERE id=$1',[signed.id])).rows[0].state,'SIGNED');
  await pg.query('UPDATE "SignedSweepOutbox" SET state=\'BROADCAST_UNKNOWN\' WHERE id=$1',[signed.id]);
  const confirmed=await confirm();assert.equal(confirmed.state,'CONFIRMED');
  assert.deepEqual(await confirm(),confirmed);
  // Newer heads are not part of the immutable execution fingerprint.
  assert.deepEqual(await confirm({...evidence,block:{...evidence.block,headHeight:125}}),confirmed);
  await assert.rejects(()=>confirm({...evidence,receipt:{...receipt,blockHash:'0x'+'ef'.repeat(32)},block:{...evidence.block,hash:'0x'+'ef'.repeat(32)}}),/CONFIRMATION_CONFLICT/);
  assert.equal(Number((await pg.query<{n:number}>('SELECT count(*) AS n FROM "SweepConfirmation"')).rows[0].n),1);
  assert.equal(keyLoads,1);
  // Only successful final confirmation releases the source; signing uses a fresh nonce.
  const next=await prepareSignedSweep(db,{...command,requestKey:'sweep:test:002',transaction:{...command.transaction,nonce:1}},options);
  assert.equal(next.state,'SIGNED');assert.equal(keyLoads,2);
  console.log('Sweep confirmation: signed identity/amount/recipient binding, unknown-to-confirmed recovery, atomic evidence audit, retry, conflicts and next-nonce source release passed. No broadcast.');
  console.log('Signed sweep outbox: persistent exact bytes/TXID, DB-owned source, retry without re-signing, conflicting/new pending request rejection passed. No broadcast.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
