'use client';
import {useState} from 'react';
import {HistorySearch} from './history-search';
import {useHistoryPages,type HistoryFilters} from './use-history-pages';
import type {FinancialStatus} from './use-financial-status';
import {FinancialDate,FinancialEmpty,FinancialReference,FinancialState} from './financial-ui';
import {transactionExplorer} from '@/lib/transaction-explorer';
export function depositTokenAmount(baseUnits:string,network:string){
 if(!/^\d{1,78}$/.test(baseUnits)||!['TRC20','BEP20'].includes(network))return '—';
 const decimals=network==='TRC20'?6:18,scale=10n**BigInt(decimals),amount=BigInt(baseUnits);
 const fraction=String(amount%scale).padStart(decimals,'0').replace(/0+$/,'');
 return `${amount/scale}${fraction?'.'+fraction:''}`;
}
/** Owner-bound persisted fields only. No chain RPC, key material, inferred sender or default fees. */
export function FinancialRecords({status,ar,scope,interactive=true}:{status:FinancialStatus;ar:boolean;interactive?:boolean;scope:'deposits'|'withdrawals'}){
 const [filters,setFilters]=useState<HistoryFilters>({});
 const history=useHistoryPages(status,scope,filters);status=history.combined;
 const t=(a:string,e:string)=>ar?a:e, deposits=scope==='deposits';
 const rows=deposits?(status.deposits??[]).map(d=>({id:d.id,amount:depositTokenAmount(d.amountBaseUnits,d.network)+' USDT',network:d.network,reference:d.txId,state:d.state,accountState:d.state,date:d.createdAt,sender:d.sender??undefined,recipient:d.recipient,fee:undefined as string|undefined,gross:undefined as string|undefined,debit:undefined as string|undefined})):(status.withdrawals??status.operations??[]).filter(o=>o.kind==='WITHDRAWAL').map(o=>{
  const payout=status.payouts?.find(p=>p.operationId===o.id),network=payout?.network||o.network||'';
  return {id:o.id,amount:payout?.amountBaseUnits?depositTokenAmount(payout.amountBaseUnits,network)+' USDT':o.netTokens?o.netTokens+' USDT':o.amount+' USD',network,reference:payout?.txId||'',state:payout?.state??o.state,accountState:o.state,date:o.createdAt,sender:payout?.sender,recipient:payout?.recipient||o.recipient,fee:o.feeTokens,gross:o.grossTokens,debit:o.amount};
 });
 const address=(label:string,value?:string)=><div><dt>{label}</dt><dd>{value?<FinancialReference value={value} ar={ar} label={label}/>:<span className="record-unavailable">{t('غير متاح في السجل','Not available in this record')}</span>}</dd></div>;
 return <section className="card financial-records" aria-label={deposits?t('سجل الإيداعات','Deposit history'):t('سجل السحوبات','Withdrawal history')} data-financial-source="shared-sse">
  <h2 className="financial-records-title">{deposits?t('سجل الإيداعات','Deposit history'):t('سجل السحوبات','Withdrawal history')}</h2>
  {interactive&&<details><summary>{t('البحث والتصفية','Search and filters')}</summary><HistorySearch ar={ar} busy={history.busy} onApply={setFilters}/></details>}
  {history.busy&&!rows.length?<p role="status">{t('جارٍ تحميل السجل…','Loading history…')}</p>:rows.length?<ul className="pro-records" aria-label={deposits?t('الإيداعات المسجلة','Recorded deposits'):t('السحوبات المسجلة','Recorded withdrawals')}>{rows.map(row=>{
   const explorer=transactionExplorer(row.network,row.reference);
   return <li key={row.id} id={'record-'+row.id} className="financial-record-card">
    <div className="pro-record-heading"><strong dir="ltr">{row.amount}</strong><FinancialState state={row.state} ar={ar}/></div>
    <div className="pro-record-footer"><span className="financial-record-network" dir="ltr">{row.network?'USDT · '+row.network:t('الشبكة غير متاحة','Network unavailable')}</span><FinancialDate value={row.date} ar={ar}/></div>
    <dl className="chain-record-details">
     {address(t('المحفظة المرسلة','Sender wallet'),row.sender)}
     {address(t('المحفظة المستلمة','Recipient wallet'),row.recipient)}
     {!deposits&&<><div><dt>{t('حالة طلب السحب','Withdrawal request status')}</dt><dd><FinancialState state={row.accountState} ar={ar}/></dd></div>{row.gross&&<div><dt>{t('المبلغ الإجمالي','Gross amount')}</dt><dd dir="ltr">{row.gross} USDT</dd></div>}<div><dt>{t('رسم السحب','Withdrawal fee')}</dt><dd>{row.fee?<bdi>{row.fee} USDT</bdi>:t('غير متاح في السجل','Not available in this record')}</dd></div><div><dt>{t('إجمالي الخصم','Total debit')}</dt><dd dir="ltr">{row.debit} USD</dd></div></>}
     <div><dt>{t('معرّف المعاملة على الشبكة','Network transaction ID')} · TxID</dt><dd>{row.reference?<FinancialReference value={row.reference} ar={ar} label="TxID"/>:t('لم يتوفر بعد','Not available yet')}</dd></div>
    </dl>
    <a className="chain-explorer-link" href={'/settings/support?reference='+encodeURIComponent(row.id)}>{t('طلب مساعدة بشأن المعاملة','Get help with this transaction')}</a>
    {explorer&&<a className="chain-explorer-link" href={explorer} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('عرض في مستكشف الشبكة','View in block explorer')} ↗</a>}
   </li>;
  })}</ul>:<FinancialEmpty title={deposits?t('لا توجد إيداعات بعد','No deposits yet'):t('لا توجد سحوبات بعد','No withdrawals yet')}/>}
  {history.error&&<p role="alert">{t('تعذّر تحميل السجل الأقدم. يمكنك إعادة المحاولة.','Older history could not load. You can retry.')}</p>}
  {interactive&&history.more&&<button type="button" className="button secondary" disabled={history.busy} onClick={()=>void history.load()}>{history.busy?t('جارٍ التحميل…','Loading…'):t('تحميل معاملات أقدم','Load older transactions')}</button>}
 </section>;
}
