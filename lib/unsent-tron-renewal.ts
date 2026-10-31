import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {TronWeb} from 'tronweb';
import {validateSavedPayout} from './payout-signature';
import {treasuryDestination} from './treasury-addresses';
import type {WalletDb} from './wallet-engine';
import {signTrc20Usdt,vercelSignerConfiguration} from './vercel-treasury-signer';
import {depositHdSigningConfiguration,signDepositSweep} from './deposit-hd-signer';
import type {createFinancialPreflight} from './financial-preflight';
/** Only never-claimed expired TRON signatures may be replaced. UNKNOWN NEVER enters here.
 * Archive all old bytes and approvals atomically before refreshing TAPOS/expiry. No new debit.
 */
export function createUnsentTronRenewal(db:WalletDb,options:{preflight:ReturnType<typeof createFinancialPreflight>;loadOperating?:(network:'TRC20'|'BEP20')=>{key:string;policy:Parameters<typeof signTrc20Usdt>[1]};loadDeposit?:typeof depositHdSigningConfiguration}){
 return async(job:{kind:'SWEEP'|'PAYOUT';id:string},signal:AbortSignal)=>{
  const table=job.kind==='SWEEP'?'SignedSweepOutbox':'SignedWithdrawalOutbox';
  const old=await db.transaction(async tx=>{const {rows:[r]}=await tx.query(`SELECT * FROM "${table}" WHERE id=$1`,[job.id]);return r});
  if(!old||old.network!=='TRC20'||old.state!=='SIGNED')return {state:'UNCHANGED'};
  const data=JSON.parse(String(old.signedPayload)),expiration=Number(data.raw_data.expiration);
  if(!Number.isSafeInteger(expiration)||expiration>Date.now())return {state:'UNCHANGED'};
  const v=data.raw_data.contract[0].parameter.value,amount=BigInt('0x'+v.data.slice(-64)),sender=TronWeb.address.fromHex(v.owner_address),recipient=TronWeb.address.fromHex('41'+v.data.slice(32,72)),fee=BigInt(data.raw_data.fee_limit);
  // Authenticate and bind the OLD signature before any replacement signature is produced.
  await db.transaction(async tx=>{
   if(job.kind==='PAYOUT'){
    const {rows:[q]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1',[old.quoteId]);if(!q)throw new Error('RENEWAL_QUOTE');validateSavedPayout(old,q,{allowExpired:true});
   }else{
    const {rows:[a]}=await tx.query('SELECT address FROM "UserDepositAddress" WHERE id=$1',[old.addressId]);if(!a)throw new Error('RENEWAL_SOURCE');
    const destination=treasuryDestination('TRC20','operating');
    validateSavedPayout({...old,sender:a.address,recipient:destination,amountBaseUnits:amount.toString()},{recipient:destination,netTokens:`${amount/1000000n}.${String(amount%1000000n).padStart(6,'0')}`},{allowExpired:true});
   }
  });
  const available=await options.preflight({network:'TRC20',sender,recipient,amount,maxAmount:amount,maxFee:fee,signal});
  if(available.network!=='TRC20'||available.availableEnergy<available.requiredEnergy)return {state:'HELD'};
  return db.transaction(async tx=>{
   if(job.kind==='SWEEP')await tx.query('SELECT id FROM "UserDepositAddress" WHERE id=$1 FOR UPDATE',[old.addressId]);
   else{const {rows:[q]}=await tx.query('SELECT "operationId" FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[old.quoteId]);await tx.query('SELECT id FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[q?.operationId])}
   const {rows:[row]}=await tx.query(`SELECT *,CASE WHEN network='TRC20' THEN ("signedPayload"::jsonb#>>'{raw_data,expiration}')::numeric<=extract(epoch FROM clock_timestamp())*1000 ELSE false END AS expired FROM "${table}" WHERE id=$1 FOR UPDATE`,[job.id]);
   if(!row||row.txId!==old.txId||row.state!=='SIGNED'||row.expired!==true||signal.aborted)return {state:'UNCHANGED'};
   const {rows:claims}=await tx.query(job.kind==='SWEEP'?'SELECT "claimId" FROM "SweepDispatchAuthorization" WHERE "sweepId"=$1 AND "claimId" IS NOT NULL':'SELECT "claimId" FROM "PayoutDispatchAttempt" WHERE "payoutId"=$1',[job.id]);if(claims.length)return {state:'HELD'};
   let payload:string,txId:string;
   if(job.kind==='SWEEP'){
    const {rows:[a]}=await tx.query('SELECT a.*,v.enabled,v."originVerified",v."accountXpub" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" WHERE a.id=$1',[old.addressId]);
    const keys=(options.loadDeposit??depositHdSigningConfiguration)('TRC20');
    if(!a||a.enabled!==true||a.originVerified!==true||a.accountXpub!==keys.accountXpub||a.address!==sender)throw new Error('RENEWAL_VAULT');
    const signed=await signDepositSweep({network:'TRC20',...keys,index:Number(a.derivationIndex),assignedAddress:String(a.address),maxAmountBaseUnits:amount,maxNetworkFeeBaseUnits:fee,transaction:available.transaction});if(!('transaction' in signed))throw new Error('RENEWAL_NETWORK');payload=JSON.stringify(signed.transaction);txId=signed.txId;
   }else{
    const config=(options.loadOperating??vercelSignerConfiguration)('TRC20');if(config.policy.expectedSender!==sender)throw new Error('RENEWAL_SENDER');
    const signed=signTrc20Usdt(config.key,config.policy,{...available.transaction,destination:recipient});payload=JSON.stringify(signed.transaction);txId=signed.txId;
   }
   if(job.kind==='SWEEP')await tx.query(`INSERT INTO "DispatchApprovalHistory"(id,kind,"outboxId",previous) SELECT $2,'SWEEP',s.id,jsonb_build_object('signature',to_jsonb(s),'authorization',to_jsonb(a)) FROM "SignedSweepOutbox" s LEFT JOIN "SweepDispatchAuthorization" a ON a."sweepId"=s.id WHERE s.id=$1`,[job.id,randomUUID()]);
   else await tx.query(`INSERT INTO "DispatchApprovalHistory"(id,kind,"outboxId",previous) SELECT $2,'PAYOUT',s.id,jsonb_build_object('signature',to_jsonb(s),'approval',to_jsonb(a),'expense',to_jsonb(r)) FROM "SignedWithdrawalOutbox" s LEFT JOIN "PayoutDispatchApproval" a ON a."payoutId"=s.id LEFT JOIN "PayoutExpenseReservation" r ON r."payoutId"=s.id WHERE s.id=$1`,[job.id,randomUUID()]);
   await tx.query(`UPDATE "${table}" SET "signedPayload"=$2,"txId"=$3,fingerprint=$4 WHERE id=$1`,[job.id,payload,txId,createHash('sha256').update(String(row.fingerprint)+':'+txId).digest('hex')]);
   const hash=createHash('sha256').update(payload).digest('hex');
   await tx.query(job.kind==='SWEEP'?'UPDATE "SweepDispatchAuthorization" SET "txId"=$2,"payloadHash"=$3 WHERE "sweepId"=$1':'UPDATE "PayoutDispatchApproval" SET "txId"=$2,"payloadHash"=$3 WHERE "payoutId"=$1',[job.id,txId,hash]);
   return {state:'RENEWED'};
  });
 };
}
