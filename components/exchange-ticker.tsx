'use client';
import {useEffect,useState,useRef} from 'react';
import {Info,Pause,Play,X} from 'lucide-react';
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
 const [paused,setPaused]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 const t=(a:string,e:string)=>ar?a:e;
 const number=(value:number)=>new Intl.NumberFormat(ar?'ar-SY':'en-US',{maximumFractionDigits:4}).format(value);
 const time=(at:string)=><time dateTime={at}>{new Intl.DateTimeFormat(ar?'ar-SY':'en-GB',{timeZone:'Asia/Damascus',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(at))} {t('دمشق','Damascus')}</time>;
 const quotes:React.ReactNode[]=[];
 if(snapshot&&exchangeAge(snapshot.market.updatedAt,now)!=='expired')quotes.push(<span key="market"><bdi>USD / SYP</bdi> {t('السوق · شراء','Market · Buy')} <strong>{number(snapshot.market.buy)}</strong> {t('مبيع','Sell')} <strong>{number(snapshot.market.sell)}</strong> <small>{t('ل.س الجديدة','New SYP')}</small>{exchangeAge(snapshot.market.updatedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 for(const quote of snapshot?.fx??[])if(exchangeAge(quote.updatedAt,now)!=='expired')quotes.push(<span key={quote.pair}><bdi>{quote.pair.replace('/',' / ')}</bdi> <strong>{number(quote.rate)}</strong>{exchangeAge(quote.updatedAt,now)==='stale'&&<em>{t('بيانات قديمة','Stale')}</em>}</span>);
 const empty=loading?t('جارٍ تحميل أسعار العملات…','Loading exchange rates…'):t('تعذّر تحميل الأسعار — التفاصيل','Rates could not be loaded — details');
 return <section className="exchange-ticker" dir={ar?'rtl':'ltr'} aria-label={t('أسعار الصرف المرجعية','Reference exchange rates')}>
  <div className="exchange-ticker-window" tabIndex={0} aria-label={t('شريط أسعار متحرك؛ أوقف الحركة للقراءة','Moving rate ticker; pause to read')} data-paused={paused}>
   {quotes.length?<div className="exchange-ticker-track"><div className="exchange-ticker-group">{quotes}</div><div className="exchange-ticker-group" aria-hidden="true">{quotes}</div></div>:<span className="exchange-ticker-empty">{empty}</span>}
  </div>
  {quotes.length>0&&<button type="button" onClick={()=>setPaused(!paused)} aria-pressed={paused} aria-label={paused?t('تشغيل حركة الشريط','Play ticker'):t('إيقاف حركة الشريط','Pause ticker')}>{paused?<Play size={14}/>:<Pause size={14}/>}</button>}
  <button type="button" onClick={()=>dialog.current?.showModal()} aria-label={t('مصدر الأسعار وحالة التحديث','Rate source and update status')}><Info size={16}/></button>
  <dialog ref={dialog} className="exchange-ticker-dialog" aria-label={t('تفاصيل أسعار العملات','Exchange rate details')}>
   <header><strong>{t('أسعار مرجعية · الليرة اليوم','Reference rates · SP Today')}</strong><button type="button" onClick={()=>dialog.current?.close()} aria-label={t('إغلاق','Close')}><X size={18}/></button></header>
   <p>{t('المصدر: الليرة اليوم — مزوّد مستقل، وليس المصرف المركزي. القيم السورية بالليرة الجديدة دون تحويل. تُجلب لقطة مشتركة بحد أقصى مرة كل 8 ساعات ضمن الحصة المجانية؛ ليست أسعارًا لحظية، ولا تؤثر في تنفيذ العمليات أو الرسوم.','Source: SP Today — an independent provider, not the central bank. Syrian values are in new SYP without conversion. A shared snapshot is collected at most once every 8 hours within the free quota; these are not live quotes and do not affect execution or fees.')}</p>
   {snapshot?<ul><li>{t('السوق — دمشق:','Market — Damascus:')} {time(snapshot.market.updatedAt)} {exchangeAge(snapshot.market.updatedAt,now)==='expired'&&t('انتهت صلاحية البيانات','data expired')}</li>{snapshot.fx.map(q=><li key={q.pair}><bdi>{q.pair}</bdi> · {time(q.updatedAt)} {exchangeAge(q.updatedAt,now)==='expired'&&t('انتهت صلاحية البيانات','data expired')}</li>)}</ul>:<p>{t('لم تصل لقطة أسعار صالحة من المزود. لن نعرض أرقامًا تجريبية أو أسعارًا مفترضة.','No valid provider snapshot has been received. Sample or assumed prices are never displayed.')}</p>}
   <p>{t('السعر السوري الرسمي: غير متاح — بانتظار مصدر رسمي موثّق. لا تُعرض خانات غير متاحة ضمن الشريط المتحرك.','Official Syrian rate: unavailable — a verified official source is required. Unavailable quotes are omitted from the moving strip.')}</p>
   <a href="https://sp-today.com/" target="_blank" rel="noopener noreferrer">{t('زيارة المصدر','Visit source')} ↗</a>
  </dialog>
 </section>;
}
