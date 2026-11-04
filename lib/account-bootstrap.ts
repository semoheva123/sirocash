import 'server-only';
import {measureAccountRead} from './account-read-diagnostics';
import {z} from 'zod';
import {readOwnerFinancialStatus} from './financial-read-status';
import {financialReadDatabase,sharedFinancialSnapshot} from './financial-database';
import {customerFinanceEnabled,customerTransfersEnabled,customerWithdrawalsEnabled,customerDepositsEnabled} from './customer-financial-http';
import {depositOnlyMode} from './deposit-only-mode';
import {depositScannerHealthy} from './deposit-scanner-health';
import {database} from './database';
import {publicReceivingIdentity} from './receiving-identity';

/** Authenticated reads; only concurrent same-owner reads share a pending promise. No settled snapshot cache. */
const recordDate={createdAt:z.string()};
const parties={senderUid:z.string().nullable().optional(),senderName:z.string().nullable().optional(),senderUsername:z.string().nullable().optional(),recipientUid:z.string().nullable().optional(),recipientName:z.string().nullable().optional(),recipientUsername:z.string().nullable().optional()};
const snapshotSchema=z.object({
 enabled:z.boolean(),readable:z.boolean(),userId:z.string(),
 capabilities:z.object({transfers:z.boolean().optional(),withdrawals:z.boolean(),deposits:z.boolean()}),
 balance:z.object({posted:z.string(),held:z.string()}),
 operations:z.array(z.object({id:z.string(),kind:z.string(),amount:z.string(),feeAmount:z.string(),state:z.string(),...recordDate,...parties})),
 activity:z.array(z.object({id:z.string(),amount:z.string(),type:z.string(),status:z.string(),...recordDate,...parties})),
 deposits:z.array(z.object({id:z.string(),network:z.string(),txId:z.string(),amountBaseUnits:z.string(),state:z.string(),...recordDate,...parties})),
 payouts:z.array(z.object({id:z.string(),operationId:z.string(),network:z.string(),txId:z.string(),state:z.string(),...recordDate,...parties})),
 addresses:z.array(z.object({network:z.string(),address:z.string()})),
});
export async function accountBootstrap(user:{id:string}) {
 const [financial,identity]=await Promise.all([
  measureAccountRead('financial-bootstrap',()=>readOwnerFinancialStatus({authenticate:async()=>user,database:financialReadDatabase,snapshot:sharedFinancialSnapshot,
   enabled:()=>customerFinanceEnabled()||customerTransfersEnabled()||customerDepositsEnabled(),
   transfers:customerTransfersEnabled,withdrawals:customerWithdrawalsEnabled,
   deposits:async()=>customerDepositsEnabled()&&(!depositOnlyMode()||await depositScannerHealthy(financialReadDatabase())),
  }).then(data=>snapshotSchema.parse(JSON.parse(JSON.stringify(data))))).catch(()=>null),
  measureAccountRead('identity-bootstrap',()=>Promise.resolve().then(()=>database().query('SELECT i.uid,i."displayName",i.username,u."kycStatus" FROM "ReceivingIdentity" i JOIN "User" u ON u.id=i."userId" WHERE i."userId"=$1',[user.id]))
   .then(({rows})=>rows[0]?publicReceivingIdentity(rows[0]):null)).catch(()=>null),
 ]);
 return {financial,identity};
}
