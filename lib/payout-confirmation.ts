import 'server-only';
import {createHash} from 'node:crypto';
import {verifyBep20UsdtDeposit} from './bep20-deposit-verification';
import {verifyTronUsdtDeposit} from './tron-deposit-verification';
import {validateSavedPayout} from './payout-signature';
import {settleQuotedUsdtWithdrawalInTransaction} from './quoted-usdt-withdrawal';
import type {WalletDb} from './wallet-engine';
type Command={payoutId:string}&({network:'BEP20';evidence:Parameters<typeof verifyBep20UsdtDeposit>[0]}|{network:'TRC20';evidence:Parameters<typeof verifyTronUsdtDeposit>[0]});
/** PRIVATE trusted observer only. Receipt/block evidence must never come from public clients.
 * Success-only reconciliation: missing/failed/unfinalized/contradictory evidence preserves holds.
 * RPC authenticity/inclusion normalization and confirmation policy remain the observer's job.
 */
export async function confirmPayout(db:WalletDb,c:Command){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(c.payoutId)||!['TRC20','BEP20'].includes(c.network))throw new Error('INVALID_PAYOUT_CONFIRMATION');
 const event=c.network==='BEP20'?verifyBep20UsdtDeposit(c.evidence):verifyTronUsdtDeposit(c.evidence);
 const fingerprint=createHash('sha256').update(JSON.stringify(event)).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[locator]}=await tx.query('SELECT "quoteId" FROM "SignedWithdrawalOutbox" WHERE id=$1',[c.payoutId]);
  if(!locator)throw new Error('PAYOUT_NOT_FOUND');
  // Same quote -> operation -> outbox ordering as preparation and dispatch.
  const {rows:[quote]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[locator.quoteId]);
  const {rows:[operation]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[quote?.operationId]);
  const {rows:[payout]}=await tx.query('SELECT * FROM "SignedWithdrawalOutbox" WHERE id=$1 FOR UPDATE',[c.payoutId]);
  if(!payout||!quote||!operation||payout.operationId!==operation.id||quote.operationId!==operation.id||operation.kind!=='WITHDRAWAL'||operation.ownerId!==quote.ownerId||operation.destination!=='USDTQ:'+quote.id||payout.network!==event.network||quote.network!==event.network)throw new Error('PAYOUT_CONFIRMATION_IDENTITY_CONFLICT');
  // A transaction can finalize after its TRON expiration; expiry must not defeat reconciliation.
  validateSavedPayout(payout,quote,{allowExpired:true});
  if(String(payout.txId).replace(/^0x/,'').toLowerCase()!==event.txId||payout.sender!==event.from||payout.recipient!==event.to||String(payout.amountBaseUnits)!==event.amountBaseUnits)throw new Error('PAYOUT_EXECUTION_MISMATCH');
  const {rows:[prior]}=await tx.query('SELECT fingerprint FROM "PayoutConfirmation" WHERE "payoutId"=$1',[payout.id]);
  const providerReference=`payout:${event.network}:${payout.txId}`;
  if(prior){
   if(prior.fingerprint!==fingerprint||payout.state!=='CONFIRMED'||operation.state!=='COMPLETED')throw new Error('PAYOUT_CONFIRMATION_CONFLICT');
   return settleQuotedUsdtWithdrawalInTransaction(tx,String(quote.id),{outcome:'confirmed',providerReference});
  }
  if(!['SIGNED','BROADCAST_UNKNOWN'].includes(String(payout.state))||operation.state!=='SUBMITTED')throw new Error('PAYOUT_CONFIRMATION_STATE_CONFLICT');
  await tx.query('INSERT INTO "PayoutConfirmation" ("payoutId",fingerprint,evidence) VALUES ($1,$2,$3::jsonb)',[payout.id,fingerprint,JSON.stringify(event)]);
  await tx.query('UPDATE "SignedWithdrawalOutbox" SET state=\'CONFIRMED\' WHERE id=$1',[payout.id]);
  const result=await settleQuotedUsdtWithdrawalInTransaction(tx,String(quote.id),{outcome:'confirmed',providerReference});
  await tx.query('UPDATE "PayoutExpenseReservation" SET state=\'SETTLED\',"settledAt"=statement_timestamp() WHERE "payoutId"=$1 AND state=\'HELD\'',[payout.id]);
  return result;
 });
}
