import 'server-only';
import {catFeeCredentials,catFeeReadClient} from './catfee';

/** Reviewed traditional rental contract, not Seamless and not an operator override.
 * A quote is not an enforceable provider-side maximum charge. Manual top-up changes
 * funding only. Explicit direct mode permits energy purchase without a price lock;
 * existing on-chain Bandwidth coverage remains mandatory before dispatch.
 */
export const CATFEE_PRICE_BLOCKER='CATFEE_HARD_PRICE_CAP_UNVERIFIED';
export const CATFEE_BANDWIDTH_BLOCKER='CATFEE_BANDWIDTH_EXECUTION_UNVERIFIED';
export type CatFeeReadiness={
 mode:'TRADITIONAL_RENTAL';funding:'MANUAL_TOP_UP';seamlessRequired:false;
 directRentalEnabled:boolean;priceLocked:false;credentialsConfigured:boolean;readCheck:'NOT_REQUESTED'|'MISSING_CREDENTIALS'|'VERIFIED'|'FAILED';
 estimatedEnergyWithinPerOrderCap:boolean|null;
 purchasesReady:false;blockers:string[];
 // Policy disclosure only, not evidence of a configured/enabled DB purchase policy.
 policy:{perOrderSun:string;dailySun:string;nativeBurnFallback:false};
};
export async function checkCatFeeTraditionalReadiness(options:{
 env?:Record<string,string|undefined>;verifyReads?:boolean;fetch?:typeof fetch;signal?:AbortSignal;
}={}):Promise<CatFeeReadiness>{
 const env=options.env??process.env,directRentalEnabled=env.SIRO_CATFEE_DIRECT_RENTAL_ENABLED==='true';
 const report:CatFeeReadiness={mode:'TRADITIONAL_RENTAL',funding:'MANUAL_TOP_UP',seamlessRequired:false,
  directRentalEnabled,priceLocked:false,credentialsConfigured:!!env.CATFEE_API_KEY&&!!env.CATFEE_API_SECRET,readCheck:'NOT_REQUESTED',
  estimatedEnergyWithinPerOrderCap:null,purchasesReady:false,
  blockers:[...(directRentalEnabled?['CATFEE_CURRENT_BANDWIDTH_REQUIRED']:[CATFEE_PRICE_BLOCKER,CATFEE_BANDWIDTH_BLOCKER]),'CATFEE_FUNDED_ACCEPTANCE_REQUIRED'],
  policy:{perOrderSun:'50000000',dailySun:'200000000',nativeBurnFallback:false}};
 if(!report.credentialsConfigured){report.readCheck='MISSING_CREDENTIALS';report.blockers.push('CATFEE_CONFIGURATION');return report}
 if(!options.verifyReads)return report;
 try{
  const credentials=catFeeCredentials(env),read=catFeeReadClient(credentials,options.fetch);
  const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000);
  // Authentication/schema validation only: never expose balance, account or recharge address.
  // Do not infer affordability from unverified account-unit or billing semantics.
  await read.balance(signal);
  const estimate=await read.estimate(65000,signal);
  report.readCheck='VERIFIED';report.estimatedEnergyWithinPerOrderCap=estimate<=50000000n;
  if(!report.estimatedEnergyWithinPerOrderCap)report.blockers.push('CATFEE_ESTIMATE_EXCEEDS_POLICY');
 }catch{
  report.readCheck='FAILED';report.blockers.push('CATFEE_READ_UNVERIFIED');
 }
 return report;
}
