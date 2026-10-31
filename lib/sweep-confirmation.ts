import 'server-only';
import {createHash} from 'node:crypto';
import {Transaction,Interface,getAddress} from 'ethers';
import {verifyBep20UsdtDeposit,bep20UsdtContract} from './bep20-deposit-verification';
import {treasuryDestination} from './treasury-addresses';
import type {WalletDb} from './wallet-engine';
const token=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
type Evidence=Parameters<typeof verifyBep20UsdtDeposit>[0];
/** PRIVATE trusted-observer boundary, not a public receipt endpoint.
 * Successful final evidence only. Missing/failed/expired/conflicting evidence NEVER releases a source.
 * Does not broadcast, post a ledger entry, or prove node authenticity.
 */
export async function confirmBep20Sweep(db:WalletDb,input:{sweepId:string;evidence:Evidence}){
 if(!/^[a-f0-9-]{36}$/i.test(input.sweepId))throw new Error('INVALID_SWEEP_ID');
 const event=verifyBep20UsdtDeposit(input.evidence);
 const fingerprint=createHash('sha256').update(JSON.stringify(event)).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[locator]}=await tx.query('SELECT "addressId" FROM "SignedSweepOutbox" WHERE id=$1',[input.sweepId]);
  if(!locator)throw new Error('SWEEP_NOT_FOUND');
  // Same source-before-outbox lock order as signing preparation.
  const {rows:[source]}=await tx.query('SELECT address,network FROM "UserDepositAddress" WHERE id=$1 FOR UPDATE',[locator.addressId]);
  const {rows:[row]}=await tx.query('SELECT * FROM "SignedSweepOutbox" WHERE id=$1 FOR UPDATE',[input.sweepId]);
  if(!row||!source||row.addressId!==locator.addressId||row.network!=='BEP20'||source.network!=='BEP20')throw new Error('SWEEP_SOURCE_MISMATCH');
  const signed=Transaction.from(String(row.signedPayload));
  if(!signed.hash||!signed.from||signed.chainId!==56n||signed.type!==0||signed.value!==0n||
    signed.to!==getAddress(bep20UsdtContract)||signed.hash.toLowerCase()!==String(row.txId).toLowerCase()||
    signed.hash.slice(2).toLowerCase()!==event.txId||signed.from!==getAddress(String(source.address))||
    String(signed.nonce)!==String(row.senderNonce))throw new Error('SWEEP_SIGNED_IDENTITY_MISMATCH');
  const decoded=token.decodeFunctionData('transfer',signed.data);
  if(signed.data!==token.encodeFunctionData('transfer',[decoded[0],decoded[1]])||
    getAddress(decoded[0])!==treasuryDestination('BEP20','operating')||event.to!==getAddress(decoded[0])||
    event.from!==signed.from||event.amountBaseUnits!==String(decoded[1]))throw new Error('SWEEP_EXECUTION_MISMATCH');
  const {rows:[prior]}=await tx.query('SELECT fingerprint FROM "SweepConfirmation" WHERE "sweepId"=$1',[input.sweepId]);
  if(prior){
   if(prior.fingerprint!==fingerprint||row.state!=='CONFIRMED')throw new Error('SWEEP_CONFIRMATION_CONFLICT');
   return {id:String(row.id),txId:String(row.txId),state:'CONFIRMED' as const};
  }
  if(row.state!=='SIGNED'&&row.state!=='BROADCAST_UNKNOWN')throw new Error('SWEEP_STATE_CONFLICT');
  await tx.query('INSERT INTO "SweepConfirmation" ("sweepId",fingerprint,evidence) VALUES ($1,$2,$3::jsonb)',[row.id,fingerprint,JSON.stringify(event)]);
  await tx.query('UPDATE "SignedSweepOutbox" SET state=\'CONFIRMED\' WHERE id=$1',[row.id]);
  return {id:String(row.id),txId:String(row.txId),state:'CONFIRMED' as const};
 });
}
