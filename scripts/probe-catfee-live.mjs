/** Opt-in, build-only read probe. Deliberate nonzero exit prevents site publication.
 * Reads credentials only inside the production build; no purchases, DB or wallet access.
 */
import {createHmac} from 'node:crypto';
const mode=process.env.SIRO_CATFEE_LIVE_READ_PROBE_ONLY;
if(mode==='true'||mode==='market'||mode==='handoff'){
 const key=process.env.CATFEE_API_KEY,secret=process.env.CATFEE_API_SECRET;
 const log=(stage,status,extra={})=>console.log('CATFEE_LIVE_CHECK:'+JSON.stringify({stage,status,...extra}));
 async function request(path,params={},method='GET'){
  if(!((method==='GET'&&['/v1/account','/v1/estimate','/v1/market'].includes(path))||(method==='POST'&&path==='/v1/mate/open/transaction/estimate')))throw Error('PROBE_ROUTE_DENIED');
  const url=new URL(path,'https://api.catfee.io');url.search=new URLSearchParams(params).toString();
  const timestamp=new Date().toISOString();
  const response=await fetch(url,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Accept:'application/json','CF-ACCESS-KEY':key,'CF-ACCESS-TIMESTAMP':timestamp,'CF-ACCESS-SIGN':createHmac('sha256',secret).update(timestamp+method+url.pathname+url.search).digest('base64')}});
  if(!response.ok){log(path,'HTTP_REJECTED',{httpStatus:response.status});throw Error('SAFE_STOP')}
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||!response.body)throw Error('INVALID_RESPONSE');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>65536)throw Error('RESPONSE_LIMIT');chunks.push(r.value)}}finally{await reader.cancel().catch(()=>{})}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(body?.code!==0){log(path,'API_REJECTED',{code:Number.isSafeInteger(body?.code)?body.code:null});throw Error('SAFE_STOP')}
  return body.data;
 }
 try{
  if(!key||!secret)throw Error('MISSING_CREDENTIALS');
  for(const flag of ['SIRO_SIGNER_ENABLED','SIRO_OUTBOX_WORKER_ENABLED','SIRO_ENERGY_PURCHASE_ENABLED','SIRO_BROADCAST_ENABLED'])if(process.env[flag]==='true')throw Error('LIVE_ACTION_GUARD');
  if(mode==='handoff'){
   for(const [resource,quantity] of [['ENERGY',65000],['BANDWIDTH',1000]]){
    const estimate=await request('/v1/mate/open/transaction/estimate',{quantity:String(quantity),resource_type:resource},'POST');
    const amount=estimate?.amount_sun;
    if(estimate?.quantity!==quantity||(!(typeof amount==='number'&&Number.isSafeInteger(amount)&&amount>=0)&&!(typeof amount==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(amount))))throw Error('HANDOFF_ESTIMATE_SCHEMA');
    log('HANDOFF_'+resource,'VERIFIED',{quantity,estimatedSun:String(amount),scope:'ESTIMATE_ONLY_NOT_PURCHASE_PERMISSION'});
   }
  }else if(mode==='market'){
   const market=await request('/v1/market');
   const value=market?.bandwidth_flash_price;
   if(!(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)&&!(typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)))throw Error('BANDWIDTH_MARKET_SCHEMA');
   log('BANDWIDTH_MARKET','VERIFIED',{bandwidthFlashPriceSun:String(value),scope:'FLASH_PRICE_NOT_TRANSACTION_QUOTE'});
  }else{
  const account=await request('/v1/account');
  if(!account||!['number','string'].includes(typeof account.balance))throw Error('ACCOUNT_SCHEMA');
  log('ACCOUNT','AUTHENTICATED');
  const estimate=await request('/v1/estimate',{quantity:'65000',duration:'1h'});
  if(!(typeof estimate==='number'&&Number.isSafeInteger(estimate)&&estimate>0)&&!(typeof estimate==='string'&&/^[1-9][0-9]{0,18}$/.test(estimate)))throw Error('ESTIMATE_SCHEMA');
  log('ENERGY_65000_1H','VERIFIED',{estimatedSun:String(estimate)});
  }
  log('COMPLETE','PASS',{purchases:0,broadcasts:0});
 }catch(e){
  const safe=['MISSING_CREDENTIALS','LIVE_ACTION_GUARD','ACCOUNT_SCHEMA','ESTIMATE_SCHEMA','BANDWIDTH_MARKET_SCHEMA','HANDOFF_ESTIMATE_SCHEMA','PROBE_ROUTE_DENIED','RESPONSE_LIMIT','INVALID_RESPONSE','SAFE_STOP'];
  log('COMPLETE','FAILED',{reason:safe.includes(e?.message)?e.message:'TRANSPORT_OR_RESPONSE_FAILED',purchases:0,broadcasts:0});
 }finally{console.log('CATFEE_PROBE_ONLY:NO_SITE_PUBLICATION_INTENTIONAL_BUILD_STOP');process.exitCode=1}
}
