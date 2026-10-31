import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {moneyMicros,type WalletDb} from './wallet-engine';
import {validTronAddress} from './tron-addresses';
import {treasuryDestination} from './treasury-addresses';
type Target={kind:'PAYOUT';quoteId:string}|{kind:'SWEEP';addressId:string;requestKey:string;amountBaseUnits:bigint};
type Command=Target&{energyAmount:number;durationMinutes:60;maxRentalSun:bigint};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Unified PRIVATE pre-sign resource intent. Not a paid order, delegation or delivery proof.
 * A trusted planner must establish need, simulation, source spendability and budget first.
 * Payout/sweep senders and destinations are bound to DB/platform configuration, not customer input.
 */
export async function prepareTronResourceIntent(db:WalletDb,c:Command){
 if(!Number.isSafeInteger(c.energyAmount)||c.energyAmount<=0||c.energyAmount>2147483647||c.durationMinutes!==60||typeof c.maxRentalSun!=='bigint'||c.maxRentalSun<=0n||c.maxRentalSun>9223372036854775807n)throw new Error('INVALID_TRON_RESOURCE_INTENT');
 if(c.kind==='PAYOUT'){if(!uuid.test(c.quoteId))throw new Error('INVALID_ENERGY_TARGET')}
 else if(c.kind==='SWEEP'){if(!uuid.test(c.addressId)||! /^[A-Za-z0-9:_-]{8,128}$/.test(c.requestKey)||typeof c.amountBaseUnits!=='bigint'||c.amountBaseUnits<=0n||c.amountBaseUnits>=2n**256n)throw new Error('INVALID_ENERGY_TARGET')}
 else throw new Error('INVALID_ENERGY_TARGET');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  let sender:string,recipient:string,amount:bigint,withdrawalId:string|null=null,sweepAddressId:string|null=null,key:string;
  if(c.kind==='PAYOUT'){
   const {rows:[quote]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[c.quoteId]);
   const {rows:[op]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[quote?.operationId]);
   if(!quote||quote.network!=='TRC20'||!op||op.kind!=='WITHDRAWAL'||op.state!=='RESERVED'||op.ownerId!==quote.ownerId||op.destination!=='USDTQ:'+quote.id||moneyMicros(String(op.amount))!==moneyMicros(String(quote.grossUsd)))throw new Error('ENERGY_PAYOUT_NOT_RESERVED');
   withdrawalId=String(op.id);sender=treasuryDestination('TRC20','operating');recipient=String(quote.recipient);amount=moneyMicros(String(quote.netTokens));key='energy:payout:'+withdrawalId;
  }else{
   const {rows:[source]}=await tx.query('SELECT * FROM "UserDepositAddress" WHERE id=$1 FOR UPDATE',[c.addressId]);
   if(!source||source.network!=='TRC20')throw new Error('ENERGY_SWEEP_SOURCE_UNAVAILABLE');
   const {rows:[vault]}=await tx.query('SELECT enabled,"originVerified",network FROM "DepositAddressVault" WHERE id=$1',[source.vaultId]);
   if(!vault||vault.network!=='TRC20'||vault.enabled!==true||vault.originVerified!==true)throw new Error('ENERGY_SWEEP_VAULT_NOT_READY');
   const {rows:pending}=await tx.query('SELECT id FROM "SignedSweepOutbox" WHERE "addressId"=$1 AND state IN (\'SIGNED\',\'BROADCAST_UNKNOWN\')',[source.id]);
   if(pending.length)throw new Error('ENERGY_SWEEP_RECONCILIATION_REQUIRED');
   sweepAddressId=String(source.id);sender=String(source.address);recipient=treasuryDestination('TRC20','operating');amount=c.amountBaseUnits;key='energy:sweep:'+createHash('sha256').update(sweepAddressId+':'+c.requestKey).digest('hex');
  }
  if(!validTronAddress(sender)||!validTronAddress(recipient)||sender===recipient)throw new Error('INVALID_ENERGY_SENDER_OR_DESTINATION');
  const fingerprint=createHash('sha256').update(JSON.stringify([c.kind,key,sender,recipient,amount.toString(),c.energyAmount,c.durationMinutes,c.maxRentalSun.toString()])).digest('hex');
  // Legacy and new payout intents share withdrawal uniqueness and the same sender-pending index.
  const {rows:[prior]}=await tx.query('SELECT id,"requestKey",state,fingerprint FROM "EnergyRentalIntent" WHERE "requestKey"=$1 OR ("withdrawalId"=$2 AND $2::uuid IS NOT NULL) FOR UPDATE',[key,withdrawalId]);
  if(prior){if(prior.fingerprint!==fingerprint)throw new Error('ENERGY_IDEMPOTENCY_CONFLICT');return {id:String(prior.id),requestKey:String(prior.requestKey),state:String(prior.state),sender}}
  const id=randomUUID();
  await tx.query('INSERT INTO "EnergyRentalIntent" (id,"withdrawalId","sweepAddressId","senderAddress","recipientAddress","amountBaseUnits","requestKey",fingerprint,"energyAmount","durationMinutes","maxRentalSun") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,withdrawalId,sweepAddressId,sender,recipient,amount.toString(),key,fingerprint,c.energyAmount,c.durationMinutes,c.maxRentalSun.toString()]);
  return {id,requestKey:key,state:'PREPARED',sender};
 });
}
