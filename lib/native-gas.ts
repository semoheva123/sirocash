import 'server-only';
import {randomUUID} from 'node:crypto';
import {Transaction,Wallet,getAddress,Interface} from 'ethers';
import type {WalletDb} from './wallet-engine';
import {deriveBep20DepositAddress} from './evm-deposit-addresses';
import {vercelSignerConfiguration} from './vercel-treasury-signer';
import {financialBscRpc,rpcObject,rpcQuantity} from './financial-rpc';
import {bep20UsdtContract} from './bep20-deposit-verification';
import type {ChainHttpOptions} from './chain-http';
function valid(r:Record<string,unknown>){
 const t=Transaction.from(String(r.signedPayload));
 if(!t.signature||t.chainId!==56n||t.type!==0||t.from!==getAddress(String(r.sender))||t.to!==getAddress(String(r.recipient))||t.value!==BigInt(String(r.fundingAmount))||t.data!=='0x'||t.gasLimit!==21000n||!t.gasPrice||t.gasLimit*t.gasPrice!==BigInt(String(r.maxFee))||t.nonce!==Number(r.nonce)||t.hash!==r.txId)throw new Error('NATIVE_GAS_SIGNATURE');return t;
}
/** BNB from operating liquidity to a DB-derived deposit child ONLY. Never from reserve.
 * Parent and child gas are conservatively reserved in the shared network exposure budget.
 * UNKNOWN is observed, never resent/replaced; all signers share the operating nonce lock.
 */
