'use client';
import {createStaticExchangeReader} from '@/lib/static-exchange-client';
import {useEffect,useState} from 'react';
import {useAccountLanguage} from './account-language';
import {exchangeAge,type ExchangeSnapshot} from '@/lib/exchange-reference';

/** Independent static public file. No wallet API, session, database or SSE. */
export function ExchangeTicker(){
 const [ar]=useAccountLanguage(),[snapshot,setSnapshot]=useState<ExchangeSnapshot|null>(null),[loading,setLoading]=useState(true),[moving,setMoving]=useState(true),[clock,setClock]=useState(()=>Date.now());
 useEffect(()=>{
  const reader=createStaticExchangeReader({active:()=>document.visibilityState!=='hidden'&&navigator.onLine,data:data=>{setSnapshot(data);setLoading(false);setClock(Date.now())},unavailable:()=>setLoading(false)});
  const changed=()=>{setMoving(document.visibilityState!=='hidden');if(document.visibilityState==='hidden'||!navigator.onLine)reader.pause();else reader.wake()};
  document.addEventListener('visibilitychange',changed);window.addEventListener('online',changed);window.addEventListener('offline',changed);changed();
  const clock=setInterval(()=>setClock(Date.now()),60000);
  return()=>{reader.stop();clearInterval(clock);document.removeEventListener('visibilitychange',changed);window.removeEventListener('online',changed);window.removeEventListener('offline',changed)};
 },[]);
 return <ExchangeTickerView ar={ar} snapshot={snapshot&&clock-Date.parse(snapshot.fetchedAt)<=86400000?snapshot:null} loading={loading} now={clock} moving={moving}/>;
}
export function ExchangeTickerView({ar,snapshot,loading=false,now,moving=true}:{ar:boolean;snapshot:ExchangeSnapshot|null;loading?:boolean;now:number;moving?:boolean}){
 const t=(a:string,e:string)=>ar?a:e;
 const number=(value:number)=>new Intl.NumberFormat(ar?'ar-SY':'en-US',{maximumFractionDigits:4}).format(value);
 const quotes:React.ReactNode[]=[];
 if(snapshot&&exchangeAge(snapshot.market.updatedAt??snapshot.fetchedAt,now)!=='expired')quotes.push(<span key="market"><bdi>USD / SYP</bdi> {t('السوق · شراء','Market · Buy')} <strong>{number(snapshot.market.buy)}</strong> {t('مبيع','Sell')} <strong>{number(snapshot.market.sell)}</strong> <small>{t('ل.س الجديدة','New SYP')}</small>{exchangeAge(snapshot.market.updatedAt??snapshot.fetchedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 for(const quote of snapshot?.fx??[])if(exchangeAge(quote.updatedAt??snapshot!.fetchedAt,now)!=='expired')quotes.push(<span key={quote.pair}><bdi>{quote.pair.replace('/',' / ')}</bdi> <strong>{number(quote.rate)}</strong>{exchangeAge(quote.updatedAt??snapshot!.fetchedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 const empty=loading?t('جارٍ تحميل أسعار العملات…','Loading exchange rates…'):t('تعذّر تحميل الأسعار','Rates could not be loaded');
 return <section className="exchange-ticker exchange-ticker-animated" data-motion={moving?'running':'paused'} dir={ar?'rtl':'ltr'} aria-label={t('أسعار الصرف المرجعية','Reference exchange rates')}>
  <div className="exchange-ticker-window" tabIndex={0} aria-label={t('أسعار الصرف','Exchange rates')}>
   {quotes.length?<div className="exchange-ticker-track"><div className="exchange-ticker-group">{quotes}</div><div className="exchange-ticker-group" aria-hidden="true">{quotes}</div></div>:<span className="exchange-ticker-empty">{empty}</span>}
  </div>
 </section>;
}
