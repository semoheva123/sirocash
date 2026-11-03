'use client';
import {useEffect,useState} from 'react';
import {useAccountLanguage} from './account-language';
import {exchangeAge,exchangeSnapshotSchema,type ExchangeSnapshot} from '@/lib/exchange-reference';

/** One authenticated read per layout mount; no polling or trade action, or
 * connection to balance/valuation. A local clock ages data without network traffic. */
export function ExchangeTicker(){
 const [ar]=useAccountLanguage(),[snapshot,setSnapshot]=useState<ExchangeSnapshot|null>(null),[loading,setLoading]=useState(true);
 const [clock,setClock]=useState(()=>Date.now());
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/exchange-rates',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
   .then(async r=>{if(!r.ok)throw Error();const body=await r.json();const parsed=exchangeSnapshotSchema.safeParse(body.snapshot);if(parsed.success)setSnapshot(parsed.data)})
   .catch(()=>{}).finally(()=>{if(!controller.signal.aborted){setLoading(false);setClock(Date.now())}});
  const timer=setInterval(()=>setClock(Date.now()),60000);
  return()=>{controller.abort();clearInterval(timer)};
 },[]);
 return <ExchangeTickerView ar={ar} snapshot={snapshot} loading={loading} now={clock}/>;
}
export function ExchangeTickerView({ar,snapshot,loading=false,now}:{ar:boolean;snapshot:ExchangeSnapshot|null;loading?:boolean;now:number}){
 const t=(a:string,e:string)=>ar?a:e;
 const number=(value:number)=>new Intl.NumberFormat(ar?'ar-SY':'en-US',{maximumFractionDigits:4}).format(value);
 const quotes:React.ReactNode[]=[];
 if(snapshot&&exchangeAge(snapshot.market.updatedAt,now)!=='expired')quotes.push(<span key="market"><bdi>USD / SYP</bdi> {t('السوق · شراء','Market · Buy')} <strong>{number(snapshot.market.buy)}</strong> {t('مبيع','Sell')} <strong>{number(snapshot.market.sell)}</strong> <small>{t('ل.س الجديدة','New SYP')}</small>{exchangeAge(snapshot.market.updatedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 for(const quote of snapshot?.fx??[])if(exchangeAge(quote.updatedAt,now)!=='expired')quotes.push(<span key={quote.pair}><bdi>{quote.pair.replace('/',' / ')}</bdi> <strong>{number(quote.rate)}</strong>{exchangeAge(quote.updatedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 const empty=loading?t('جارٍ تحميل أسعار العملات…','Loading exchange rates…'):t('تعذّر تحميل الأسعار','Rates could not be loaded');
 return <section className="exchange-ticker" dir={ar?'rtl':'ltr'} aria-label={t('أسعار الصرف المرجعية','Reference exchange rates')}>
  <div className="exchange-ticker-window" tabIndex={0} aria-label={t('شريط أسعار متحرك؛ أوقف الحركة للقراءة','Moving rate ticker; pause to read')}>
   {quotes.length?<div className="exchange-ticker-track"><div className="exchange-ticker-group">{quotes}</div><div className="exchange-ticker-group" aria-hidden="true">{quotes}</div></div>:<span className="exchange-ticker-empty">{empty}</span>}
  </div>
 </section>;
}
