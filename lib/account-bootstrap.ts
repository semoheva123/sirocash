import 'server-only';
import {z} from 'zod';
import {readOwnerFinancialStatus} from './financial-read-status';
import {financialReadDatabase} from './financial-database';
import {customerFinanceEnabled,customerTransfersEnabled,customerWithdrawalsEnabled,customerDepositsEnabled} from './customer-financial-http';
import {depositOnlyMode} from './deposit-only-mode';
import {depositScannerHealthy} from './deposit-scanner-health';
import {database} from './database';
import {publicReceivingIdentity} from './receiving-identity';

/** Request-local reads only. Never cache a customer's snapshot across sessions. */
const recordDate={createdAt:z.string()};
const snapshotSchema=z.object({
 enabled:z.boolean(),readable:z.boolean(),userId:z.string(),
 capabilities:z.object({transfers:z.boolean().optional(),withdrawals:z.boolean(),deposits:z.boolean()}),
 balance:z.object({posted:z.string(),held:z.string()}),
 operations:z.array(z.object({id:z.string(),kind:z.string(),amount:z.string(),feeAmount:z.string(),state:z.string(),...recordDate})),
 activity:z.array(z.object({id:z.string(),amount:z.string(),type:z.string(),status:z.string(),...recordDate})),
 deposits:z.array(z.object({id:z.string(),network:z.string(),txId:z.string(),amountBaseUnits:z.string(),state:z.string(),...recordDate})),
 payouts:z.array(z.object({id:z.string(),operationId:z.string(),network:z.string(),txId:z.string(),state:z.string(),...recordDate})),
 addresses:z.array(z.object({network:z.string(),address:z.string()})),
});
export async function accountBootstrap(user:{id:string}) {
 const [financial,identity]=await Promise.all([
  readOwnerFinancialStatus({authenticate:async()=>user,database:financialReadDatabase,
   enabled:()=>customerFinanceEnabled()||customerTransfersEnabled()||customerDepositsEnabled(),
   transfers:customerTransfersEnabled,withdrawals:customerWithdrawalsEnabled,
   deposits:async()=>customerDepositsEnabled()&&(!depositOnlyMode()||await depositScannerHealthy(financialReadDatabase())),
  }).then(data=>snapshotSchema.parse(JSON.parse(JSON.stringify(data)))).catch(()=>null),
  Promise.resolve().then(()=>database().query('SELECT i.uid,i."displayName",i.username,u."kycStatus" FROM "ReceivingIdentity" i JOIN "User" u ON u.id=i."userId" WHERE i."userId"=$1',[user.id]))
   .then(({rows})=>rows[0]?publicReceivingIdentity(rows[0]):null).catch(()=>null),
 ]);
 return {financial,identity};
}
