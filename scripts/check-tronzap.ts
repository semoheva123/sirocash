/** Opt-in read-only server-side check. Never logs credentials or upstream response bodies. */
import {tronZapCredentials,tronZapReadClient,TronZapError} from '../lib/tronzap';
async function main(){
 if(process.env.TRONZAP_READ_CHECK!=='true'){console.log('TronZap read-only check: skipped (not requested).');return}
 try{
  const client=tronZapReadClient(tronZapCredentials());
  const balance=await client.balance();
  console.log('TronZap read-only check: authentication passed; balance '+balance.balance+' TRX. No purchase.');
  const quote=await client.calculateEnergy('TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL',65000);
  console.log('TronZap read-only check: 65000 energy / 1 hour, price '+quote.price+' TRX, activation '+quote.activation_fee+' TRX, total '+quote.total+' TRX. Estimate only; not a price lock.');
 }catch(error){console.error('TronZap read-only check FAILED: '+(error instanceof TronZapError?error.kind:'INTERNAL')+'. No credentials or upstream body logged; no purchase.');process.exitCode=1}
}
main().catch(()=>{console.error('TronZap read-only check FAILED.');process.exitCode=1});
