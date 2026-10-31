import 'server-only';
import {createHash} from 'node:crypto';
import {creditConfirmedDepositInTransaction,moneyString,type WalletDb} from './wallet-engine';
/** Private composition only. No default peg, customer price, quote fetch or runtime posting grant.
 * A separate approved pricing authority must populate the valuation row from reviewed evidence.
 */
export async function postValuedDeposit(db:WalletDb,inboxId:string){
 if(!/^[a-f0-9-]{36}$/i.test(inboxId))throw new Error('INVALID_DEPOSIT_ID');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[inbox]}=await tx.query('SELECT * FROM "ChainDepositInbox" WHERE id=$1 FOR UPDATE',[inboxId]);
  if(!inbox)throw new Error('DEPOSIT_NOT_FOUND');
  const {rows:[value]}=await tx.query('SELECT *,"approvedAt"<=statement_timestamp() AND "expiresAt">statement_timestamp() AS fresh FROM "ApprovedDepositValuation" WHERE "inboxId"=$1 FOR UPDATE',[inboxId]);
  if(!value)throw new Error('DEPOSIT_VALUATION_REQUIRED');
  if(value.inboxFingerprint!==inbox.fingerprint||value.policy!=='floor-usd-micros-v1')throw new Error('DEPOSIT_VALUATION_CONFLICT');
  const {rows:[assignment]}=await tx.query('SELECT "ownerId",network FROM "UserDepositAddress" WHERE id=$1 FOR SHARE',[inbox.addressId]);
  if(!assignment||assignment.network!==inbox.network||!['TRC20','BEP20'].includes(String(inbox.network)))throw new Error('DEPOSIT_ASSIGNMENT_CONFLICT');
  const decimals=inbox.network==='TRC20'?6n:18n;
  const usdMicros=BigInt(String(inbox.amountBaseUnits))*BigInt(String(value.rateUsdMicrosPerToken))/(10n**decimals);
  if(usdMicros<=0n||usdMicros>100000n*1000000n)throw new Error('DEPOSIT_VALUATION_OUT_OF_BOUNDS');
  if(inbox.state==='CREDITED'){
   const {rows:[operation]}=await tx.query('SELECT id,state,"transactionId",amount FROM "WalletOperation" WHERE id=$1 AND "ownerId"=$2 AND "externalReference"=$3 AND kind=\'DEPOSIT\'',[value.operationId,assignment.ownerId,inbox.eventKey]);
   if(!operation||operation.state!=='COMPLETED'||String(operation.amount)!==moneyString(usdMicros))throw new Error('DEPOSIT_POSTING_CONFLICT');
   return {id:String(operation.id),transactionId:String(operation.transactionId),amount:moneyString(usdMicros),state:'COMPLETED' as const};
  }
  if(inbox.state!=='AWAITING_VALUATION'||value.operationId||value.fresh!==true)throw new Error('DEPOSIT_VALUATION_EXPIRED_OR_INVALID_STATE');
  const posted=await creditConfirmedDepositInTransaction(tx,{ownerId:String(assignment.ownerId),requestKey:'deposit:'+createHash('sha256').update(String(inbox.eventKey)).digest('hex'),amount:moneyString(usdMicros),providerReference:String(inbox.eventKey),settlementAccountId:String(value.settlementAccountId)});
  await tx.query('UPDATE "ApprovedDepositValuation" SET "operationId"=$2 WHERE "inboxId"=$1',[inboxId,posted.id]);
  await tx.query('UPDATE "ChainDepositInbox" SET state=\'CREDITED\' WHERE id=$1',[inboxId]);
  return {id:posted.id,transactionId:String(posted.transactionId),amount:posted.amount,state:'COMPLETED' as const};
 });
}
