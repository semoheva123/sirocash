import 'server-only';
import {createHash} from 'node:crypto';
/** Fixed read-only public price source. No customer URL, peg, float arithmetic or secret headers. */
export async function observeUsdtUsdPrice(fetcher:typeof fetch=fetch){
 const controller=new AbortController();
 let rejectDeadline!:(error:Error)=>void;const deadline=new Promise<never>((_,reject)=>{rejectDeadline=reject});
 const timer=setTimeout(()=>{controller.abort();rejectDeadline(Error('PRICE_TIMEOUT'))},5000);
 try{
  const response=await Promise.race([deadline,fetcher('https://api.coinbase.com/v2/prices/USDT-USD/spot',{redirect:'error',cache:'no-store',signal:controller.signal})]);
  if(!response.ok||!response.body)throw Error('PRICE_UNAVAILABLE');
  const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
  try{while(true){const r=await Promise.race([deadline,reader.read()]);if(r.done)break;bytes+=r.value.length;if(bytes>8192){await reader.cancel();throw Error('PRICE_RESPONSE_TOO_LARGE')}chunks.push(r.value)}}finally{void reader.cancel().catch(()=>{});reader.releaseLock()}
  const json=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const d=json?.data;
  if(!d||d.base!=='USDT'||d.currency!=='USD'||typeof d.amount!=='string'||!/^\d{1,2}(\.\d{1,18})?$/.test(d.amount))throw Error('PRICE_INVALID');
  const [whole,fraction='']=d.amount.split('.'),rate=BigInt(whole)*1000000n+BigInt((fraction+'000000').slice(0,6));
  if(rate<=0n||rate>=100000000n)throw Error('PRICE_INVALID');
  const evidence={base:'USDT',currency:'USD',amount:d.amount,source:'https://api.coinbase.com/v2/prices/USDT-USD/spot'};
  return {rate,observedAt:new Date().toISOString(),evidence,evidenceHash:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')};
 }finally{clearTimeout(timer)}
}
/** Append-only observation and quote expiry share the database clock checks. */
export async function persistFinancialPrice(tx:import('./wallet-engine').WalletTx,price:Awaited<ReturnType<typeof observeUsdtUsdPrice>>){
 const {randomUUID}=await import('node:crypto');
 const reference='coinbase:'+randomUUID()+':'+price.evidenceHash;
 const {rows:[row]}=await tx.query('INSERT INTO "FinancialPriceObservation" (id,provider,asset,"rateUsdMicros",evidence,"observedAt","expiresAt") SELECT $1,\'coinbase-spot-v1\',\'USDT\',$2,$3::jsonb,$4::timestamptz,$4::timestamptz+interval \'60 seconds\' WHERE $4::timestamptz<=clock_timestamp() AND $4::timestamptz>clock_timestamp()-interval \'15 seconds\' RETURNING "observedAt","expiresAt"',[reference,price.rate.toString(),JSON.stringify(price.evidence),price.observedAt]);
 if(!row)throw Error('PRICE_OBSERVATION_STALE');
 return {reference,approvedAt:new Date(String(row.observedAt)).toISOString(),expiresAt:new Date(String(row.expiresAt)).toISOString()};
}
