import {financialDatabase} from '@/lib/financial-database';
import {productionDepositOnlyWorkers} from '@/lib/deposit-only-runtime';
import {scheduledDepositMonitor} from '@/lib/scheduled-deposit-monitor';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
export const POST=scheduledDepositMonitor({env:process.env,db:financialDatabase,batch:db=>productionDepositOnlyWorkers(db).batch()});
