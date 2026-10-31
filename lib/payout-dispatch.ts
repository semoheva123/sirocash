import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {Transaction,Interface,getAddress} from 'ethers';
import {TronWeb,utils} from 'tronweb';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {tronUsdtContract} from './tron-deposit-verification';
import type {signTrc20Usdt} from './vercel-treasury-signer';
import {moneyMicros,type WalletDb} from './wallet-engine';
const token=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
type Send=(input:{network:'TRC20'|'BEP20';txId:string;signedPayload:string;signal:AbortSignal})=>Promise<{txId:string}>;
/** PRIVATE worker. No production network adapter or public route is installed.
 * The private approval table must be populated by a reviewed balance/resource/budget authority.
 * A provider ACK is NOT finality. Every uncertain result stays held; retries do not resend.
 */
export async function dispatchSavedPayout(db:WalletDb,payoutId:string,options:{send:Send;enabled?:boolean;now?:number;timeoutMs?:number}){
 const timeoutMs=options.timeoutMs??10000;
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw new Error('PAYOUT_TIMEOUT_INVALID');
 if(options.enabled!==true)throw new Error('PAYOUT_DISPATCH_DISABLED');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payoutId))throw new Error('INVALID_PAYOUT_ID');
 const prepared=await db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[locator]}=await tx.query('SELECT "quoteId" FROM "SignedWithdrawalOutbox" WHERE id=$1',[payoutId]);
  if(!locator)throw new Error('PAYOUT_NOT_FOUND');
  const {rows:[quote]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[locator.quoteId]);
  const {rows:[operation]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[quote?.operationId]);
  const {rows:[payout]}=await tx.query('SELECT * FROM "SignedWithdrawalOutbox" WHERE id=$1 FOR UPDATE',[payoutId]);
  if(!payout||!operation||payout.operationId!==operation.id||quote?.operationId!==operation.id||quote.network!==payout.network||operation.destination!=='USDTQ:'+quote.id)throw new Error('PAYOUT_DISPATCH_IDENTITY_CONFLICT');
  const {rows:[prior]}=await tx.query('SELECT state FROM "PayoutDispatchAttempt" WHERE "payoutId"=$1',[payoutId]);
  if(prior)return {status:String(prior.state),txId:String(payout.txId)};
  if(operation.state!=='SUBMITTED'||payout.state!=='SIGNED')throw new Error('PAYOUT_NOT_DISPATCHABLE');
  const {rows:[approval]}=await tx.query('SELECT *,"approvedAt"<=statement_timestamp() AND "expiresAt">statement_timestamp() AS fresh FROM "PayoutDispatchApproval" WHERE "payoutId"=$1 FOR UPDATE',[payoutId]);
  if(!approval||approval.fresh!==true||approval.consumedAt||approval.txId!==payout.txId||approval.payloadHash!==createHash('sha256').update(String(payout.signedPayload)).digest('hex'))throw new Error('PAYOUT_DISPATCH_APPROVAL_REQUIRED');
  const expectedAmount=moneyMicros(String(quote.netTokens))*(payout.network==='BEP20'?10n**12n:1n);
  if(expectedAmount!==BigInt(String(payout.amountBaseUnits))||payout.recipient!==quote.recipient)throw new Error('PAYOUT_NET_AMOUNT_CONFLICT');
  let maxFee:bigint;
  if(payout.network==='BEP20'){
   const signed=Transaction.from(String(payout.signedPayload));
   const decoded=token.decodeFunctionData('transfer',signed.data);
   if(signed.hash!==payout.txId||signed.from!==getAddress(String(payout.sender))||signed.chainId!==56n||signed.type!==0||signed.value!==0n||signed.to!==getAddress(bep20UsdtContract)||String(signed.nonce)!==String(payout.senderNonce)||decoded[0]!==getAddress(String(quote.recipient))||String(decoded[1])!==String(payout.amountBaseUnits)||signed.data!==token.encodeFunctionData('transfer',[decoded[0],decoded[1]])||!signed.gasPrice)throw new Error('PAYOUT_SAVED_SIGNATURE_INVALID');
   maxFee=signed.gasLimit*signed.gasPrice;
  }else if(payout.network==='TRC20'){
   const signed=JSON.parse(String(payout.signedPayload)) as ReturnType<typeof signTrc20Usdt>['transaction'];
   if(!utils.transaction.txCheck(signed)||signed.txID!==payout.txId||signed.signature?.length!==1||signed.raw_data.contract.length!==1)throw new Error('PAYOUT_SAVED_SIGNATURE_INVALID');
   const contract=signed.raw_data.contract[0],v=contract.parameter.value as {owner_address:string;contract_address:string;data:string;call_value?:number;call_token_value?:number;token_id?:number};
   const sender=TronWeb.address.toHex(String(payout.sender)).toLowerCase();
   const data='a9059cbb'+TronWeb.address.toHex(String(quote.recipient)).slice(2).toLowerCase().padStart(64,'0')+BigInt(String(payout.amountBaseUnits)).toString(16).padStart(64,'0');
   if(contract.type!=='TriggerSmartContract'||v.owner_address.toLowerCase()!==sender||utils.crypto.ecRecover(signed.txID,signed.signature[0]).toLowerCase()!==sender||v.contract_address.toLowerCase()!==TronWeb.address.toHex(tronUsdtContract).toLowerCase()||v.data!==data||(v.call_value??0)!==0||(v.call_token_value??0)!==0||(v.token_id??0)!==0||signed.raw_data.expiration<=(options.now??Date.now()))throw new Error('PAYOUT_SAVED_SIGNATURE_INVALID_OR_EXPIRED');
   if(typeof signed.raw_data.fee_limit!=='number'||!Number.isSafeInteger(signed.raw_data.fee_limit)||signed.raw_data.fee_limit<=0)throw new Error('PAYOUT_FEE_INVALID');
   maxFee=BigInt(signed.raw_data.fee_limit);
  }else throw new Error('PAYOUT_NETWORK_INVALID');
  if(maxFee<=0n||maxFee>BigInt(String(approval.maxNativeFeeBaseUnits)))throw new Error('PAYOUT_APPROVED_FEE_EXCEEDED');
  const claimId=randomUUID();
  await tx.query('UPDATE "PayoutDispatchApproval" SET "consumedAt"=statement_timestamp() WHERE "payoutId"=$1',[payoutId]);
  await tx.query('INSERT INTO "PayoutDispatchAttempt" ("payoutId","claimId") VALUES ($1,$2)',[payoutId,claimId]);
  await tx.query('UPDATE "SignedWithdrawalOutbox" SET state=\'BROADCAST_UNKNOWN\' WHERE id=$1',[payoutId]);
  return {status:'CLAIMED',txId:String(payout.txId),claimId,network:payout.network as 'TRC20'|'BEP20',signedPayload:String(payout.signedPayload)};
 });
 if(!('signedPayload' in prepared))return {txId:prepared.txId,state:prepared.status};
 // Crash from this point onward is intentionally UNKNOWN, including crash before actual send.
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([options.send({network:prepared.network!,txId:prepared.txId,signedPayload:prepared.signedPayload!,signal:controller.signal}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('PAYOUT_SEND_TIMEOUT'))},timeoutMs)})]);
  if(result.txId.toLowerCase()!==prepared.txId.toLowerCase())return {txId:prepared.txId,state:'UNKNOWN'};
  await db.transaction(async tx=>{
   await tx.query('UPDATE "PayoutDispatchAttempt" SET state=\'ACKNOWLEDGED\',"acknowledgedAt"=statement_timestamp() WHERE "payoutId"=$1 AND "claimId"=$2 AND state=\'UNKNOWN\'',[payoutId,prepared.claimId]);
  });
  return {txId:prepared.txId,state:'ACKNOWLEDGED'};
 }catch{return {txId:prepared.txId,state:'UNKNOWN'}}finally{if(timer)clearTimeout(timer);controller.abort()}
}
