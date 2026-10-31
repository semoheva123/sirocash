/** Private trusted-ingestion boundary. Never accept receipt/block evidence from public clients. */
import {createHash,randomUUID} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
import {verifyTronUsdtDeposit} from './tron-deposit-verification';
export async function stageTronDeposit(db:WalletDb,input:Parameters<typeof verifyTronUsdtDeposit>[0]) {
 const event=verifyTronUsdtDeposit(input);
 const fingerprint=createHash('sha256').update(JSON.stringify(event)).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  // Beneficiary ownership comes from the durable address assignment, never a supplied user ID.
  const {rows:[assignment]}=await tx.query('SELECT id,"ownerId" FROM "UserDepositAddress" WHERE network=\'TRC20\' AND address=$1 FOR SHARE',[event.to]);
  if(!assignment)throw new Error('UNASSIGNED_DEPOSIT_ADDRESS');
  await tx.query(`INSERT INTO "ChainDepositInbox" (id,"eventKey","addressId","txId","logIndex","blockNumber","blockHash","amountBaseUnits",fingerprint)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT ("eventKey") DO NOTHING`,
   [randomUUID(),event.eventKey,assignment.id,event.txId,event.logIndex,event.blockNumber,event.blockHash,event.amountBaseUnits,fingerprint]);
  const {rows:[row]}=await tx.query('SELECT id,state,fingerprint,"addressId" FROM "ChainDepositInbox" WHERE "eventKey"=$1 FOR UPDATE',[event.eventKey]);
  if(!row||row.fingerprint!==fingerprint||row.addressId!==assignment.id)throw new Error('DEPOSIT_EVIDENCE_CONFLICT');
  return {id:String(row.id),state:String(row.state),ownerId:String(assignment.ownerId),eventKey:event.eventKey};
 });
}
