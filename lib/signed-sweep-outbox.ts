import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
import {signDepositSweep,depositHdSigningConfiguration} from './deposit-hd-signer';
import {treasuryDestination} from './treasury-addresses';
type Sweep=Parameters<typeof signDepositSweep>[0];
type Command=({network:'TRC20';transaction:Extract<Sweep,{network:'TRC20'}>['transaction']}|{network:'BEP20';transaction:Extract<Sweep,{network:'BEP20'}>['transaction']})&{
 addressId:string;requestKey:string;maxAmountBaseUnits:bigint;maxNetworkFeeBaseUnits:bigint;
};
/** PRIVATE PREPARATION: durable signature, no broadcast. Does NOT establish spendable balance,
 * approved economics or daily budget. A future worker must claim/verify those before calling.
 * Never expose this function via an unauthenticated route or return signed bytes to browsers.
 */
export async function prepareSignedSweep(db:WalletDb,command:Command,options:{now?:number;loadKeys?:typeof depositHdSigningConfiguration}={}){
 const c=command;
 if(!/^[a-f0-9-]{36}$/i.test(c.addressId)||! /^[A-Za-z0-9:_-]{8,128}$/.test(c.requestKey))throw new Error('INVALID_SWEEP_COMMAND');
 if(c.network!=='TRC20'&&c.network!=='BEP20')throw new Error('UNSUPPORTED_DEPOSIT_NETWORK');
 // Reject extra fields instead of allowing caller-controlled calldata/key material to be persisted.
 const allowed=c.network==='TRC20'?['amountBaseUnits','refBlockBytes','refBlockHash','timestamp','expiration','feeLimitSun']:['amountBaseUnits','nonce','gasLimit','gasPrice'];
 if(Object.keys(c.transaction).some(key=>!allowed.includes(key)))throw new Error('UNEXPECTED_SWEEP_TRANSACTION_FIELD');
 const fingerprint=createHash('sha256').update(JSON.stringify([
  c.addressId.toLowerCase(),c.network,treasuryDestination(c.network,'operating'),
  c.maxAmountBaseUnits,c.maxNetworkFeeBaseUnits,
  allowed.map(key=>[key,(c.transaction as unknown as Record<string,unknown>)[key]]),
 ],(_key,value)=>typeof value==='bigint'?value.toString():value)).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[source]}=await tx.query('SELECT * FROM "UserDepositAddress" WHERE id=$1 FOR UPDATE',[c.addressId]);
  if(!source||source.network!==c.network)throw new Error('SWEEP_SOURCE_UNAVAILABLE');
  const {rows:[prior]}=await tx.query('SELECT id,"txId",state,fingerprint FROM "SignedSweepOutbox" WHERE "addressId"=$1 AND "requestKey"=$2',[c.addressId,c.requestKey]);
  if(prior){if(prior.fingerprint!==fingerprint)throw new Error('SWEEP_IDEMPOTENCY_CONFLICT');return {id:String(prior.id),txId:String(prior.txId),state:String(prior.state)}}
  const {rows:pending}=await tx.query('SELECT id FROM "SignedSweepOutbox" WHERE "addressId"=$1 AND state IN (\'SIGNED\',\'BROADCAST_UNKNOWN\')',[c.addressId]);
  if(pending.length)throw new Error('SWEEP_RECONCILIATION_REQUIRED');
  const {rows:[vault]}=await tx.query('SELECT "accountXpub",enabled,"originVerified",network FROM "DepositAddressVault" WHERE id=$1',[source.vaultId]);
  if(!vault||vault.enabled!==true||vault.originVerified!==true||vault.network!==c.network)throw new Error('DEPOSIT_VAULT_NOT_READY');
  const keys=(options.loadKeys??depositHdSigningConfiguration)(c.network);
  if(keys.accountXpub!==vault.accountXpub)throw new Error('SWEEP_VAULT_KEY_MISMATCH');
  const signed=await signDepositSweep({...c,...keys,index:Number(source.derivationIndex),assignedAddress:String(source.address)} as Sweep,options.now);
  const payload='serialized' in signed?signed.serialized:JSON.stringify(signed.transaction);
  const id=randomUUID();
  await tx.query('INSERT INTO "SignedSweepOutbox" (id,"addressId","requestKey",network,fingerprint,"txId","signedPayload","senderNonce") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,c.addressId,c.requestKey,c.network,fingerprint,signed.txId,payload,c.network==='BEP20'?c.transaction.nonce:null]);
  return {id,txId:signed.txId,state:'SIGNED'};
 });
}
