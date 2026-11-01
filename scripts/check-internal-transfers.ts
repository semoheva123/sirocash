import {internalTransfersEnabled} from '../lib/internal-transfer-mode';
import {verifyInternalTransferReadiness} from '../lib/internal-transfer-readiness';
import {financialReadDatabase} from '../lib/financial-database';
async function main(){
 if(!internalTransfersEnabled()){if(process.env.SIRO_INTERNAL_TRANSFERS_ENABLED==='true')throw Error();console.log('Internal transfer preflight: disabled.');return}
 console.log('Internal transfer preflight: '+JSON.stringify(await verifyInternalTransferReadiness(financialReadDatabase())));
}
void main().catch(()=>{console.error('Internal transfer preflight: FAILED (no credentials or account data printed).');process.exitCode=1});
