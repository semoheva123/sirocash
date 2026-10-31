import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {Wallet,Transaction,Interface} from 'ethers';
import {TronWeb,utils} from 'tronweb';
import {prepareTronResourceIntent} from '../lib/tron-resource-intent';
import {authorizePayoutDispatch} from '../lib/payout-resource-authorization';
import {createChainBroadcaster} from '../lib/chain-broadcast';
import {processPayoutNetwork} from '../lib/payout-network-worker';
import {confirmPayout} from '../lib/payout-confirmation';
import {bep20UsdtContract,type Bep20ReceiptEvidence} from '../lib/bep20-deposit-verification';
import {tronUsdtContract,type TronReceiptEvidence} from '../lib/tron-deposit-verification';
import {dispatchSavedPayout} from '../lib/payout-dispatch';
import {prepareSignedWithdrawal} from '../lib/signed-withdrawal-outbox';
import {createUsdtWithdrawalQuote,reserveQuotedUsdtWithdrawal,settleQuotedUsdtWithdrawal} from '../lib/quoted-usdt-withdrawal';
import {creditConfirmedDeposit,walletBalances,type WalletDb} from '../lib/wallet-engine';
const token=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  const owner='00000000-0000-0000-0000-000000000001',pool='00000000-0000-0000-0000-000000000002',fees='00000000-0000-0000-0000-000000000003';
  await pg.query('INSERT INTO "User" (id,email,"emailVerifiedAt") VALUES ($1,\'outbox@example.test\',now())',[owner]);
  await pg.query('INSERT INTO "LedgerAccount" (id,"accountType") VALUES ($1,\'MASTER_POOL\'),($2,\'MASTER_POOL\')',[pool,fees]);
  await creditConfirmedDeposit(db,{ownerId:owner,requestKey:'fixture:fund:001',amount:'200',providerReference:'fixture:funding:event1',settlementAccountId:pool});
  await pg.query('INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt") VALUES (\'fixture-session\',$1,now()+interval \'1 day\')',[owner]);
  await pg.query('INSERT INTO "DurablePasskeyCredential" (id,"userId","rpId","publicKey",counter) VALUES (\'fixture-key\',$1,\'wallet.example.test\',\'AQID\',0)',[owner]);
  const context={userId:owner,sessionHash:'fixture-session',rpID:'wallet.example.test',origin:'https://wallet.example.test'};
  const approvalToken='ab'.repeat(32),approvalHash=createHash('sha256').update(approvalToken).digest('hex');
  // Public deterministic private-key fixtures only. NEVER FUND. Not platform operating keys.
  const evmKey='01'.padStart(64,'0'),tronKey='02'.padStart(64,'0');
  const evmSender=new Wallet('0x'+evmKey).address,tronSender=TronWeb.address.fromPrivateKey(tronKey) as string;
  let loads=0;const loadKeys=(network:'TRC20'|'BEP20')=>{loads++;return {key:network==='BEP20'?evmKey:tronKey,policy:{expectedSender:network==='BEP20'?evmSender:tronSender,maxAmountBaseUnits:100n*10n**18n,maxNetworkFeeBaseUnits:10000000000000000n}}};
  const options={loadKeys,now:1700000000000};
  const makeQuote=async(network:'TRC20'|'BEP20',requestKey:string)=>{
   const quote=await createUsdtWithdrawalQuote(db,{ownerId:owner,requestKey,network,recipient:network==='BEP20'?'0x0000000000000000000000000000000000000002':TronWeb.address.fromPrivateKey('03'.padStart(64,'0')) as string,grossTokens:'20',rateUsdMicrosPerToken:980000n,rateReference:'reviewed:fixture:rate001',expiresAt:new Date(Date.now()+90000).toISOString(),settlementAccountId:pool,feeAccountId:fees});
   return quote;
  };
  const reserve=async(quote:Awaited<ReturnType<typeof makeQuote>>)=>{
   await pg.query('INSERT INTO "DurablePaymentApproval" ("tokenHash","sessionHash","credentialId",digest,"expiresAt") VALUES ($1,\'fixture-session\',\'fixture-key\',$2,now()+interval \'1 minute\') ON CONFLICT ("tokenHash") DO UPDATE SET digest=EXCLUDED.digest,"consumedAt"=NULL',[approvalHash,quote.digest]);
   return reserveQuotedUsdtWithdrawal(db,context,{quoteId:quote.id,approvalToken});
  };
  const bep=await makeQuote('BEP20','payout:test:bep01');
  const command={quoteId:bep.id,network:'BEP20' as const,transaction:{nonce:7,gasLimit:100000n,gasPrice:1000000000n}};
  await assert.rejects(()=>prepareSignedWithdrawal(db,command,options),/NOT_RESERVED/);assert.equal(loads,0);
  const held=await reserve(bep);
  await assert.rejects(()=>prepareSignedWithdrawal(db,{...command,transaction:{...command.transaction,destination:evmSender}} as typeof command,options),/UNEXPECTED_PAYOUT_TRANSACTION_FIELD/);
  await assert.rejects(()=>prepareSignedWithdrawal(db,{...command,recipient:evmSender} as typeof command,options),/UNEXPECTED_PAYOUT_COMMAND_FIELD/);
  await assert.rejects(()=>prepareSignedWithdrawal(db,{...command,network:'TRC20'} as never,options),/TRANSACTION_FIELD/);
  const disabled=process.env.SIRO_SIGNER_ENABLED;delete process.env.SIRO_SIGNER_ENABLED;
  await assert.rejects(()=>prepareSignedWithdrawal(db,command),/LIVE_SIGNING_DISABLED/);
  if(disabled!==undefined)process.env.SIRO_SIGNER_ENABLED=disabled;
  await assert.rejects(()=>prepareSignedWithdrawal(db,command,{...options,loadKeys:n=>{const keys=loadKeys(n);return {...keys,policy:{...keys.policy,maxNetworkFeeBaseUnits:1n}}}}),/NETWORK_FEE_POLICY/);
  await assert.rejects(()=>prepareSignedWithdrawal(db,command,{...options,loadKeys:n=>{const keys=loadKeys(n);return {...keys,policy:{...keys.policy,expectedSender:'0x0000000000000000000000000000000000000002'}}}}),/OWNERSHIP_MISMATCH/);
  const broken:WalletDb={transaction:run=>db.transaction(tx=>run({query:async(sql,params)=>{if(sql.startsWith('UPDATE "WalletOperation"'))throw Error('injected after signing');return tx.query(sql,params)}}))};
  await assert.rejects(()=>prepareSignedWithdrawal(broken,command,options),/injected after signing/);
  assert.equal((await pg.query('SELECT * FROM "SignedWithdrawalOutbox"')).rows.length,0);
  assert.equal((await pg.query<{state:string}>('SELECT state FROM "WalletOperation" WHERE id=$1',[held.operation.id])).rows[0].state,'RESERVED');
  const signed=await prepareSignedWithdrawal(db,command,options),priorLoads=loads;
  assert.equal(signed.state,'SIGNED');assert.deepEqual(await prepareSignedWithdrawal(db,command,options),signed);assert.equal(loads,priorLoads);
  const {rows:[saved]}=await pg.query<{signedPayload:string;amountBaseUnits:string}>('SELECT "signedPayload","amountBaseUnits" FROM "SignedWithdrawalOutbox" WHERE id=$1',[signed.id]);
  const parsed=Transaction.from(saved.signedPayload),decoded=token.decodeFunctionData('transfer',parsed.data);
  assert.equal(parsed.hash,signed.txId);assert.equal(parsed.from,evmSender);assert.equal(parsed.chainId,56n);
  assert.equal(decoded[0],bep.payload.recipient);assert.equal(decoded[1],18n*10n**18n);assert.equal(saved.amountBaseUnits,(18n*10n**18n).toString());
  assert.ok(!JSON.stringify(signed).includes(saved.signedPayload));
  await assert.rejects(()=>prepareSignedWithdrawal(db,{...command,transaction:{...command.transaction,nonce:8}},options),/IDEMPOTENCY_CONFLICT/);assert.equal(loads,priorLoads);
  await pg.query('UPDATE "SignedWithdrawalOutbox" SET state=\'BROADCAST_UNKNOWN\' WHERE id=$1',[signed.id]);
  assert.equal((await prepareSignedWithdrawal(db,command,options)).state,'BROADCAST_UNKNOWN');assert.equal(loads,priorLoads);
  await assert.rejects(()=>pg.query('UPDATE "SignedWithdrawalOutbox" SET "signedPayload"=\'poisoned\' WHERE id=$1',[signed.id]),/IMMUTABLE_SIGNED_WITHDRAWAL/);
  await assert.rejects(()=>settleQuotedUsdtWithdrawal(db,bep.id,{outcome:'rejected',providerReference:'timeout:not-definitive'}),/PAYOUT_REJECTION_PROOF_NOT_IMPLEMENTED/);
  await assert.rejects(()=>settleQuotedUsdtWithdrawal(db,bep.id,{outcome:'confirmed',providerReference:'arbitrary:provider:flag'}),/SIGNED_PAYOUT_RECONCILIATION_REQUIRED/);
  const second=await makeQuote('BEP20','payout:test:bep02');await reserve(second);
  await assert.rejects(()=>prepareSignedWithdrawal(db,{...command,quoteId:second.id,transaction:{...command.transaction,nonce:8}},options),/NETWORK_RECONCILIATION_REQUIRED/);assert.equal(loads,priorLoads);
  // Separate network can prepare independently; TRON uses six decimals, not eighteen.
  const tron=await makeQuote('TRC20','payout:test:tron01');await reserve(tron);
  const tronCommand={quoteId:tron.id,network:'TRC20' as const,transaction:{refBlockBytes:'1234',refBlockHash:'ab'.repeat(8),timestamp:options.now,expiration:options.now+60000,feeLimitSun:4000000}};
  const tronSigned=await prepareSignedWithdrawal(db,tronCommand,options);
  const {rows:[tronSaved]}=await pg.query<{signedPayload:string;amountBaseUnits:string}>('SELECT "signedPayload","amountBaseUnits" FROM "SignedWithdrawalOutbox" WHERE id=$1',[tronSigned.id]);
  const tronTx=JSON.parse(tronSaved.signedPayload);
  assert.equal(tronSaved.amountBaseUnits,'15000000');assert.ok(utils.transaction.txCheck(tronTx));
  assert.equal(utils.crypto.ecRecover(tronSigned.txId,tronTx.signature[0]).toLowerCase(),TronWeb.address.toHex(tronSender).toLowerCase());
  const data=tronTx.raw_data.contract[0].parameter.value.data;
  assert.equal(data,'a9059cbb'+TronWeb.address.toHex(tron.payload.recipient).slice(2).toLowerCase().padStart(64,'0')+(15000000n).toString(16).padStart(64,'0'));
  const tronLoads=loads;
  assert.deepEqual(await prepareSignedWithdrawal(db,tronCommand,{...options,now:options.now+999999}),tronSigned);assert.equal(loads,tronLoads);
  // An expired signature remains the SAME pending authorization, never a new transaction.
  await assert.rejects(()=>prepareSignedWithdrawal(db,{...tronCommand,transaction:{...tronCommand.transaction,timestamp:options.now+999999,expiration:options.now+1059999}},options),/IDEMPOTENCY_CONFLICT/);
  assert.equal((await walletBalances(db,owner)).held,'58.800000');
  let sends=0;
  const send=async()=>{sends++;throw Error('provider secret: disconnected')};
  await assert.rejects(()=>dispatchSavedPayout(db,tronSigned.id,{send}),/DISABLED/);
  await assert.rejects(()=>dispatchSavedPayout(db,tronSigned.id,{send,enabled:true,now:options.now}),/APPROVAL_REQUIRED/);assert.equal(sends,0);
  const approveDispatch=async(id:string,txId:string,payload:string,cap:string)=>pg.query(`INSERT INTO "PayoutDispatchApproval" ("payoutId","txId","payloadHash","authorityReference","maxNativeFeeBaseUnits","approvedAt","expiresAt") VALUES ($1,$2,$3,$4,$5,now()-interval '1 minute',now()+interval '1 minute')`,[id,txId,createHash('sha256').update(payload).digest('hex'),'fixture:resource-budget:'+id,cap]);
  await approveDispatch(tronSigned.id,tronSigned.txId,tronSaved.signedPayload,'1');
  await assert.rejects(()=>dispatchSavedPayout(db,tronSigned.id,{send,enabled:true,now:options.now}),/APPROVED_FEE_EXCEEDED/);assert.equal(sends,0);
  await pg.query('UPDATE "PayoutDispatchApproval" SET "maxNativeFeeBaseUnits"=4000000 WHERE "payoutId"=$1',[tronSigned.id]);
  const ack=await dispatchSavedPayout(db,tronSigned.id,{enabled:true,now:options.now,send:async input=>{
   sends++;assert.equal(input.signedPayload,tronSaved.signedPayload);
   // Claim must be committed before the adapter sees the authorization.
   assert.equal((await pg.query('SELECT * FROM "PayoutDispatchAttempt" WHERE "payoutId"=$1',[tronSigned.id])).rows.length,1);
   return {txId:input.txId};
  }});assert.equal(ack.state,'ACKNOWLEDGED');
  assert.equal((await dispatchSavedPayout(db,tronSigned.id,{enabled:true,send})).state,'ACKNOWLEDGED');assert.equal(sends,1);
  // Simulate a still-SIGNED BSC payout for timeout dispatch (prior UNKNOWN was a fixture).
  // Cannot reverse its immutable lifecycle; do not automatically resend an unclaimed UNKNOWN.
  // An existing UNKNOWN without a durable attempt is not automatically resent.
  await approveDispatch(signed.id,signed.txId,saved.signedPayload,'10000000000000000');
  await assert.rejects(()=>dispatchSavedPayout(db,signed.id,{enabled:true,send}),/NOT_DISPATCHABLE/);assert.equal(sends,1);
  // A terminal flag without matching final evidence must not unlock another payout or a refund.
  await assert.rejects(()=>pg.query('UPDATE "SignedWithdrawalOutbox" SET state=\'CONFIRMED\' WHERE id=$1',[signed.id]),/FINAL_EVIDENCE_REQUIRED/);
  await assert.rejects(()=>pg.query('UPDATE "SignedWithdrawalOutbox" SET state=\'REJECTED\' WHERE id=$1',[signed.id]),/REJECTION_PROOF_NOT_IMPLEMENTED/);
  const topicFor=(v:string)=>'0x'+v.slice(2).toLowerCase().padStart(64,'0');
  const initialReceipt:Bep20ReceiptEvidence={chainId:56,txId:signed.txId,blockNumber:100,blockHash:'0x'+'cd'.repeat(32),execution:'SUCCESS',logs:[{address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topicFor(evmSender),topicFor(bep.payload.recipient)],data:'0x'+(18n*10n**18n).toString(16).padStart(64,'0'),logIndex:7,removed:false}]};
  await confirmPayout(db,{payoutId:signed.id,network:'BEP20',evidence:{receipt:initialReceipt,block:{chainId:56,height:100,hash:initialReceipt.blockHash,headHeight:120,finalizedHeight:115},logIndex:7,assignedAddress:bep.payload.recipient,maxAmountBaseUnits:100n*10n**18n,minimumConfirmations:15}});
  await assert.rejects(()=>prepareSignedWithdrawal(db,{...command,quoteId:second.id,transaction:{...command.transaction,gasPrice:1000000001n}},options),/payout_sender_nonce/);
  const fresh=await prepareSignedWithdrawal(db,{...command,quoteId:second.id,transaction:{...command.transaction,nonce:8}},options);
  const payload=(await pg.query<{signedPayload:string}>('SELECT "signedPayload" FROM "SignedWithdrawalOutbox" WHERE id=$1',[fresh.id])).rows[0].signedPayload;
  const observedAt=new Date().toISOString();
  const resourceEvidence={network:'BEP20' as const,txId:fresh.txId,sender:evmSender,observerReference:'fixture:observer:budget:fresh',observedAt,expiresAt:new Date(Date.now()+20000).toISOString(),tokenBalanceBaseUnits:100n*10n**18n,nativeBalanceBaseUnits:10n**18n,resourceCostBaseUnits:0n,pendingNonce:8,estimatedGas:70000n};
  await assert.rejects(()=>authorizePayoutDispatch(db,fresh.id,resourceEvidence),/POLICY_DISABLED/);
  await assert.rejects(()=>authorizePayoutDispatch(db,fresh.id,{...resourceEvidence,tokenBalanceBaseUnits:1n}),/BALANCE_INSUFFICIENT/);
  await assert.rejects(()=>authorizePayoutDispatch(db,fresh.id,{...resourceEvidence,pendingNonce:9}),/GAS_OR_NONCE_UNAVAILABLE/);
  await assert.rejects(()=>authorizePayoutDispatch(db,fresh.id,{...resourceEvidence,observedAt:new Date(Date.now()-60000).toISOString()}),/EVIDENCE_STALE/);
  await pg.exec(`UPDATE "PayoutExpensePolicy" SET enabled=true,"perPayoutCap"=1,"dailyCap"=1 WHERE network='BEP20'`);
  await assert.rejects(()=>authorizePayoutDispatch(db,fresh.id,resourceEvidence),/EXPENSE_CAP_EXCEEDED/);
  await pg.exec(`UPDATE "PayoutExpensePolicy" SET "perPayoutCap"=100000000000000,"dailyCap"=100000000000000 WHERE network='BEP20'`);
  // Older unresolved claims carry into today's budget; never free them on a new UTC day.
  await pg.query(`INSERT INTO "PayoutExpenseReservation" ("payoutId",network,"amountBaseUnits","evidenceHash",evidence,"createdAt") VALUES ($1,'BEP20',100000000000000,repeat('ab',32),'{}',now()-interval '2 days')`,[signed.id]);
  await assert.rejects(()=>authorizePayoutDispatch(db,fresh.id,resourceEvidence),/DAILY_EXPENSE_CAP_EXCEEDED/);
  await pg.exec(`UPDATE "PayoutExpensePolicy" SET "dailyCap"=200000000000000 WHERE network='BEP20'`);
  const brokenAuthority:WalletDb={transaction:run=>db.transaction(tx=>run({query:async(sql,params)=>{if(sql.startsWith('INSERT INTO "PayoutDispatchApproval"'))throw Error('injected authority persistence failure');return tx.query(sql,params)}}))};
  await assert.rejects(()=>authorizePayoutDispatch(brokenAuthority,fresh.id,resourceEvidence),/injected authority persistence failure/);
  assert.equal((await pg.query('SELECT * FROM "PayoutExpenseReservation" WHERE "payoutId"=$1',[fresh.id])).rows.length,0);
  assert.equal((await authorizePayoutDispatch(db,fresh.id,resourceEvidence)).state,'RESERVED');
  assert.equal((await authorizePayoutDispatch(db,fresh.id,resourceEvidence)).state,'ALREADY_RESERVED');
  await assert.rejects(()=>authorizePayoutDispatch(db,fresh.id,{...resourceEvidence,nativeBalanceBaseUnits:2n*10n**18n}),/EVIDENCE_CONFLICT/);

  const liveShapeFetch=(async(_url,init)=>{
   const p=JSON.parse(String(init!.body));
   if(p.method==='eth_chainId')return new Response(JSON.stringify({jsonrpc:'2.0',id:p.id,result:'0x38'}),{headers:{'content-type':'application/json'}});
   assert.equal(p.method,'eth_sendRawTransaction');assert.equal(p.params[0],payload);
   assert.equal((await pg.query('SELECT * FROM "PayoutDispatchAttempt" WHERE "payoutId"=$1',[fresh.id])).rows.length,1);
   sends++;return new Promise(()=>{});
  }) as typeof fetch;
  const realAdapter=createChainBroadcaster({enabled:true,bep20:{endpoint:'https://bsc.example.invalid',fetch:liveShapeFetch,timeoutMs:100},tron:{endpoint:'https://tron.example.invalid',fetch:liveShapeFetch},tronGenesisId:'0'.repeat(16)+'aa'.repeat(24)});
  const timed=await dispatchSavedPayout(db,fresh.id,{enabled:true,timeoutMs:150,send:realAdapter});
  assert.equal(timed.state,'UNKNOWN');
  assert.equal((await dispatchSavedPayout(db,fresh.id,{enabled:true,send})).state,'UNKNOWN');assert.equal(sends,2);
  assert.equal((await walletBalances(db,owner)).held,'39.200000');
  assert.equal((await pg.query('SELECT * FROM "SignedWithdrawalOutbox"')).rows.length,3);
  console.log('Private payout dispatch: missing/capped approval rejection, durable pre-send claim, exact-byte ACK, bounded timeout and no-resend retry with holds preserved passed. Fixture adapters only.');
  const evmTopic=(v:string)=>'0x'+v.slice(2).toLowerCase().padStart(64,'0');
  const transfer='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const bepReceipt:Bep20ReceiptEvidence={chainId:56,txId:fresh.txId,blockNumber:100,blockHash:'0x'+'cd'.repeat(32),execution:'SUCCESS',logs:[{
   address:bep20UsdtContract,topics:['0x'+transfer,evmTopic(evmSender),evmTopic(second.payload.recipient)],data:'0x'+(18n*10n**18n).toString(16).padStart(64,'0'),logIndex:7,removed:false,
  }]};
  const bepEvidence={receipt:bepReceipt,block:{chainId:56,height:100,hash:bepReceipt.blockHash,headHeight:120,finalizedHeight:115},logIndex:7,assignedAddress:second.payload.recipient,maxAmountBaseUnits:100n*10n**18n,minimumConfirmations:15};
  const confirmation={payoutId:fresh.id,network:'BEP20' as const,evidence:bepEvidence};
  await assert.rejects(()=>confirmPayout(db,{...confirmation,evidence:{...bepEvidence,receipt:{...bepReceipt,execution:'FAILED'}}}),/TRANSACTION_FAILED/);
  await assert.rejects(()=>confirmPayout(db,{...confirmation,evidence:{...bepEvidence,block:{...bepEvidence.block,finalizedHeight:99}}}),/NOT_CANONICAL_AND_FINAL/);
  await assert.rejects(()=>confirmPayout(db,{...confirmation,evidence:{...bepEvidence,receipt:{...bepReceipt,txId:'0x'+'ef'.repeat(32)}}}),/EXECUTION_MISMATCH/);
  await assert.rejects(()=>confirmPayout(db,{...confirmation,evidence:{...bepEvidence,receipt:{...bepReceipt,logs:[{...bepReceipt.logs[0],data:'0x'+(17n*10n**18n).toString(16).padStart(64,'0')}]}}}),/EXECUTION_MISMATCH/);
  const failFinal:WalletDb={transaction:run=>db.transaction(tx=>run({query:async(sql,params)=>{if(sql.startsWith('UPDATE "WalletOperation"'))throw Error('injected final journal failure');return tx.query(sql,params)}}))};
  await assert.rejects(()=>confirmPayout(failFinal,confirmation),/injected final journal failure/);
  assert.equal((await pg.query('SELECT * FROM "PayoutConfirmation"')).rows.length,1);
  assert.equal((await walletBalances(db,owner)).held,'39.200000');
  assert.equal((await pg.query<{state:string}>('SELECT state FROM "SignedWithdrawalOutbox" WHERE id=$1',[fresh.id])).rows[0].state,'BROADCAST_UNKNOWN');
  const networkOptions={enabled:true,minimumBep20Confirmations:15,tronGenesisId:'0'.repeat(16)+'aa'.repeat(24),tron:async()=>{throw new Error('unused TRON RPC')},bep20:async(method:string,params:unknown[])=>{
   if(method==='eth_chainId')return '0x38';
   if(method==='eth_blockNumber')return '0x78';
   if(method==='eth_getTransactionReceipt')return {transactionHash:fresh.txId,blockHash:bepReceipt.blockHash,blockNumber:'0x64',transactionIndex:'0x0',status:'0x1',logs:bepReceipt.logs.map(l=>({...l,transactionHash:fresh.txId,blockHash:bepReceipt.blockHash,blockNumber:'0x64',transactionIndex:'0x0',logIndex:'0x7'}))};
   return params[0]==='finalized'?{hash:bepReceipt.blockHash,number:'0x73'}:{hash:bepReceipt.blockHash,number:'0x64',transactions:[fresh.txId]};
  }};
  await assert.rejects(()=>processPayoutNetwork(db,fresh.id,{...networkOptions,enabled:false}),/DISABLED/);
  assert.equal((await processPayoutNetwork(failFinal,fresh.id,networkOptions)).state,'HELD');
  assert.equal((await walletBalances(db,owner)).held,'39.200000');
  assert.equal((await processPayoutNetwork(db,fresh.id,{...networkOptions,bep20:async()=>null})).state,'HELD');
  assert.equal((await processPayoutNetwork(db,fresh.id,networkOptions)).state,'CONFIRMED');
  assert.equal((await processPayoutNetwork(db,fresh.id,networkOptions)).state,'CONFIRMED');
  assert.equal(sends,2); // Reconciliation did not resend the timed-out transaction.
  const final=await confirmPayout(db,confirmation);assert.equal(final.state,'COMPLETED');
  assert.equal((await pg.query<{state:string}>('SELECT state FROM "PayoutExpenseReservation" WHERE "payoutId"=$1',[fresh.id])).rows[0].state,'SETTLED');
  assert.deepEqual(await confirmPayout(db,confirmation),final);
  assert.deepEqual(await confirmPayout(db,{...confirmation,evidence:{...bepEvidence,block:{...bepEvidence.block,headHeight:130}}}),final);
  await assert.rejects(()=>confirmPayout(db,{...confirmation,evidence:{...bepEvidence,receipt:{...bepReceipt,blockHash:'0x'+'ef'.repeat(32)},block:{...bepEvidence.block,hash:'0x'+'ef'.repeat(32)}}}),/CONFIRMATION_CONFLICT/);
  const tronTopic=(v:string)=>TronWeb.address.toHex(v).slice(2).toLowerCase().padStart(64,'0');
  const tronReceipt:TronReceiptEvidence={txId:tronSigned.txId,blockNumber:100,blockHash:'0000000000000064'+'cd'.repeat(24),execution:'SUCCESS',logs:[{
   address:TronWeb.address.toHex(tronUsdtContract).slice(2).toLowerCase(),topics:[transfer,tronTopic(tronSender),tronTopic(tron.payload.recipient)],data:(15000000n).toString(16).padStart(64,'0'),
  }]};
  const tronEvidence={receipt:tronReceipt,block:{height:100,hash:tronReceipt.blockHash,solidHeight:105},logIndex:0,assignedAddress:tron.payload.recipient,maxAmountBaseUnits:100000000n};
  // Signature timestamp is deliberately old: final successful execution remains reconcilable.
  const tronRpc=async(path:string,body:Record<string,unknown>)=>{
   if(path.endsWith('gettransactioninfobyid'))return {id:tronSigned.txId,blockNumber:100,receipt:{result:'SUCCESS'},log:tronReceipt.logs};
   if(path.endsWith('getnowblock'))return {blockID:'0000000000000069'+'cd'.repeat(24),block_header:{raw_data:{number:105}}};
   if(body.num===0)return {blockID:networkOptions.tronGenesisId,block_header:{raw_data:{number:0}}};
   return {blockID:tronReceipt.blockHash,block_header:{raw_data:{number:100}},transactions:[{txID:tronSigned.txId,ret:[{contractRet:'SUCCESS'}]}]};
  };
  assert.equal((await processPayoutNetwork(db,tronSigned.id,{...networkOptions,tron:tronRpc})).state,'CONFIRMED');
  const tronFinal=await confirmPayout(db,{payoutId:tronSigned.id,network:'TRC20',evidence:tronEvidence});assert.equal(tronFinal.state,'COMPLETED');
  assert.deepEqual(await confirmPayout(db,{payoutId:tronSigned.id,network:'TRC20',evidence:tronEvidence}),tronFinal);
  assert.equal((await pg.query('SELECT * FROM "PayoutConfirmation"')).rows.length,3);
  assert.equal((await dispatchSavedPayout(db,fresh.id,{enabled:true,send})).state,'CONFIRMED');
  assert.equal((await dispatchSavedPayout(db,tronSigned.id,{enabled:true,send})).state,'CONFIRMED');
  await assert.rejects(()=>pg.exec('DELETE FROM "PayoutConfirmation"'),/IMMUTABLE_PAYOUT_CONFIRMATION/);

  assert.deepEqual(await walletBalances(db,owner),{currency:'USD',posted:'141.200000',available:'141.200000',held:'0.000000'});
  assert.equal((await pg.query<{balance:string}>('SELECT balance FROM "LedgerAccount" WHERE id=$1',[fees])).rows[0].balance,'8.820000');
  assert.equal(sends,2);
  assert.equal(Number((await pg.query<{total:string}>('SELECT sum(amount)::text AS total FROM "LedgerEntry"')).rows[0].total),0);
  const tronResourceQuote=await makeQuote('TRC20','payout:resource:tron02');await reserve(tronResourceQuote);
  const rentalCommand={kind:'PAYOUT' as const,quoteId:tronResourceQuote.id,energyAmount:65000,durationMinutes:60 as const,maxRentalSun:2000000n};
  const operatingRental=await prepareTronResourceIntent(db,rentalCommand);
  assert.equal(operatingRental.sender,'TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL');
  assert.deepEqual(await prepareTronResourceIntent(db,rentalCommand),operatingRental);
  await assert.rejects(()=>prepareTronResourceIntent(db,{...rentalCommand,energyAmount:131000}),/IDEMPOTENCY_CONFLICT/);
  const vaultId='00000000-0000-0000-0000-000000000010',addressId='00000000-0000-0000-0000-000000000011';
  await pg.query('INSERT INTO "DepositAddressVault" (id,network,"accountXpub",enabled,"originVerified") VALUES ($1,\'TRC20\',\'xpub-resource-fixture\',true,true)',[vaultId]);
  await pg.query('INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ($1,$2,$3,\'TRC20\',$4,0)',[addressId,owner,vaultId,tronSender]);
  const sweepRentalCommand={kind:'SWEEP' as const,addressId,requestKey:'sweep:resource:001',amountBaseUnits:10000000n,energyAmount:65000,durationMinutes:60 as const,maxRentalSun:2000000n};
  const depositRental=await prepareTronResourceIntent(db,sweepRentalCommand);assert.equal(depositRental.sender,tronSender);
  assert.deepEqual(await prepareTronResourceIntent(db,sweepRentalCommand),depositRental);
  await assert.rejects(()=>prepareTronResourceIntent(db,{...sweepRentalCommand,amountBaseUnits:11000000n}),/IDEMPOTENCY_CONFLICT/);
  await pg.query('UPDATE "EnergyRentalIntent" SET state=\'UNCERTAIN\' WHERE id=$1',[depositRental.id]);
  assert.equal((await prepareTronResourceIntent(db,sweepRentalCommand)).state,'UNCERTAIN');
  await assert.rejects(()=>prepareTronResourceIntent(db,{...sweepRentalCommand,requestKey:'sweep:resource:002'}),/energy_sender_pending/);
  console.log('Unified TRON energy preparation: DB-bound operating payout and customer deposit sweep senders, exact transfer identity, shared pending sender exclusion and uncertain-order idempotency passed. No paid order/delegation.');
  const liveFixtureNow=Date.now();
  const tronResourcePayout=await prepareSignedWithdrawal(db,{...tronCommand,quoteId:tronResourceQuote.id,transaction:{...tronCommand.transaction,timestamp:liveFixtureNow,expiration:liveFixtureNow+60000}},{...options,now:liveFixtureNow});
  const tronResourceEvidence={network:'TRC20' as const,txId:tronResourcePayout.txId,sender:tronSender,observerReference:'fixture:tron:resource:observer',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+20000).toISOString(),tokenBalanceBaseUnits:100000000n,nativeBalanceBaseUnits:10000000n,resourceCostBaseUnits:2000000n,accountActive:true,requiredEnergy:65000,availableEnergy:65000,requiredBandwidth:350,availableBandwidth:350};
  await assert.rejects(()=>authorizePayoutDispatch(db,tronResourcePayout.id,{...tronResourceEvidence,availableEnergy:0}),/RESOURCES_UNDELIVERED/);
  await assert.rejects(()=>authorizePayoutDispatch(db,tronResourcePayout.id,{...tronResourceEvidence,availableBandwidth:0}),/RESOURCES_UNDELIVERED/);
  await assert.rejects(()=>authorizePayoutDispatch(db,tronResourcePayout.id,{...tronResourceEvidence,accountActive:false}),/RESOURCES_UNDELIVERED/);
  await assert.rejects(()=>authorizePayoutDispatch(db,tronResourcePayout.id,{...tronResourceEvidence,accountActive:'yes' as never}),/RESOURCES_UNDELIVERED/);
  await pg.exec(`UPDATE "PayoutExpensePolicy" SET enabled=true,"perPayoutCap"=6000000,"dailyCap"=6000000 WHERE network='TRC20'`);
  assert.equal((await authorizePayoutDispatch(db,tronResourcePayout.id,tronResourceEvidence)).state,'RESERVED');
  assert.equal((await pg.query<{amountBaseUnits:string}>('SELECT "amountBaseUnits" FROM "PayoutExpenseReservation" WHERE "payoutId"=$1',[tronResourcePayout.id])).rows[0].amountBaseUnits,'6000000');
  // Approval expires AFTER claim but BEFORE network I/O: no adapter call is allowed.
  await pg.query('UPDATE "PayoutDispatchApproval" SET "expiresAt"=clock_timestamp()+interval \'100 milliseconds\' WHERE "payoutId"=$1',[tronResourcePayout.id]);
  const delayedCommit:WalletDb={transaction:async run=>{const result=await db.transaction(run);await new Promise(resolve=>setTimeout(resolve,180));return result}};
  const sendsBeforeExpiry=sends;
  assert.equal((await dispatchSavedPayout(delayedCommit,tronResourcePayout.id,{enabled:true,send})).state,'UNKNOWN');
  assert.equal(sends,sendsBeforeExpiry);
  assert.equal((await dispatchSavedPayout(db,tronResourcePayout.id,{enabled:true,send})).state,'UNKNOWN');
  assert.equal(sends,sendsBeforeExpiry);

  console.log('Payout resource budgets: fail-closed policy, fresh identity/nonce/balances, delivered TRON energy+bandwidth, conservative native cap, prior-day unresolved usage, atomic approval rollback and final expense settlement passed. Trusted observations simulated.');
  console.log('Payout finality: TRON/BSC exact execution evidence, unknown-to-confirmed recovery without resend, immutable audit, atomic journal rollback, replay/reorg conflicts and balanced net/revenue settlement passed. Synthetic receipts only.');
  await pg.exec('SET ROLE sirocash_app');for(const table of ['WithdrawalSigningGuard','SignedWithdrawalOutbox','PayoutConfirmation','PayoutExpensePolicy','PayoutExpenseReservation'])await assert.rejects(()=>pg.exec(`SELECT * FROM "${table}"`),/permission denied/);
  console.log('Signed payout outbox passed: real offline TRON/BSC signatures, exact DB quote net/recipient, durable bytes/hash plus SUBMITTED hold, rollback, no-key retries, extra-field/conflict rejection, unresolved network/nonce guards, immutable payload and unsafe settlement rejection. No broadcast; every terminal transition now requires synthetic matched final evidence.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