export function createNativeGasWorker(db:WalletDb,options:{rpc:ChainHttpOptions;enabled:boolean;minimumConfirmations:number;loadKeys?:(network:'TRC20'|'BEP20')=>{key:string;policy:{expectedSender:string;maxAmountBaseUnits:bigint;maxNetworkFeeBaseUnits:bigint}}}){
 if(!Number.isSafeInteger(options.minimumConfirmations)||options.minimumConfirmations<15||options.minimumConfirmations>10000)throw new Error('NATIVE_GAS_CONFIRMATIONS');
 const rpc=financialBscRpc(options.rpc);
 async function prepare(input:{addressId:string;requestKey:string;tokenAmount:bigint;targetBalance:bigint;gasPrice:bigint;signal:AbortSignal}){
  if(!options.enabled)throw new Error('NATIVE_GAS_DISABLED');
  if(!/^[a-f0-9-]{36}$/i.test(input.addressId)||! /^[A-Za-z0-9:_-]{8,128}$/.test(input.requestKey)||input.tokenAmount<=0n||input.targetBalance<=0n||input.gasPrice<=0n||input.signal.aborted)throw new Error('NATIVE_GAS_INPUT');
  if(await rpc('eth_chainId',[],input.signal)!=='0x38')throw new Error('NATIVE_GAS_CHAIN');
  const config=(options.loadKeys??vercelSignerConfiguration)('BEP20'),sender=getAddress(config.policy.expectedSender);
  return db.transaction(async tx=>{
   await tx.query('SELECT network FROM "WithdrawalSigningGuard" WHERE network=\'BEP20\' FOR UPDATE');
   const {rows:[prior]}=await tx.query('SELECT * FROM "NativeGasOutbox" WHERE "requestKey"=$1',[input.requestKey]);
   if(prior){if(prior.addressId!==input.addressId||BigInt(String(prior.tokenAmount))!==input.tokenAmount)throw new Error('NATIVE_GAS_CONFLICT');return {id:String(prior.id),state:String(prior.state)}}
   const {rows:unresolved}=await tx.query(`SELECT id FROM "SignedWithdrawalOutbox" WHERE network='BEP20' AND state IN ('SIGNED','BROADCAST_UNKNOWN') UNION ALL SELECT id FROM "NativeGasOutbox" WHERE state<>'CONFIRMED'`);
   if(unresolved.length)throw new Error('OPERATING_NONCE_RECONCILIATION_REQUIRED');
   const {rows:[a]}=await tx.query('SELECT a.*,v."accountXpub",v.enabled,v."originVerified" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" WHERE a.id=$1 FOR UPDATE OF a,v',[input.addressId]);
   if(!a||a.network!=='BEP20'||a.enabled!==true||a.originVerified!==true||deriveBep20DepositAddress(String(a.accountXpub),Number(a.derivationIndex)).address!==a.address)throw new Error('NATIVE_GAS_DESTINATION');
   const [rawNonce,rawBalance,rawChildBalance,rawTokens]=await Promise.all([rpc('eth_getTransactionCount',[sender,'pending'],input.signal),rpc('eth_getBalance',[sender,'pending'],input.signal),rpc('eth_getBalance',[a.address,'pending'],input.signal),rpc('eth_call',[{to:bep20UsdtContract,data:new Interface(['function balanceOf(address) view returns(uint256)']).encodeFunctionData('balanceOf',[a.address])},'pending'],input.signal)]);
   if(typeof rawTokens!=='string'||!/^0x[a-f0-9]{64}$/i.test(rawTokens)||BigInt(rawTokens)<input.tokenAmount)throw new Error('NATIVE_GAS_TOKEN_BALANCE');
   const nonce=rpcQuantity(rawNonce),balance=rpcQuantity(rawBalance),fundingAmount=input.targetBalance-rpcQuantity(rawChildBalance);
   if(fundingAmount<=0n)return {id:'',state:'READY'};
   const maxFee=21000n*input.gasPrice,expense=fundingAmount+maxFee;
   if(nonce>BigInt(Number.MAX_SAFE_INTEGER)||balance<expense)throw new Error('NATIVE_GAS_BALANCE_OR_NONCE');
   const {rows:[p]}=await tx.query('SELECT * FROM "PayoutExpensePolicy" WHERE network=\'BEP20\' FOR UPDATE');
   if(!p||p.enabled!==true||expense>BigInt(String(p.perPayoutCap))||expense>config.policy.maxNetworkFeeBaseUnits)throw new Error('NATIVE_GAS_BUDGET');
   const {rows:[used]}=await tx.query(`SELECT COALESCE(sum(n),0)::text AS total FROM (SELECT "amountBaseUnits" AS n FROM "PayoutExpenseReservation" WHERE network='BEP20' AND (state='HELD' OR "settledAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') UNION ALL SELECT expense FROM "SweepDispatchAuthorization" WHERE network='BEP20' AND (state='HELD' OR "settledAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') UNION ALL SELECT expense FROM "NativeGasOutbox" WHERE state<>'CONFIRMED' OR "confirmedAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') q`);
   if(BigInt(String(used.total))+expense>BigInt(String(p.dailyCap)))throw new Error('NATIVE_GAS_DAILY_CAP');
   if(input.signal.aborted)throw new Error('WORKER_ABORTED');
   const payload=await new Wallet(config.key).signTransaction({chainId:56,type:0,to:String(a.address),value:fundingAmount,data:'0x',nonce:Number(nonce),gasLimit:21000n,gasPrice:input.gasPrice});
   const id=randomUUID(),txId=Transaction.from(payload).hash!;
   await tx.query('INSERT INTO "NativeGasOutbox"(id,"addressId","requestKey","tokenAmount",sender,recipient,nonce,"fundingAmount","maxFee",expense,"txId","signedPayload") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,input.addressId,input.requestKey,input.tokenAmount.toString(),sender,a.address,Number(nonce),fundingAmount.toString(),maxFee.toString(),expense.toString(),txId,payload]);
   return {id,state:'SIGNED'};
  });
 }
 async function process(id:string,signal:AbortSignal){
  if(!options.enabled)throw new Error('NATIVE_GAS_DISABLED');
  if(!/^[a-f0-9-]{36}$/i.test(id)||signal.aborted)throw new Error('NATIVE_GAS_INPUT');
  let r=await db.transaction(async tx=>{const {rows:[row]}=await tx.query('SELECT * FROM "NativeGasOutbox" WHERE id=$1',[id]);if(!row)throw new Error('NATIVE_GAS_NOT_FOUND');valid(row);return row});
  if(r.state==='CONFIRMED')return {state:'CONFIRMED'};
  if(await rpc('eth_chainId',[],signal)!=='0x38')throw new Error('NATIVE_GAS_CHAIN');
  if(r.state==='SIGNED'){
   const [nonce,balance]=await Promise.all([rpc('eth_getTransactionCount',[r.sender,'pending'],signal),rpc('eth_getBalance',[r.sender,'pending'],signal)]);
   if(rpcQuantity(nonce)!==BigInt(String(r.nonce))||rpcQuantity(balance)<BigInt(String(r.expense)))return {state:'HELD'};
   const claim=await db.transaction(async tx=>{
    await tx.query('SELECT network FROM "WithdrawalSigningGuard" WHERE network=\'BEP20\' FOR UPDATE');
    const {rows:[row]}=await tx.query('SELECT * FROM "NativeGasOutbox" WHERE id=$1 FOR UPDATE',[id]);valid(row);
    if(row.state!=='SIGNED')return false;
    const {rows:[source]}=await tx.query('SELECT a.address,a.network,a."derivationIndex",v."accountXpub",v.enabled,v."originVerified" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" WHERE a.id=$1 FOR UPDATE OF a,v',[row.addressId]);
    if(!source||source.network!=='BEP20'||source.enabled!==true||source.originVerified!==true||source.address!==row.recipient||deriveBep20DepositAddress(String(source.accountXpub),Number(source.derivationIndex)).address!==row.recipient)throw new Error('NATIVE_GAS_VAULT_DISABLED');

    if(signal.aborted)throw new Error('WORKER_ABORTED');
    await tx.query('UPDATE "NativeGasOutbox" SET state=\'UNKNOWN\',"claimId"=$2 WHERE id=$1',[id,randomUUID()]);return true;
   });
   if(claim){try{const hash=await rpc('eth_sendRawTransaction',[r.signedPayload],signal);if(hash===r.txId)await db.transaction(tx=>tx.query('UPDATE "NativeGasOutbox" SET state=\'ACKNOWLEDGED\' WHERE id=$1 AND state=\'UNKNOWN\'',[id]))}catch{/* UNKNOWN retained, including timeout/crash before send. */}}
   r={...r,state:'UNKNOWN'};
  }
  try{
   const receipt=rpcObject(await rpc('eth_getTransactionReceipt',[r.txId],signal));
   const height=rpcQuantity(receipt.blockNumber),h='0x'+height.toString(16),hash=receipt.blockHash;
   if(receipt.transactionHash!==r.txId||receipt.status!=='0x1'||getAddress(String(receipt.from))!==getAddress(String(r.sender))||getAddress(String(receipt.to))!==getAddress(String(r.recipient))||receipt.contractAddress!==null||rpcQuantity(receipt.gasUsed)!==21000n||rpcQuantity(receipt.effectiveGasPrice)!==BigInt(String(r.maxFee))/21000n||typeof hash!=='string'||!/^0x[a-f0-9]{64}$/i.test(hash))throw new Error();
   const block=rpcObject(await rpc('eth_getBlockByNumber',[h,false],signal)),finalized=rpcObject(await rpc('eth_getBlockByNumber',['finalized',false],signal));
   const head=rpcQuantity(await rpc('eth_blockNumber',[],signal));
   const index=rpcQuantity(receipt.transactionIndex);
   if(!Array.isArray(block.transactions)||index>BigInt(Number.MAX_SAFE_INTEGER)||block.transactions[Number(index)]!==r.txId||block.transactions.filter(v=>v===r.txId).length!==1)throw new Error();
   if(block.hash!==hash||rpcQuantity(block.number)!==height||rpcQuantity(finalized.number)<height||rpcQuantity(finalized.number)>head||head<height||head-height+1n<BigInt(options.minimumConfirmations))throw new Error();
   if(rpcObject(await rpc('eth_getBlockByNumber',[h,false],signal)).hash!==hash||signal.aborted)throw new Error();
   await db.transaction(async tx=>{
    const {rows:[row]}=await tx.query('SELECT * FROM "NativeGasOutbox" WHERE id=$1 FOR UPDATE',[id]);valid(row);
    if(row.state==='CONFIRMED')return;
    if(row.state==='SIGNED')throw new Error('NATIVE_GAS_NOT_CLAIMED');
    await tx.query('UPDATE "NativeGasOutbox" SET state=\'CONFIRMED\',"confirmedAt"=clock_timestamp(),"blockNumber"=$2,"blockHash"=$3 WHERE id=$1',[id,height.toString(),hash]);
   });
   return {state:'CONFIRMED'};
  }catch{return {state:'HELD'}}
 }
 return {prepare,process};
}
