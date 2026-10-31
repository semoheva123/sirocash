'use client';
import type {FinancialStatus} from './use-financial-status';
export function FinancialActivity({status,ar,hideBalance=false}:{status:FinancialStatus;ar:boolean;hideBalance?:boolean}){
 const labels:Record<string,[string,string]>={P2P:['تحويل داخلي','Internal transfer'],DEPOSIT:['إيداع','Deposit'],WITHDRAWAL:['سحب','Withdrawal'],SHAM_CASH:['شام كاش','Sham Cash'],MOBILE_TOPUP:['شحن رصيد','Mobile top-up'],PENDING:['قيد المعالجة','Pending'],COMPLETED:['مكتملة','Completed'],FAILED:['لم تكتمل','Failed']};
 const label=(value:string)=>labels[value]?.[ar?0:1]??(ar?'غير محدد':'Unknown');
 return <section className="card" aria-label={ar?'الحركات المالية المثبتة':'Posted financial activity'}><h2>{ar?'الحركات المالية المثبتة':'Posted financial activity'}</h2><p>{ar?'الرصيد الدفتري / المحجوز بالدولار':'Posted / held USD'}: <span dir="ltr">{hideBalance?'••••••':status.balance?.posted} / {hideBalance?'••••••':status.balance?.held}</span></p><p>{ar?'تظهر الحركة بعد تسجيلها في دفتر الحسابات. تأكيد الشبكة ليس لحظيًا.':'Activity appears after ledger posting. Network confirmation is not instantaneous.'}</p>{status.activity?.length?<ul>{status.activity.map(a=><li key={a.id}><code>{a.id}</code> · <span dir="ltr">{a.amount} USD</span> · {label(a.type)} · {label(a.status)}</li>)}</ul>:<p>{ar?'لا توجد حركات مثبتة للعرض.':'No posted activity to display.'}</p>}</section>;
}
