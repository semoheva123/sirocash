'use client';
import {useEffect,useState} from 'react';
import type {HistoryFilters} from './use-history-pages';
export function HistorySearch({ar,busy,onApply,types=false,value}:{ar:boolean;busy:boolean;onApply:(filters:HistoryFilters)=>void;types?:boolean;value?:HistoryFilters}){
 const [q,setQ]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[type,setType]=useState(''),[network,setNetwork]=useState(''),[error,setError]=useState(false);
 useEffect(()=>{setQ(value?.q??'');setFrom(value?.from??'');setTo(value?.to??'');setType(value?.type??'');setNetwork(value?.network??'');setError(false)},[value?.q,value?.from,value?.to,value?.type,value?.network]);
 const t=(a:string,e:string)=>ar?a:e;
 return <form className="history-search" onSubmit={e=>{e.preventDefault();if(busy)return;if(from&&to&&from>to){setError(true);return}setError(false);onApply(Object.fromEntries(Object.entries({q:q.trim(),from,to,type,network}).filter(([,v])=>v)))}}>
  <fieldset disabled={busy}><legend>{t('البحث في كامل السجل','Search entire history')}</legend><label>{t('المرجع أو العنوان أو UID','Reference, address or UID')}<input type="search" value={q} maxLength={80} onChange={e=>setQ(e.target.value)}/></label>
  <label>{t('من تاريخ · UTC','From date · UTC')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>{t('إلى تاريخ · UTC','To date · UTC')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
  {types&&<label>{t('نوع المعاملة','Transaction type')}<select value={type} onChange={e=>setType(e.target.value)}><option value="">{t('الكل','All')}</option><option value="P2P">{t('تحويل داخلي','Internal transfer')}</option><option value="DEPOSIT">{t('إيداع','Deposit')}</option><option value="WITHDRAWAL">{t('سحب','Withdrawal')}</option></select></label>}
  <label>{t('الشبكة','Network')}<select value={network} onChange={e=>setNetwork(e.target.value)}><option value="">{t('كل الشبكات','All networks')}</option><option>TRC20</option><option>BEP20</option></select></label>
  </fieldset>{error&&<p role="alert">{t('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.','Start date must not follow end date.')}</p>}
  <button type="submit" className="button secondary" disabled={busy}>{busy?t('جارٍ البحث…','Searching…'):t('بحث','Search')}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setQ('');setFrom('');setTo('');setType('');setNetwork('');setError(false);onApply({})}}>{t('مسح التصفية','Clear filters')}</button>
 </form>;
}
