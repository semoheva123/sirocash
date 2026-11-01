/** Build-only diagnostic. Intentional failure prevents publication. Default: no-op. */
import {tronRentalReadClient} from '../lib/tronrental-read';
async function main(){
if(process.env.SIRO_TRONRENTAL_LIVE_READ_PROBE_ONLY==='true'){
 const log=(stage:string,status:string,extra:Record<string,unknown>={})=>console.log('TRONRENTAL_LIVE_CHECK:'+JSON.stringify({stage,status,...extra}));
 try{
  for(const flag of ['SIRO_SIGNER_ENABLED','SIRO_OUTBOX_WORKER_ENABLED','SIRO_ENERGY_PURCHASE_ENABLED','SIRO_BROADCAST_ENABLED'])if(process.env[flag]==='true')throw Error('LIVE_ACTION_GUARD');
  const client=tronRentalReadClient(process.env.TRONRENTAL_API_KEY??'');
  const signal=AbortSignal.timeout(25000);
  const balance=await client.balance(signal);log('ACCOUNT','AUTHENTICATED',{balanceSun:balance.toString()});
  const quote=await client.bandwidthQuote(1000,signal);
  log('BANDWIDTH_1000_1H','VERIFIED',{costSun:quote.costSun.toString(),fixedFeeSun:quote.fixedFeeSun.toString(),scope:'READ_ONLY_NOT_PURCHASE_PERMISSION'});
  log('COMPLETE','PASS',{purchases:0,broadcasts:0});
 }catch(e){
  const reason=e instanceof Error&&/^(TRONRENTAL_(CREDENTIALS|AUTH|PERMISSION|HTTP|TRANSPORT|SCHEMA|LIMIT|VOLUME|QUOTE_BINDING|ROUTE)|LIVE_ACTION_GUARD)$/.test(e.message)?e.message:'SAFE_STOP';
  log('COMPLETE','FAILED',{reason,purchases:0,broadcasts:0});
 }finally{console.log('TRONRENTAL_PROBE_ONLY:NO_SITE_PUBLICATION_INTENTIONAL_BUILD_STOP');process.exitCode=1}
}

}
void main().catch(()=>{console.error("TRONRENTAL_PROBE_FAILED");process.exitCode=1});
