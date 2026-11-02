'use client';
import {useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,Search,SlidersHorizontal} from 'lucide-react';
import type {FinancialStatus} from './use-financial-status';
import {FinancialDate,FinancialEmpty,FinancialReference,FinancialState,financialKind} from './financial-ui';
import {DialogFrame} from './dialog-frame';
import {activityAmount,activityDirection,pendingActivityStates} from '@/lib/activity-presentation';
type Row=NonNullable<FinancialStatus['activity']>[number];
export function WalletTransactionFeed({status,ar,compact=false}:{status:FinancialStatus;ar:boolean;compact?:boolean}){
 const t=(a:string,e:string)=>ar?a:e;
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[expanded,setExpanded]=useState(false),[selected,setSelected]=useState<Row|null>(null);
 const source=status.activity??[];
 const rows=source.filter(row=>(filter==='all'||filter==='pending'&&pendingActivityStates.has(row.status)||activityDirection(row.amount)===filter)&&(!search||`${row.id} ${financialKind(row.type,ar)}`.toLowerCase().includes(search.toLowerCase().trim())));
 const current=selected?source.find(row=>row.id===selected.id):null;
 return <section className={`wallet-feed${compact?' wallet-feed-compact':''}`} aria-label={t('سجل العمليات','Transaction history')}>
  {!compact&&<><div className="wallet-feed-heading"><div><h2>{t('المعاملات','Transactions')}</h2><p>{source.length} {t('عملية ضمن السجل المعروض','transactions in the displayed history')}</p></div><button type="button" className="mobile-icon-button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded} aria-controls="wallet-feed-search" aria-label={t('البحث في العمليات','Search transactions')}><SlidersHorizontal size={20}/></button></div>
  <div className="wallet-feed-tabs" role="group" aria-label={t('تصفية العمليات','Filter transactions')}>{[['all',t('الجميع','All')],['incoming',t('الوارد','Incoming')],['outgoing',t('المرسل','Outgoing')],['pending',t('قيد الانتظار','Pending')]].map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
  {expanded&&<label className="wallet-feed-search" id="wallet-feed-search"><Search size={18}/><span className="pro-sr-only">{t('البحث بالمرجع أو نوع العملية','Search reference or transaction type')}</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('ابحث بالمرجع أو نوع العملية','Search reference or transaction type')}/></label>}</>}
  {rows.length?<ul className="wallet-transaction-list">{(compact?rows.slice(0,3):rows).map(row=>{const direction=activityDirection(row.amount);return <li key={row.id}><button type="button" className={`wallet-transaction-card direction-${direction}`} onClick={()=>setSelected(row)} aria-label={`${financialKind(row.type,ar)} · ${row.amount} USD`}><span className="wallet-transaction-symbol">{direction==='incoming'?<ArrowDownLeft size={22}/>:direction==='outgoing'?<ArrowUpRight size={22}/>:<ArrowLeftRight size={22}/>}</span><span className="wallet-transaction-copy"><strong>{financialKind(row.type,ar)}</strong><FinancialDate value={row.createdAt} ar={ar}/><FinancialState state={row.status} ar={ar}/></span><span className="wallet-transaction-value" dir="ltr"><strong>{activityAmount(row.amount)}</strong><small>USD</small></span></button></li>})}</ul>:<FinancialEmpty title={source.length?t('لا توجد عمليات مطابقة','No matching transactions'):t('لا توجد عمليات بعد','No transactions yet')}/>}
  {current&&<DialogFrame variant="sheet" label={t('تفاصيل العملية','Transaction details')} closeLabel={t('إغلاق','Close')} onClose={()=>setSelected(null)}><h2>{financialKind(current.type,ar)}</h2><p className="wallet-detail-amount" dir="ltr">{current.amount} USD</p><FinancialState state={current.status} ar={ar}/><FinancialDate value={current.createdAt} ar={ar}/><FinancialReference value={current.id} ar={ar}/></DialogFrame>}
 </section>;
}
