import {computeAddress} from 'ethers';
import {runCustodyPreflight,runBep20DepositPreflight} from '../lib/custody-preflight';
import {treasuryDestination} from '../lib/treasury-addresses';
/** Deliberately non-deploying production BUILD probe. No secret outputs, signing, DB or network.
 * This script ALWAYS exits unsuccessfully so Vercel cannot promote the probe to live traffic.
 */
if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_SIGNER_ENABLED!=='false'){
 console.log('CUSTODY_PROBE_REFUSED_REQUIRES_DISABLED_PRODUCTION_SIGNER');
}else{
 const checks=[
  ['TRC20_CUSTODY',()=>runCustodyPreflight({...process.env,SIRO_CUSTODY_PREFLIGHT:'true',SIRO_TRC20_DEPOSIT_FIRST_ADDRESS:'THici1qxA1dQZK52fJ18RHX8j1Ef1ktyDD'})],
  ['BEP20_DEPOSIT',()=>runBep20DepositPreflight({...process.env,SIRO_BEP20_CUSTODY_PREFLIGHT:'true',SIRO_BEP20_DEPOSIT_FIRST_ADDRESS:'0x6CD3350E7E635079038b6348781934e4040aC99b'})],
  ['BEP20_OPERATING',()=>{
   const key=process.env.SIRO_BEP20_OPERATING_PRIVATE_KEY;
   if(!key)throw new Error('CUSTODY_PREFLIGHT_CONFIGURATION_MISSING');
   if(!/^(0x)?[a-fA-F0-9]{64}$/.test(key)||computeAddress('0x'+key.replace(/^0x/,'')).toLowerCase()!==treasuryDestination('BEP20','operating').toLowerCase())throw new Error('CUSTODY_KEY_BINDING_CHECK_FAILED');
   return {operatingKeyMatched:true,signingEnabled:false};
  }],
 ] as const;
 for(const [stage,run] of checks){
  try{run();console.log(stage+':MATCHED_NO_SIGNING')}
  catch(error){const code=error instanceof Error&&['CUSTODY_PREFLIGHT_CONFIGURATION_MISSING','CUSTODY_KEY_BINDING_CHECK_FAILED'].includes(error.message)?error.message:'CHECK_FAILED';console.log(stage+':'+code)}
 }
 console.log('CUSTODY_PROBE_COMPLETE_NO_DEPLOYMENT');
}
process.exitCode=1;
