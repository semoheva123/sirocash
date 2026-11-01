import 'server-only';
import {internalTransfersEnabled} from './internal-transfer-mode';
import type {WalletDb} from './wallet-engine';
/** Read-only deployment check. No bootstrap credit, user impersonation or test transfer. */
export async function verifyInternalTransferReadiness(db:WalletDb,env:Record<string,string|undefined>=process.env){
 if(!internalTransfersEnabled(env))throw Error('INTERNAL_TRANSFERS_DISABLED');
 const origin=new URL(env.WEBAUTHN_ORIGIN??'');
 if(origin.protocol!=='https:'||origin.origin!==env.WEBAUTHN_ORIGIN)throw Error('INTERNAL_TRANSFER_ORIGIN');
 const ids=[env.SIRO_FEE_ACCOUNT_ID,env.SIRO_SETTLEMENT_ACCOUNT_ID];
 if(ids.some(id=>!id||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))||ids[0]===ids[1])throw Error('INTERNAL_TRANSFER_ACCOUNTS');
 await db.transaction(async tx=>{
  const {rows:[r]}=await tx.query('SELECT count(*)::int AS total FROM "LedgerAccount" WHERE id=ANY($1::uuid[]) AND "userId" IS NULL AND "accountType"=\'MASTER_POOL\' AND currency=\'USD\'',[ids]);
  if(Number(r?.total)!==2)throw Error('INTERNAL_TRANSFER_FEE_POOL_UNVERIFIED');
  const {rows:[journal]}=await tx.query('SELECT NOT EXISTS(SELECT 1 FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM(amount)<>0) AS balanced');
  if(journal?.balanced!==true)throw Error('INTERNAL_TRANSFER_JOURNAL_UNBALANCED');
 });
 return {status:'VERIFIED',ledgerOnly:true,feePolicy:'INTERNAL_SENDER_1PCT',deviceApprovalRequired:true,externalExecutionRequired:false} as const;
}
