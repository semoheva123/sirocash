/** Explicit read-only check. Never prints credentials/account data or invokes purchases. */
import {catFeeCredentials,catFeeReadClient} from '../lib/catfee';
async function main(){
 if(process.env.CATFEE_READ_CHECK!=='true'){console.log('CatFee read-only check: SKIPPED');return}
 const read=catFeeReadClient(catFeeCredentials());
 await read.balance();const cost=await read.estimate(65000);
 console.log('CatFee read-only authentication: PASS. Energy-only 65000 / 1h estimate SUN='+cost+'. Not a price lock, activation/bandwidth total or funded acceptance. No purchase.');
}
main().catch(()=>{console.error('CatFee read-only check: FAILED (no secret/upstream body printed)');process.exitCode=1});
