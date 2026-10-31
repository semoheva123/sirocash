import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import type {WalletDb} from '../lib/wallet-engine';
import {stageBep20Deposit} from '../lib/deposit-inbox';
import {bep20UsdtContract,verifyBep20UsdtDeposit,type Bep20ReceiptEvidence} from '../lib/bep20-deposit-verification';
const to='0x0000000000000000000000000000000000000002';
const log={address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(63)+'1','0x'+'0'.repeat(63)+'2'],data:'0x'+(20n*10n**18n).toString(16).padStart(64,'0'),logIndex:17,removed:false};
const receipt:Bep20ReceiptEvidence={chainId:56,txId:'0x'+'ab'.repeat(32),blockNumber:100,blockHash:'0x'+'cd'.repeat(32),execution:'SUCCESS',logs:[log]};
const input={receipt,block:{chainId:56,height:100,hash:receipt.blockHash,headHeight:120,finalizedHeight:115},logIndex:17,assignedAddress:to,maxAmountBaseUnits:100n*10n**18n,minimumConfirmations:15};
const verified=verifyBep20UsdtDeposit(input);
assert.equal(verified.decimals,18);assert.equal(verified.amountBaseUnits,(20n*10n**18n).toString());
assert.equal(verified.eventKey,`bsc:56:usdt:${'ab'.repeat(32)}:17`);
for(const change of [{chainId:1},{execution:'FAILED' as const},{blockNumber:99},{blockHash:'0x'+'ef'.repeat(32)},{txId:'ab'.repeat(32)},{logs:[log,log]}])assert.throws(()=>verifyBep20UsdtDeposit({...input,receipt:{...receipt,...change}}));
for(const change of [{chainId:1},{finalizedHeight:99},{finalizedHeight:121},{headHeight:NaN},{hash:'0x'+'ef'.repeat(32)}])assert.throws(()=>verifyBep20UsdtDeposit({...input,block:{...input.block,...change}}));
for(const change of [{removed:true},{logIndex:0},{address:to},{data:'0x'+'0'.repeat(64)},{data:'0x12'},{topics:[...log.topics,'0x'+'0'.repeat(64)]},{topics:['0x'+'0'.repeat(64),...log.topics.slice(1)]},{topics:[log.topics[0],'0x'+'f'.repeat(64),log.topics[2]]},{topics:[log.topics[0],log.topics[2],log.topics[2]]}])assert.throws(()=>verifyBep20UsdtDeposit({...input,receipt:{...receipt,logs:[{...log,...change}]}}));
for(const change of [{minimumConfirmations:22},{minimumConfirmations:0},{minimumConfirmations:1.5},{logIndex:0},{maxAmountBaseUnits:1n},{assignedAddress:bep20UsdtContract}])assert.throws(()=>verifyBep20UsdtDeposit({...input,...change}));
assert.equal(verifyBep20UsdtDeposit({...input,minimumConfirmations:21}).eventKey,verified.eventKey);
// RPC hex case must not create a different deposit fingerprint.
assert.deepEqual(verifyBep20UsdtDeposit({...input,receipt:{...receipt,txId:'0x'+'AB'.repeat(32),blockHash:'0x'+'CD'.repeat(32)}}),verified);
async function persistence(){
 const pg=new PGlite();
 try{
  await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
  for(const name of ['20261031030000_deposit_addresses','20261031040000_deposit_inbox','20261031060000_bep20_deposit_addresses','20261031080000_bep20_deposit_inbox'])await pg.exec(await readFile('prisma/migrations/'+name+'/migration.sql','utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  await assert.rejects(()=>stageBep20Deposit(db,input),/UNASSIGNED_DEPOSIT_ADDRESS/);
  await pg.exec(`INSERT INTO "User" VALUES ('00000000-0000-0000-0000-000000000001');
   INSERT INTO "DepositAddressVault" (id,network,"accountXpub") VALUES ('00000000-0000-0000-0000-000000000002','BEP20','xpub-fixture-only');`);
  await pg.query(`INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','BEP20',$1,0)`,[to]);
  const staged=await stageBep20Deposit(db,input);
  assert.equal(staged.state,'AWAITING_VALUATION');
  assert.deepEqual(await stageBep20Deposit(db,input),staged);
  await assert.rejects(()=>stageBep20Deposit(db,{...input,receipt:{...receipt,logs:[{...log,data:'0x'+(21n*10n**18n).toString(16).padStart(64,'0')}]}}),/DEPOSIT_EVIDENCE_CONFLICT/);
  await assert.rejects(()=>stageBep20Deposit(db,{...input,receipt:{...receipt,blockHash:'0x'+'ef'.repeat(32)},block:{...input.block,hash:'0x'+'ef'.repeat(32)}}),/DEPOSIT_EVIDENCE_CONFLICT/);
  assert.equal(Number((await pg.query<{n:number}>('SELECT count(*) AS n FROM "ChainDepositInbox"')).rows[0].n),1);
  await assert.rejects(()=>pg.exec(`UPDATE "ChainDepositInbox" SET network='TRC20'`));
  console.log('BEP20 synthetic evidence and durable inbox passed: chain 56, canonical/finalized evidence, confirmations, global log indices, token, recipient, bounds, replay/conflicts and network ownership. No USD credit or RPC call.');
 }finally{await pg.close()}
}
persistence().catch(error=>{console.error(error);process.exitCode=1});
