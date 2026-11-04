'use client';
import {walletActivity,type WalletActivity} from '@/lib/wallet-activity';
import {HistorySearch} from './history-search';
import {useHistoryPages,type HistoryFilters} from './use-history-pages';
import {HistoryDetail} from './history-detail';
import {TransferParties} from './transfer-parties';
import {useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,SlidersHorizontal} from 'lucide-react';
import type {FinancialStatus} from './use-financial-status';
import {FinancialDate,FinancialEmpty,FinancialReference,FinancialState,financialKind} from './financial-ui';
import {DialogFrame} from './dialog-frame';
import {activityAmount,activityDirection,pendingActivityStates} from '@/lib/activity-presentation';
type Row=WalletActivity;
export function WalletTransactionFeed({status,ar,compact=false,initialFilter='all'}:{status:FinancialStatus;ar:boolean;compact?:boolean;initialFilter?:'all'|'pending'}){
 const t=(a:string,e:string)=>ar?a:e;
 const [filter,setFilter]=useState<string>(initialFilter),[applied,setApplied]=useState<HistoryFilters>({}),[expanded,setExpanded]=useState(false),[selected,setSelected]=useState<Row|null>(null);
 const history=useHistoryPages(status,filter==='pending'?'pending':'activity',applied);
 const source=walletActivity(history.combined);
 const rows=source.filter(row=>(filter==='all'||filter==='pending'&&pendingActivityStates.has(row.status)||activityDirection(row.amount)===filter)&&(!applied.type||row.type===applied.type)&&(!applied.network||row.network===applied.network)&&(!applied.from||row.createdAt.slice(0,10)>=applied.from)&&(!applied.to||row.createdAt.slice(0,10)<=applied.to)&&(!applied.q||`${row.id} ${row.searchText??''} ${financialKind(row.type,ar)} ${row.senderName??''} ${row.senderUid??''} ${row.recipientName??''} ${row.recipientUid??''}`.toLowerCase().includes(applied.q.toLowerCase())));
 const current=selected?source.find(row=>row.id===selected.id):null;
 return <section className={`wallet-feed${compact?' wallet-feed-compact':''}`} aria-label={t('سجل العمليات','Transaction history')}>
  {!compact&&<><div className="wallet-feed-heading"><div><h2>{t('المعاملات','Transactions')}</h2><p>{rows.length} {t('عملية ضمن السجل المعروض','transactions in the displayed history')}</p></div><button type="button" className="mobile-icon-button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded} aria-controls="wallet-feed-search" aria-label={t('البحث في العمليات','Search transactions')}><SlidersHorizontal size={20}/></button></div>
  <div className="wallet-feed-tabs" role="group" aria-label={t('تصفية العمليات','Filter transactions')}>{[['all',t('الجميع','All')],['incoming',t('الوارد','Incoming')],['outgoing',t('المرسل','Outgoing')],['pending',t('قيد الانتظار','Pending')]].map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
  {expanded&&<div id="wallet-feed-search"><HistorySearch types ar={ar} busy={history.busy} onApply={setApplied}/></div>}</>}
  {history.busy&&!rows.length?<p role="status">{t('جارٍ تحميل السجل…','Loading history…')}</p>:rows.length?<ul className="wallet-transaction-list">{(compact?rows.slice(0,3):rows).map(row=>{const direction=activityDirection(row.amount);return <li key={row.id} className={row.type==='P2P'?'wallet-transfer-record':undefined}><button type="button" className={`wallet-transaction-card direction-${direction}`} onClick={()=>setSelected(row)} aria-label={`${financialKind(row.type,ar)} · ${row.amount} ${row.currency??'USD'}`}><span className="wallet-transaction-symbol">{direction==='incoming'?<ArrowDownLeft size={22}/>:direction==='outgoing'?<ArrowUpRight size={22}/>:<ArrowLeftRight size={22}/>}</span><span className="wallet-transaction-copy"><strong>{financialKind(row.type,ar)}</strong><FinancialDate value={row.createdAt} ar={ar}/><FinancialState state={row.status} ar={ar}/></span><span className="wallet-transaction-value" dir="ltr"><strong>{row.currency==='USDT'?row.amount:activityAmount(row.amount)}</strong><small>{row.currency??'USD'}</small></span></button>{row.type==='P2P'&&<div className="wallet-transaction-parties"><TransferParties entry={row} ar={ar}/></div>}</li>})}</ul>:<FinancialEmpty title={source.length?t('لا توجد عمليات مطابقة','No matching transactions'):t('لا توجد عمليات بعد','No transactions yet')}/>}
  {!compact&&history.error&&<p role="alert">{t('تعذّر تحميل السجل الأقدم. أعد المحاولة.','Could not load older history. Please retry.')}</p>}
  {!compact&&history.more&&<button type="button" className="button secondary" disabled={history.busy} onClick={()=>void history.load()}>{history.busy?t('جارٍ التحميل…','Loading…'):t('تحميل معاملات أقدم','Load older transactions')}</button>}
  {current&&<DialogFrame variant="sheet" label={t('تفاصيل العملية','Transaction details')} closeLabel={t('إغلاق','Close')} onClose={()=>setSelected(null)}><h2>{financialKind(current.type,ar)}</h2><p className="wallet-detail-amount" dir="ltr">{current.amount} {current.currency??'USD'}</p><FinancialState state={current.status} ar={ar}/><FinancialDate value={current.createdAt} ar={ar}/><FinancialReference value={current.id} ar={ar}/>{current.type==='P2P'&&<TransferParties entry={current} ar={ar}/>}{['DEPOSIT','WITHDRAWAL'].includes(current.type)&&<HistoryDetail scope={current.recordScope??'activity'} id={current.recordId??current.id} ownerId={status.userId} ar={ar}/>}</DialogFrame>}
 </section>;
}
