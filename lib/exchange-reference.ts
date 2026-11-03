import {z} from 'zod';

// Informational feed only. Never import this module into financial execution/valuation.
export const EXCHANGE_REFRESH_MS=8*60*60*1000;
export const EXCHANGE_STALE_MS=16*60*60*1000;
export const EXCHANGE_EXPIRE_MS=7*24*60*60*1000;
const price=z.number().finite().positive().max(1e12);
const stamp=z.string().datetime({offset:true});
export const exchangeSnapshotSchema=z.object({
 source:z.literal('sp-today'),city:z.literal('damascus'),unit:z.literal('SYP_NEW'),
 market:z.object({buy:price,sell:price,updatedAt:stamp}).refine(v=>v.buy<=v.sell),
 fx:z.array(z.object({pair:z.enum(['USD/TRY','EUR/USD']),rate:price,updatedAt:stamp})).max(2),
 fetchedAt:stamp,
});
export type ExchangeSnapshot=z.infer<typeof exchangeSnapshotSchema>;
const overview=z.object({ok:z.literal(true),data:z.object({
 rates:z.array(z.object({code:z.string(),cities:z.record(z.string(),z.unknown()),updated_at:stamp})).max(1000),
 global_fx:z.array(z.object({pair:z.string(),rate:price})).max(1000),updated_at:stamp,
})});
/** Values are NEW SYP, as confirmed by the account owner with the provider (2026-11-03).
 * No unit conversion, inferred "official" price, mid-price, or fixture fallback. */
export function parseExchangeOverview(raw:unknown,now:Date):ExchangeSnapshot{
 const {data}=overview.parse(raw),usd=data.rates.filter(r=>r.code==='USD');
 if(usd.length!==1)throw Error('EXCHANGE_INVALID');
 const market=z.object({buy:price,sell:price}).parse(usd[0].cities.damascus);
 const fx=(['USD/TRY','EUR/USD'] as const).flatMap(pair=>{
  const rows=data.global_fx.filter(r=>r.pair===pair);
  if(rows.length>1)throw Error('EXCHANGE_INVALID');
  return rows.map(row=>({pair,rate:row.rate,updatedAt:data.updated_at}));
 });
 const result=exchangeSnapshotSchema.parse({source:'sp-today',city:'damascus',unit:'SYP_NEW',market:{...market,updatedAt:usd[0].updated_at},fx,fetchedAt:now.toISOString()});
 for(const date of [result.market.updatedAt,...result.fx.map(r=>r.updatedAt)]){
  const at=Date.parse(date);
  if(at<Date.UTC(2000,0,1)||at>now.getTime()+5*60*1000)throw Error('EXCHANGE_INVALID');
 }
 return result;
}
export function exchangeAge(at:string,now:number):'reference'|'stale'|'expired'{
 const age=now-Date.parse(at);
 return !Number.isFinite(age)||age< -5*60*1000||age>EXCHANGE_EXPIRE_MS?'expired':age>EXCHANGE_STALE_MS?'stale':'reference';
}
