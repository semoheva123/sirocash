import 'server-only';
/** Read-only boundary. No order creation, withdrawal, activation or subscriptions. */
export function tronRentalSun(value:unknown):bigint {
 if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,12})(\.[0-9]{1,6})?$/.test(value))throw Error('TRONRENTAL_SCHEMA');
 const [whole,part='']=value.split('.');return BigInt(whole)*1000000n+BigInt(part.padEnd(6,'0'));
}
export function tronRentalReadClient(key:string,transport:typeof fetch=fetch){
 if(!key||key.length>4096||/[\s\x00-\x1f\x7f]/.test(key))throw Error('TRONRENTAL_CREDENTIALS');
 async function request(path:'/v1/account/balance'|'/v1/bandwidth/quote',query:Record<string,string>,signal:AbortSignal){
  if(!['/v1/account/balance','/v1/bandwidth/quote'].includes(path))throw Error('TRONRENTAL_ROUTE');
  const url=new URL(path,'https://api.tronrental.com');url.search=new URLSearchParams(query).toString();
  let response:Response;
  try{response=await transport(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),headers:{Accept:'application/json','X-API-Key':key}})}catch{throw Error('TRONRENTAL_TRANSPORT')}
  if(!response.ok)throw Error(response.status===401?'TRONRENTAL_AUTH':response.status===403?'TRONRENTAL_PERMISSION':'TRONRENTAL_HTTP');
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||!response.body)throw Error('TRONRENTAL_SCHEMA');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>65536)throw Error('TRONRENTAL_LIMIT');chunks.push(r.value)}}finally{await reader.cancel().catch(()=>{})}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Error('TRONRENTAL_SCHEMA')}
 }
 return {
  async balance(signal:AbortSignal){const data=await request('/v1/account/balance',{},signal);return tronRentalSun(data?.balance_trx)},
  async bandwidthQuote(volume:number,signal:AbortSignal){
   if(!Number.isSafeInteger(volume)||volume<1||volume>100000)throw Error('TRONRENTAL_VOLUME');
   const expiresAt=Date.now()+25000;
   const data=await request('/v1/bandwidth/quote',{volume:String(volume),duration:'1h'},signal);
   // Public-price fallback is NOT evidence that the supplied key authenticated.
   if(data?.volume!==volume||data.duration!=='1h'||data.personal_price!==true)throw Error('TRONRENTAL_QUOTE_BINDING');
   const rentalSun=tronRentalSun(data.rental_trx),fixedFeeSun=tronRentalSun(data.fixed_fee_trx),costSun=tronRentalSun(data.total_trx);
   if(costSun<=0n||costSun!==rentalSun+fixedFeeSun||Date.now()>=expiresAt)throw Error('TRONRENTAL_QUOTE_BINDING');
   return {volume,duration:'1h' as const,costSun,rentalSun,fixedFeeSun,expiresAt};
  },
 };
}
