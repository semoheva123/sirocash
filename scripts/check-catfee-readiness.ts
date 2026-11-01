/** Explicit read-only readiness gate. No account data, purchases, DB writes or broadcast.
 * Default: offline configuration only. CATFEE_READ_CHECK=true opts into two signed GETs.
 * Nonzero means NOT ready for purchases, even when read authentication succeeds.
 */
import {checkCatFeeTraditionalReadiness} from '../lib/catfee-readiness';
async function main(){
 const report=await checkCatFeeTraditionalReadiness({verifyReads:process.env.CATFEE_READ_CHECK==='true'});
 console.log('CATFEE_TRADITIONAL_READINESS:'+JSON.stringify(report));
 if(!report.purchasesReady)process.exitCode=1;
}
main().catch(()=>{console.error('CATFEE_TRADITIONAL_READINESS:FAILED');process.exitCode=1});
