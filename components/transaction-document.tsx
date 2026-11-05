'use client';
import {FileText,Clock3} from 'lucide-react';
import {FinancialRecords,depositTokenAmount} from './financial-records';
import {FinancialDate,FinancialReference,FinancialState,financialKind,financialStateLabel} from './financial-ui';
import {TransferParties} from './transfer-parties';
import {ReceiptTools} from './receipt-tools';
import type {FinancialStatus} from './use-financial-status';
import type {ReceiptDocument} from '@/lib/receipt-document';
export function TransactionDocument({data,scope,ar}:{data:FinancialStatus;scope:'activity'|'deposits'|'withdrawals';ar:boolean}){
 const t=(a:string,e:string)=>ar?a:e,a=data.activity?.[0],d=data.deposits?.[0],w=data.operations?.[0],row=scope==='activity'?a:scope==='deposits'?d:w;
 if(!row)return null;
 const payout=scope==='withdrawals'?data.payouts?.find(p=>p.operationId===row.id):undefined;
 const state=scope==='activity'?a!.status:scope==='deposits'?d!.state:w!.state;
 const title=scope==='activity'?financialKind(a!.type,ar):scope==='deposits'?t('بيان إيداع','Deposit statement'):t('بيان سحب','Withdrawal statement');
 const amount=scope==='activity'?a!.amount+' USD':scope==='deposits'?depositTokenAmount(d!.amountBaseUnits,d!.network)+' USDT':payout?.amountBaseUnits?depositTokenAmount(payout.amountBaseUnits,payout.network)+' USDT':w!.netTokens?w!.netTokens+' USDT':w!.amount+' USD';
 const date=(value:string)=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toISOString():t('غير متاح','Unavailable')};
 const fields:[string,string][]=[[t('المرجع','Reference'),row.id],[t('المبلغ المسجّل','Recorded amount'),amount],[t('حالة السجل الحالية','Current record state'),financialStateLabel(state,ar)],[t('تاريخ التسجيل · UTC','Recorded at · UTC'),date(row.createdAt)]];
 const add=(label:string,value:string|null|undefined)=>{if(value)fields.push([label,value])};
 if(scope==='activity'&&a?.type==='P2P'){add(t('يستلم المستفيد · USD','Recipient receives · USD'),a.transferAmount);add(t('العمولة · USD','Fee · USD'),a.transferFee);add(t('إجمالي الخصم · USD','Total debit · USD'),a.totalDebit);add(t('المرسل','Sender'),a.senderName??a.senderUsername);add('Sender UID',a.senderUid);add(t('المستفيد','Recipient'),a.recipientName??a.recipientUsername);add('Recipient UID',a.recipientUid)}
 if(d&&scope==='deposits'){add(t('الشبكة','Network'),d.network);add('TxID',d.txId);add(t('عنوان المرسل','Sender address'),d.sender);add(t('عنوان المستلم','Recipient address'),d.recipient)}
 if(w&&scope==='withdrawals'){add(t('إجمالي الخصم · USD','Total debit · USD'),w.amount);add(t('الإجمالي · USDT','Gross · USDT'),w.grossTokens);add(t('رسم السحب · USDT','Withdrawal fee · USDT'),w.feeTokens);add(t('الصافي · USDT','Net · USDT'),w.netTokens);add(t('الشبكة','Network'),payout?.network??w.network);add(t('عنوان المستلم','Recipient address'),payout?.recipient??w.recipient);add(t('عنوان المرسل','Sender address'),payout?.sender);add('TxID',payout?.txId);if(payout){add(t('مرجع معاملة الشبكة','Network transaction reference'),payout.id);add(t('حالة الشبكة','Network state'),financialStateLabel(payout.state,ar));add(t('إنشاء معاملة الشبكة · UTC','Network transaction created · UTC'),date(payout.createdAt))}}
 const notes=[t('يعكس هذا البيان الحالة المسجّلة عند جلبه؛ ليس سجلًا زمنيًا كاملًا.','This statement reflects the state when retrieved, not a complete event history.')];
 if(scope!=='activity')notes.push(t('تأكيد الشبكة لا يساوي إضافة الرصيد أو اكتمال طلب السحب. لا يُفترض تعادل USDT مع USD.','Chain confirmation is not account credit or withdrawal completion. USDT is not assumed equal to USD.'));
 const record:ReceiptDocument={title,reference:row.id,fields,notes};
 return <section className="transaction-document" data-receipt-document>
  <header className="transaction-document-heading"><span className="transaction-document-mark"><FileText size={23}/></span><div><small>SIROCASH / TRANSACTION</small><h2>{title}</h2></div><FinancialState state={state} ar={ar}/></header>
  <p className="transaction-document-amount" dir="ltr">{amount}</p><FinancialReference value={row.id} ar={ar}/>
  <section className="transaction-events" aria-label={t('المعلومات المسجّلة','Recorded information')}><h3>{t('المعلومات المسجّلة','Recorded information')}</h3><ol><li><Clock3 size={17}/><div><strong>{t('تسجيل العملية','Record created')}</strong><FinancialDate value={row.createdAt} ar={ar}/></div></li>{payout&&<li><Clock3 size={17}/><div><strong>{t('إنشاء معاملة الشبكة','Network transaction created')}</strong><FinancialDate value={payout.createdAt} ar={ar}/></div></li>}<li><span className="transaction-status-dot"/><div><strong>{t('حالة السجل الحالية','Current record state')}</strong><FinancialState state={state} ar={ar}/></div></li></ol></section>
  {scope==='activity'?<>{a!.type==='P2P'&&<TransferParties entry={a!} ar={ar}/>}<a data-no-print className="chain-explorer-link" href={'/settings/support?reference='+encodeURIComponent(row.id)}>{t('طلب مساعدة بشأن المعاملة','Get help with this transaction')}</a></>:<FinancialRecords interactive={false} status={data} ar={ar} scope={scope}/>}
  {scope==='activity'&&a?.type==='P2P'&&(a.transferAmount||a.transferFee||a.totalDebit)&&<dl className="receipt-money-details">{fields.filter(([label])=>label.includes('USD')&&label!==t('المبلغ المسجّل','Recorded amount')).map(([label,value])=><div key={label}><dt>{label}</dt><dd dir="ltr">{value}</dd></div>)}</dl>}<p className="transaction-document-note">{notes.join(' ')}</p><ReceiptTools document={record} ar={ar}/>
 </section>;
}
