'use client';
import {useEffect,useState} from 'react';
import {ChevronDown,ChevronLeft,ChevronRight,ChartNoAxesCombined} from 'lucide-react';
import {useAccountLanguage} from './account-language';
import {exchangeAge,exchangeSnapshotSchema,type ExchangeSnapshot} from '@/lib/exchange-reference';

/** One authenticated read per layout mount; no polling, marquee, trade action, or
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
 const time=(at:string)=><time dateTime={at}>{new Intl.DateTimeFormat(ar?'ar-SY':'en-GB',{timeZone:'Asia/Damascus',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(at))} {t('دمشق','Damascus')}</time>;
 const unavailable=loading?t('جارٍ التحميل','Loading'):t('غير متاح','Unavailable');
 const values=(at:string,content:React.ReactNode)=>{
  const state=exchangeAge(at,now);
  return <>{state==='expired'?<strong>{t('غير متاح — انتهت صلاحية البيانات','Unavailable — data expired')}</strong>:<strong>{content}</strong>}<small className={state==='reference'?'':'exchange-ticker-stale'}>{state==='stale'?t('بيانات قديمة · ','Stale · '):state==='expired'?'':t('مرجعي · ','Reference · ')}{time(at)}</small></>;
 };
 return <section className="exchange-ticker" dir={ar?'rtl':'ltr'} aria-label={t('أسعار الصرف المرجعية','Reference exchange rates')}>
  <div className="exchange-ticker-heading"><span><ChartNoAxesCombined size={15}/>{t('مؤشر العملات','FX reference')}</span><small>{t('مرّر للاطلاع','Scroll to explore')} {ar?<ChevronLeft size={12}/>:<ChevronRight size={12}/>}</small></div>
  <div className="exchange-ticker-strip" tabIndex={0} role="region" aria-label={t('أسعار العملات — تمرير أفقي','Exchange rates — horizontally scrollable')}>
   <article><span><bdi>USD / SYP</bdi> · {t('السوق — دمشق','Market — Damascus')}</span>{snapshot?values(snapshot.market.updatedAt,<><em>{t('شراء','Buy')}</em> {number(snapshot.market.buy)} <i>/</i> <em>{t('مبيع','Sell')}</em> {number(snapshot.market.sell)}</>):<strong>{unavailable}</strong>}<small>{t('ل.س الجديدة لكل 1 دولار','New SYP per 1 USD')}</small></article>
   <article><span><bdi>USD / SYP</bdi> · {t('الرسمي','Official')}</span><strong>{t('غير متاح','Unavailable')}</strong><small>{t('بانتظار مصدر رسمي موثّق','Verified official source required')}</small></article>
   {(['USD/TRY','EUR/USD'] as const).map(pair=>{
    const quote=snapshot?.fx.find(f=>f.pair===pair);
    return <article key={pair}><span><bdi>{pair.replace('/',' / ')}</bdi> · {t('عالمي','Global')}</span>{quote?values(quote.updatedAt,<bdi>{number(quote.rate)}</bdi>):<strong>{unavailable}</strong>}<small>{pair==='USD/TRY'?t('ليرة تركية لكل 1 دولار','TRY per 1 USD'):t('دولار لكل 1 يورو','USD per 1 EUR')}</small></article>;
   })}
  </div>
  <details className="exchange-ticker-details"><summary>{t('المصدر: الليرة اليوم · تفاصيل التحديث','Source: SP Today · Update details')}<ChevronDown size={12}/></summary><p>{t('المصدر: الليرة اليوم — مزوّد مستقل لأسعار السوق، وليس المصرف المركزي. القيم السورية بالليرة الجديدة دون تحويل. تُجلب لقطة مشتركة عند زيارة الحساب، بحد أقصى مرة كل 8 ساعات ضمن الحصة المجانية؛ ليست أسعارًا لحظية. يُعرض وقت السعر كما يرسله المصدر بتوقيت دمشق. الأسعار للاستدلال فقط ولا تغيّر تنفيذ العمليات أو الرسوم.','Source: SP Today — an independent market-data provider, not the central bank. Syrian prices are in new SYP without conversion. A shared snapshot is fetched on account visits, at most once every 8 hours within the free quota; these are not live quotes. Source timestamps are displayed in Damascus time. Reference only; execution prices and fees are unaffected.')} <a href="https://sp-today.com/" target="_blank" rel="noopener noreferrer">{t('زيارة المصدر','Visit source')} ↗</a></p></details>
 </section>;
}
