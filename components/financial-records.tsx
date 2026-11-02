'use client';
import type {FinancialStatus} from './use-financial-status';
import {FinancialDate,FinancialEmpty,FinancialReference,FinancialState} from './financial-ui';
export function depositTokenAmount(baseUnits:string,network:string){
 if(!/^\d{1,78}$/.test(baseUnits)||!['TRC20','BEP20'].includes(network))return '—';
 const decimals=network==='TRC20'?6:18,scale=10n**BigInt(decimals),amount=BigInt(baseUnits);
 const fraction=String(amount%scale).padStart(decimals,'0').replace(/0+$/,'');
 return `${amount/scale}${fraction?'.'+fraction:''}`;
}
/** Scope the records themselves, not merely their heading or CSS visibility. */
export function FinancialRecords({status,ar,scope}:{status:FinancialStatus;ar:boolean;scope:'deposits'|'withdrawals'}){
 const t=(a:string,e:string)=>ar?a:e;
 const deposits=scope==='deposits';
 const rows=deposits?(status.deposits??[]).map(d=>({id:d.id,amount:depositTokenAmount(d.amountBaseUnits,d.network)+' USDT',network:d.network,reference:d.txId,state:d.state,date:d.createdAt})):(status.operations??[]).filter(o=>o.kind==='WITHDRAWAL').map(o=>{
  const payout=status.payouts?.find(p=>p.operationId===o.id);
  return {id:o.id,amount:o.amount+' USD',network:payout?.network??'',reference:payout?.txId||'',state:payout?.state??o.state,date:o.createdAt};
 });
 return <section className="card financial-records" aria-label={deposits?t('سجل الإيداعات','Deposit history'):t('سجل السحوبات','Withdrawal history')} data-financial-source="shared-sse">
  <h2>{deposits?t('سجل الإيداعات','Deposit history'):t('سجل السحوبات','Withdrawal history')}</h2>
  {rows.length?<ul className="pro-records">{rows.map(row=><li key={row.id}>
   <div className="pro-record-heading"><strong dir="ltr">{row.amount}</strong><FinancialState state={row.state} ar={ar}/></div>
   <div className="pro-record-footer"><span dir="ltr">{row.network}</span><FinancialDate value={row.date} ar={ar}/></div>
   {row.reference&&<FinancialReference value={row.reference} ar={ar}/>}
  </li>)}</ul>:<FinancialEmpty title={deposits?t('لا توجد إيداعات بعد','No deposits yet'):t('لا توجد سحوبات بعد','No withdrawals yet')}/>}
 </section>;
}
