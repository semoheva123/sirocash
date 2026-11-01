import {depositOnlyMode} from '../lib/deposit-only-mode';
import {financialReadDatabase} from '../lib/financial-database';
import {verifyDepositMonitorReadiness} from '../lib/deposit-monitor-readiness';
async function main(){
 if(!depositOnlyMode()||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true'){console.log('Deposit monitor preflight: disabled.');return}
 console.log('Deposit monitor preflight: '+JSON.stringify(await verifyDepositMonitorReadiness(financialReadDatabase())));
}
void main().catch(()=>{console.error('Deposit monitor preflight: FAILED (credentials and account data omitted).');process.exitCode=1});
