import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {getAddress} from 'ethers';
import {signBep20Usdt,signTrc20Usdt,vercelSignerConfiguration} from './vercel-treasury-signer';
import {moneyMicros,type WalletDb} from './wallet-engine';
type TronFields=Omit<Parameters<typeof signTrc20Usdt>[2],'destination'|'amountBaseUnits'>;
type BepFields=Omit<Parameters<typeof signBep20Usdt>[2],'destination'|'amountBaseUnits'>;
type Command={quoteId:string}&({network:'TRC20';transaction:TronFields}|{network:'BEP20';transaction:BepFields});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** PRIVATE signing preparation, never a public API. Destination/amount/owner come from DB.
 * loadKeys is a trusted server dependency (fixture override in tests), NEVER request data.
 * No RPC, balance attestation, energy purchase, broadcast or full expense authorization here.
 */
export async function prepareSignedWithdrawal(db:WalletDb,c:Command,options:{loadKeys?:(network:'TRC20'|'BEP20')=>{key:string;policy:Parameters<typeof signBep20Usdt>[1]};now?:number}={}){
 if(!uuid.test(c.quoteId)||!['TRC20','BEP20'].includes(c.network)||!c.transaction||typeof c.transaction!=='object'||Array.isArray(c.transaction))throw new Error('INVALID_PAYOUT_COMMAND');
 if(Object.keys(c).some(key=>!['quoteId','network','transaction'].includes(key)))throw new Error('UNEXPECTED_PAYOUT_COMMAND_FIELD');
 const fields=c.network==='TRC20'?['refBlockBytes','refBlockHash','timestamp','expiration','feeLimitSun']:['nonce','gasLimit','gasPrice'];
 if(Object.keys(c.transaction).some(key=>!fields.includes(key))||fields.some(key=>!Object.hasOwn(c.transaction,key)))throw new Error('UNEXPECTED_PAYOUT_TRANSACTION_FIELD');
 const fingerprint=createHash('sha256').update(JSON.stringify([c.quoteId.toLowerCase(),c.network,fields.map(key=>[key,(c.transaction as unknown as Record<string,unknown>)[key]])],(_key,value)=>typeof value==='bigint'?value.toString():value)).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  // Same quote-before-operation lock order as reservation and settlement.
  const {rows:[quote]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[c.quoteId]);
  if(!quote?.operationId||quote.network!==c.network)throw new Error('PAYOUT_QUOTE_NOT_RESERVED');
  const {rows:[operation]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[quote.operationId]);
  if(!operation||operation.kind!=='WITHDRAWAL'||operation.ownerId!==quote.ownerId||operation.destination!=='USDTQ:'+quote.id||moneyMicros(String(operation.amount))!==moneyMicros(String(quote.grossUsd)))throw new Error('PAYOUT_OPERATION_MISMATCH');
  const {rows:[prior]}=await tx.query('SELECT id,"txId",state,fingerprint FROM "SignedWithdrawalOutbox" WHERE "quoteId"=$1',[quote.id]);
  if(prior){
   if(prior.fingerprint!==fingerprint)throw new Error('PAYOUT_IDEMPOTENCY_CONFLICT');
   return {id:String(prior.id),txId:String(prior.txId),state:String(prior.state)};
  }
  if(operation.state!=='RESERVED')throw new Error('PAYOUT_REQUIRES_RESERVED_OPERATION');
  const {rows:[guard]}=await tx.query('SELECT network FROM "WithdrawalSigningGuard" WHERE network=$1 FOR UPDATE',[c.network]);
  if(!guard)throw new Error('PAYOUT_SIGNING_GUARD_UNAVAILABLE');
  const {rows:pending}=await tx.query('SELECT id FROM "SignedWithdrawalOutbox" WHERE network=$1 AND state IN (\'SIGNED\',\'BROADCAST_UNKNOWN\')',[c.network]);
  if(pending.length)throw new Error('PAYOUT_NETWORK_RECONCILIATION_REQUIRED');
  if(c.network==='BEP20'){const {rows:gas}=await tx.query('SELECT id FROM "NativeGasOutbox" WHERE state<>\'CONFIRMED\'');if(gas.length)throw new Error('PAYOUT_NETWORK_RECONCILIATION_REQUIRED')}
  const config=(options.loadKeys??vercelSignerConfiguration)(c.network);
  const sender=c.network==='BEP20'?getAddress(config.policy.expectedSender):config.policy.expectedSender;
  const recipient=String(quote.recipient);
  // Quote token decimals are six; BSC contract uses eighteen base-unit decimals.
  const amountBaseUnits=moneyMicros(String(quote.netTokens))*(c.network==='BEP20'?10n**12n:1n);
  const signed=c.network==='BEP20'?
   await signBep20Usdt(config.key,config.policy,{...c.transaction,destination:recipient,amountBaseUnits}):
   signTrc20Usdt(config.key,config.policy,{...c.transaction,destination:recipient,amountBaseUnits},options.now);
  const payload='serialized' in signed?signed.serialized:JSON.stringify(signed.transaction);
  const id=randomUUID();
  await tx.query('INSERT INTO "SignedWithdrawalOutbox" (id,"quoteId","operationId",network,sender,recipient,"amountBaseUnits",fingerprint,"txId","signedPayload","senderNonce") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,quote.id,operation.id,c.network,sender,recipient,amountBaseUnits.toString(),fingerprint,signed.txId,payload,c.network==='BEP20'?c.transaction.nonce:null]);
  // The SUBMITTED hold and signed bytes commit together, BEFORE any future broadcast attempt.
  await tx.query('UPDATE "WalletOperation" SET state=\'SUBMITTED\',"updatedAt"=statement_timestamp() WHERE id=$1',[operation.id]);
  return {id,txId:signed.txId,state:'SIGNED'};
 });
}
