import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {Transaction,Interface} from 'ethers';
import {createFinancialExecution} from '../lib/financial-execution';
import {authorizeSweepDispatch,dispatchSavedSweep} from '../lib/sweep-dispatch';
import {processSweepObservation} from '../lib/sweep-network-observer';
import {confirmBep20Sweep,confirmTronSweep} from '../lib/sweep-confirmation';
import type {Bep20ReceiptEvidence} from '../lib/bep20-deposit-verification';
import {prepareSignedSweep} from '../lib/signed-sweep-outbox';
import {TronWeb} from 'tronweb';
import {base58} from '@scure/base';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
import {tronUsdtContract,type TronReceiptEvidence} from '../lib/tron-deposit-verification';
import {treasuryDestination} from '../lib/treasury-addresses';
import {deriveBep20DepositAddress} from '../lib/evm-deposit-addresses';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
  for(const migration of ['20261031030000_deposit_addresses','20261031060000_bep20_deposit_addresses','20261031070000_signed_sweep_outbox','20261031090000_sweep_confirmation','20261031210000_sweep_dispatch_worker'])await pg.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8'));
  await pg.exec(`CREATE TABLE "PayoutExpensePolicy"(network TEXT PRIMARY KEY,enabled BOOLEAN,"perPayoutCap" NUMERIC,"dailyCap" NUMERIC); CREATE TABLE "PayoutExpenseReservation"(network TEXT,"amountBaseUnits" NUMERIC,state TEXT,"settledAt" TIMESTAMPTZ); INSERT INTO "PayoutExpensePolicy" VALUES('BEP20',false,100000000000000,200000000000000),('TRC20',true,5000000,10000000);`);
  await pg.exec('CREATE TABLE "NativeGasOutbox"(expense NUMERIC,state TEXT,"confirmedAt" TIMESTAMPTZ)');
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
  const evidenceNow=()=>({observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+25000).toISOString()});
  const resource={network:'BEP20' as const,txId:signed.txId,sender:address,...evidenceNow(),tokenBalance:100n*10n**18n,nativeBalance:10n**18n,resourceCost:0n,pendingNonce:0,estimatedGas:70000n};
  await assert.rejects(()=>authorizeSweepDispatch(db,signed.id,resource),/POLICY/);
  await pg.exec('UPDATE "PayoutExpensePolicy" SET enabled=true');
  await assert.rejects(()=>authorizeSweepDispatch(db,signed.id,{...resource,pendingNonce:1}),/NONCE_OR_GAS/);
  await pg.exec(`INSERT INTO "PayoutExpenseReservation" VALUES('BEP20',200000000000000,'HELD',NULL)`);
  await assert.rejects(()=>authorizeSweepDispatch(db,signed.id,resource),/DAILY_EXPENSE/);
  await pg.exec('DELETE FROM "PayoutExpenseReservation"');
  let observedResources=0;const execution=createFinancialExecution(db,{purchaseEnabled:false,resources:async()=>{observedResources++;return resource}});
  const queued={kind:'SWEEP' as const,id:signed.id,createdAt:new Date().toISOString()};
  assert.equal((await execution.authorize(queued,new AbortController().signal)).state,'RESERVED');
  assert.equal((await execution.authorize(queued,new AbortController().signal)).state,'EXISTING');assert.equal(observedResources,1);
  assert.equal((await authorizeSweepDispatch(db,signed.id,resource)).state,'ALREADY_RESERVED');
  let sends=0;const send=async(input:{signedPayload:string})=>{
   sends++;assert.equal(input.signedPayload,saved.signedPayload);
   assert.ok((await pg.query<{claimId:string}>('SELECT "claimId" FROM "SweepDispatchAuthorization" WHERE "sweepId"=$1',[signed.id])).rows[0].claimId);
   throw new Error('lost response');
  };
  await assert.rejects(()=>dispatchSavedSweep(db,signed.id,{send}),/DISABLED/);
  assert.equal((await dispatchSavedSweep(db,signed.id,{enabled:true,send})).state,'UNKNOWN');
  assert.equal((await dispatchSavedSweep(db,signed.id,{enabled:true,send})).state,'UNKNOWN');assert.equal(sends,1);
  await assert.rejects(()=>pg.query('UPDATE "SweepDispatchAuthorization" SET expense=1 WHERE "sweepId"=$1',[signed.id]));
  await assert.rejects(()=>pg.query('UPDATE "SweepDispatchAuthorization" SET state=\'SETTLED\',"settledAt"=now() WHERE "sweepId"=$1',[signed.id]),/FINAL_EVIDENCE/);
  await pg.query('UPDATE "SignedSweepOutbox" SET state=\'BROADCAST_UNKNOWN\' WHERE id=$1',[signed.id]);
  const networkOptions={enabled:true,minimumBep20Confirmations:15,tronGenesisId:'0'.repeat(16)+'aa'.repeat(24),tron:async()=>{throw new Error('unused TRON RPC')},bep20:async(method:string,params:unknown[])=>{
   if(method==='eth_chainId')return '0x38';if(method==='eth_blockNumber')return '0x78';
   if(method==='eth_getTransactionReceipt')return {transactionHash:signed.txId,blockHash:receipt.blockHash,blockNumber:'0x64',transactionIndex:'0x0',status:'0x1',logs:receipt.logs.map(l=>({...l,transactionHash:signed.txId,blockHash:receipt.blockHash,blockNumber:'0x64',transactionIndex:'0x0',logIndex:'0x7'}))};
   return params[0]==='finalized'?{hash:receipt.blockHash,number:'0x73'}:{hash:receipt.blockHash,number:'0x64',transactions:[signed.txId]};
  }};
  await assert.rejects(()=>processSweepObservation(db,signed.id,{...networkOptions,enabled:false}),/DISABLED/);
  assert.equal((await processSweepObservation(db,signed.id,{...networkOptions,bep20:async()=>null})).state,'HELD');
  assert.equal((await processSweepObservation(db,signed.id,networkOptions)).state,'CONFIRMED');
  assert.equal((await processSweepObservation(db,signed.id,networkOptions)).state,'CONFIRMED');
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
  const tronAccount=HDKey.fromMasterSeed(new Uint8Array(32).fill(12)).derive("m/44'/195'/0'");
  const tronVault='00000000-0000-0000-0000-000000000004',tronId='00000000-0000-0000-0000-000000000005';
  const tronAddress=deriveTronDepositAddress(tronAccount.publicExtendedKey,0).address;
  await pg.query('INSERT INTO "DepositAddressVault" (id,network,"accountXpub",enabled,"originVerified") VALUES ($1,\'TRC20\',$2,true,true)',[tronVault,tronAccount.publicExtendedKey]);
  await pg.query('INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ($1,$2,$3,\'TRC20\',$4,0)',[tronId,owner,tronVault,tronAddress]);
  const now=Date.now();
  const tronOptions={now,loadKeys:()=>({accountXpub:tronAccount.publicExtendedKey,accountXprv:tronAccount.privateExtendedKey})};
  const tronCommand={network:'TRC20' as const,addressId:tronId,requestKey:'tron:sweep:001',maxAmountBaseUnits:1000000000n,maxNetworkFeeBaseUnits:5000000n,transaction:{amountBaseUnits:20000000n,refBlockBytes:'1234',refBlockHash:'ab'.repeat(8),timestamp:now,expiration:now+60000,feeLimitSun:4000000}};
  const tronSigned=await prepareSignedSweep(db,tronCommand,tronOptions);
  const destination=treasuryDestination('TRC20','operating');
  const tronTopic=(v:string)=>TronWeb.address.toHex(v).slice(2).toLowerCase().padStart(64,'0');
  const tronReceipt:TronReceiptEvidence={txId:tronSigned.txId,blockNumber:100,blockHash:'0000000000000064'+'cd'.repeat(24),execution:'SUCCESS',logs:[{
   address:Buffer.from(base58.decode(tronUsdtContract).slice(1,21)).toString('hex'),
   topics:['ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',tronTopic(tronAddress),tronTopic(destination)],data:(20000000n).toString(16).padStart(64,'0'),
  }]};
  const tronEvidence={receipt:tronReceipt,block:{height:100,hash:tronReceipt.blockHash,solidHeight:105},logIndex:0,assignedAddress:destination,maxAmountBaseUnits:1000000000n};
  const confirmTron=(e=tronEvidence)=>confirmTronSweep(db,{sweepId:tronSigned.id,evidence:e});
  await assert.rejects(()=>confirmTron({...tronEvidence,receipt:{...tronReceipt,execution:'FAILED'}}),/TRANSACTION_FAILED/);
  await assert.rejects(()=>confirmTron({...tronEvidence,block:{...tronEvidence.block,solidHeight:99}}),/NOT_CANONICAL_AND_FINAL/);
  await assert.rejects(()=>confirmTron({...tronEvidence,receipt:{...tronReceipt,txId:'ef'.repeat(32)}}),/IDENTITY_MISMATCH/);
  await assert.rejects(()=>confirmTron({...tronEvidence,receipt:{...tronReceipt,logs:[{...tronReceipt.logs[0],data:(21000000n).toString(16).padStart(64,'0')}]}}),/EXECUTION_MISMATCH/);
  const tronResource={network:'TRC20' as const,txId:tronSigned.txId,sender:tronAddress,...evidenceNow(),tokenBalance:1000000000n,nativeBalance:0n,resourceCost:0n,accountActive:true,requiredEnergy:65000,availableEnergy:65000,requiredBandwidth:400,availableBandwidth:400};
  await assert.rejects(()=>authorizeSweepDispatch(db,tronSigned.id,{...tronResource,availableEnergy:1}),/UNDELIVERED/);
  assert.equal((await authorizeSweepDispatch(db,tronSigned.id,tronResource)).state,'RESERVED');
  assert.equal((await dispatchSavedSweep(db,tronSigned.id,{enabled:true,send:async input=>({txId:input.txId})})).state,'ACKNOWLEDGED');
  assert.equal((await dispatchSavedSweep(db,tronSigned.id,{enabled:true,send:async()=>{throw new Error('must not resend')}})).state,'ACKNOWLEDGED');
  const originalPayload=(await pg.query<{signedPayload:string}>('SELECT "signedPayload" FROM "SignedSweepOutbox" WHERE id=$1',[tronSigned.id])).rows[0].signedPayload;
  const corrupted=JSON.parse(originalPayload);corrupted.signature[0]='00'.repeat(65);
  await pg.query('UPDATE "SignedSweepOutbox" SET "signedPayload"=$2 WHERE id=$1',[tronSigned.id,JSON.stringify(corrupted)]);
  await assert.rejects(()=>confirmTron());
  await pg.query('UPDATE "SignedSweepOutbox" SET "signedPayload"=$2,state=\'BROADCAST_UNKNOWN\' WHERE id=$1',[tronSigned.id,originalPayload]);
  const tronRead=async(path:string,body:Record<string,unknown>)=>{
   if(path.endsWith('gettransactioninfobyid'))return {id:tronSigned.txId,blockNumber:100,receipt:{result:'SUCCESS'},log:tronReceipt.logs};
   if(path.endsWith('getnowblock'))return {blockID:'0000000000000069'+'cd'.repeat(24),block_header:{raw_data:{number:105}}};
   if(body.num===0)return {blockID:networkOptions.tronGenesisId,block_header:{raw_data:{number:0}}};
   return {blockID:tronReceipt.blockHash,block_header:{raw_data:{number:100}},transactions:[{txID:tronSigned.txId,ret:[{contractRet:'SUCCESS'}]}]};
  };
  assert.equal((await processSweepObservation(db,tronSigned.id,{...networkOptions,tron:tronRead})).state,'CONFIRMED');
  const tronConfirmed=await confirmTron();assert.equal(tronConfirmed.state,'CONFIRMED');
  assert.deepEqual(await confirmTron(),tronConfirmed);
  await assert.rejects(()=>confirmTron({...tronEvidence,receipt:{...tronReceipt,blockHash:'ef'.repeat(32)},block:{...tronEvidence.block,hash:'ef'.repeat(32)}}),/CONFIRMATION_CONFLICT/);
  assert.equal(Number((await pg.query<{n:number}>('SELECT count(*) AS n FROM "SweepConfirmation"')).rows[0].n),2);
  console.log('TRON confirmation: recovered signature, exact signed transfer, finalized success, pending safety, corrupt signature rejection and immutable retry evidence passed. No broadcast.');
  console.log('Sweep confirmation: signed identity/amount/recipient binding, unknown-to-confirmed recovery, atomic evidence audit, retry, conflicts and next-nonce source release passed. No broadcast.');
  console.log('Signed sweep outbox: persistent exact bytes/TXID, DB-owned source, retry without re-signing, conflicting/new pending request rejection passed. No broadcast.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
