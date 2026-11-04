import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {stageTronDeposit} from '../lib/deposit-inbox';
import type {WalletDb} from '../lib/wallet-engine';
import {base58} from '@scure/base';
import {verifyTronUsdtDeposit,tronUsdtContract,type TronReceiptEvidence} from '../lib/tron-deposit-verification';
const to='T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const contract=Buffer.from(base58.decode(tronUsdtContract).slice(1,21)).toString('hex');
const receipt:TronReceiptEvidence={txId:'ab'.repeat(32),blockNumber:100,blockHash:'cd'.repeat(32),execution:'SUCCESS',logs:[{
 address:contract,topics:[topic,'0'.repeat(63)+'1','0'.repeat(64)],data:(20000000n).toString(16).padStart(64,'0'),
}]};
const input={receipt,block:{height:100,hash:receipt.blockHash,solidHeight:105},logIndex:0,assignedAddress:to,maxAmountBaseUnits:1000000000n};
const verified=verifyTronUsdtDeposit(input);
assert.equal(verified.amountBaseUnits,'20000000');assert.equal(verified.eventKey,`tron:mainnet:usdt:${receipt.txId}:0`);
assert.deepEqual(verifyTronUsdtDeposit(input),verified);
assert.throws(()=>verifyTronUsdtDeposit({...input,block:{...input.block,solidHeight:99}}));
assert.throws(()=>verifyTronUsdtDeposit({...input,block:{...input.block,hash:'ef'.repeat(32)}}));
assert.throws(()=>verifyTronUsdtDeposit({...input,receipt:{...receipt,execution:'FAILED'}}));
assert.throws(()=>verifyTronUsdtDeposit({...input,logIndex:1}));
assert.throws(()=>verifyTronUsdtDeposit({...input,maxAmountBaseUnits:100n}));
assert.throws(()=>verifyTronUsdtDeposit({...input,assignedAddress:tronUsdtContract}));
for(const change of [
 {address:'11'.repeat(20)}, {topics:[topic,'0'.repeat(64),'0'.repeat(64)]},
 {topics:['00'.repeat(32),...receipt.logs[0].topics.slice(1)]},
 {topics:[topic,'f'.repeat(64),'0'.repeat(64)]},
 {data:'0'.repeat(64)},{data:'1e2'},
]) assert.throws(()=>verifyTronUsdtDeposit({...input,receipt:{...receipt,logs:[{...receipt.logs[0],...change}]}}));
const second=verifyTronUsdtDeposit({...input,receipt:{...receipt,logs:[receipt.logs[0],receipt.logs[0]]},logIndex:1});
assert.notEqual(second.eventKey,verified.eventKey);
console.log('TRON deposit evidence tests passed: canonical finalized block, execution, exact token/event/recipient, amount limits and event identities. Synthetic evidence only.');

async function persistence(){
 const pg=new PGlite();
 try{
  await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
  for(const name of ['20261031030000_deposit_addresses','20261031040000_deposit_inbox','20261031060000_bep20_deposit_addresses','20261031080000_bep20_deposit_inbox','20261104210000_deposit_sender'])await pg.exec(await readFile('prisma/migrations/'+name+'/migration.sql','utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  await assert.rejects(()=>stageTronDeposit(db,input),/UNASSIGNED_DEPOSIT_ADDRESS/);
  await pg.exec(`INSERT INTO "User" VALUES ('00000000-0000-0000-0000-000000000001');
   INSERT INTO "DepositAddressVault" (id,network,"accountXpub") VALUES ('00000000-0000-0000-0000-000000000002','TRC20','xpub-test-only');`);
  await pg.query(`INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','TRC20',$1,0)`,[to]);
  const staged=await stageTronDeposit(db,input);
  assert.equal(staged.state,'AWAITING_VALUATION');
  assert.equal((await pg.query<{sender:string}>('SELECT sender FROM "ChainDepositInbox"')).rows[0].sender,verified.from);
  await assert.rejects(()=>pg.query('UPDATE "ChainDepositInbox" SET sender=NULL'),/DEPOSIT_SENDER_IMMUTABLE/);
  await assert.rejects(()=>pg.query('UPDATE "ChainDepositInbox" SET sender=$1',['forged']),/DEPOSIT_SENDER_IMMUTABLE/);
  assert.equal(staged.ownerId,'00000000-0000-0000-0000-000000000001');
  assert.deepEqual(await stageTronDeposit(db,input),staged);
  await assert.rejects(()=>stageTronDeposit(db,{...input,receipt:{...receipt,logs:[{...receipt.logs[0],data:(21000000n).toString(16).padStart(64,'0')}]}}),/DEPOSIT_EVIDENCE_CONFLICT/);
  await assert.rejects(()=>stageTronDeposit(db,{...input,receipt:{...receipt,blockHash:'ef'.repeat(32)},block:{...input.block,hash:'ef'.repeat(32)}}),/DEPOSIT_EVIDENCE_CONFLICT/);
  assert.equal(Number((await pg.query<{n:number}>('SELECT count(*) AS n FROM "ChainDepositInbox"')).rows[0].n),1);
  console.log('Durable deposit inbox: assigned ownership, idempotency, changed-evidence conflict and rollback passed. No balance credited.');
 }finally{await pg.close()}
}
persistence().catch(error=>{console.error(error);process.exitCode=1});
