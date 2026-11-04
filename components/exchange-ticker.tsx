'use client';
import {useEffect,useState} from 'react';
import {createFinancialStream} from '@/lib/financial-stream-client';
import {useAccountLanguage} from './account-language';
import {exchangeAge,exchangeSnapshotSchema,type ExchangeSnapshot} from '@/lib/exchange-reference';

/** Shared committed public-feed snapshots through authenticated SSE, never polling.
 * A local clock ages observations without network traffic. No financial integration. */
export function ExchangeTicker(){
 const [ar]=useAccountLanguage(),[snapshot,setSnapshot]=useState<ExchangeSnapshot|null>(null),[loading,setLoading]=useState(true);
 const [clock,setClock]=useState(()=>Date.now());
 useEffect(()=>{
  const stream=createFinancialStream<{enabled:boolean;userId:string;snapshot:unknown}>({
   active:()=>document.visibilityState!=='hidden'&&navigator.onLine,
   open:()=>new EventSource('/api/exchange-rates/events'),
   data:body=>{const parsed=exchangeSnapshotSchema.safeParse(body.snapshot);setSnapshot(parsed.success?parsed.data:null);setLoading(false);setClock(Date.now())},
   state:state=>{if(state==='unauthenticated'){setSnapshot(null);setLoading(false)}},
  });
  const changed=()=>{if(document.visibilityState==='hidden'||!navigator.onLine)stream.pause();else stream.wake()};
  document.addEventListener('visibilitychange',changed);window.addEventListener('online',changed);window.addEventListener('offline',changed);window.addEventListener('focus',changed);stream.wake();
  const timer=setInterval(()=>setClock(Date.now()),60000);
  return()=>{stream.stop();clearInterval(timer);document.removeEventListener('visibilitychange',changed);window.removeEventListener('online',changed);window.removeEventListener('offline',changed);window.removeEventListener('focus',changed)};
 },[]);
 return <ExchangeTickerView ar={ar} snapshot={snapshot} loading={loading} now={clock}/>;
}
export function ExchangeTickerView({ar,snapshot,loading=false,now}:{ar:boolean;snapshot:ExchangeSnapshot|null;loading?:boolean;now:number}){
 const t=(a:string,e:string)=>ar?a:e;
 const number=(value:number)=>new Intl.NumberFormat(ar?'ar-SY':'en-US',{maximumFractionDigits:4}).format(value);
 const quotes:React.ReactNode[]=[];
 if(snapshot&&exchangeAge(snapshot.market.updatedAt??snapshot.fetchedAt,now)!=='expired')quotes.push(<span key="market"><bdi>USD / SYP</bdi> {t('السوق · شراء','Market · Buy')} <strong>{number(snapshot.market.buy)}</strong> {t('مبيع','Sell')} <strong>{number(snapshot.market.sell)}</strong> <small>{t('ل.س الجديدة','New SYP')}</small>{exchangeAge(snapshot.market.updatedAt??snapshot.fetchedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 for(const quote of snapshot?.fx??[])if(exchangeAge(quote.updatedAt??snapshot!.fetchedAt,now)!=='expired')quotes.push(<span key={quote.pair}><bdi>{quote.pair.replace('/',' / ')}</bdi> <strong>{number(quote.rate)}</strong>{exchangeAge(quote.updatedAt??snapshot!.fetchedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 const empty=loading?t('جارٍ تحميل أسعار العملات…','Loading exchange rates…'):t('تعذّر تحميل الأسعار','Rates could not be loaded');
 return <section className="exchange-ticker" dir={ar?'rtl':'ltr'} aria-label={t('أسعار الصرف المرجعية','Reference exchange rates')}>
  <div className="exchange-ticker-window" tabIndex={0} aria-label={t('شريط أسعار متحرك؛ أوقف الحركة للقراءة','Moving rate ticker; pause to read')}>
   {quotes.length?<div className="exchange-ticker-track"><div className="exchange-ticker-group">{quotes}</div><div className="exchange-ticker-group" aria-hidden="true">{quotes}</div></div>:<span className="exchange-ticker-empty">{empty}</span>}
  </div>
 </section>;
}
