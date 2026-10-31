'use client';
import type {FinancialStatus} from './use-financial-status';
export function FinancialActivity({status,ar,hideBalance=false}:{status:FinancialStatus;ar:boolean;hideBalance?:boolean}){
 return <section className="card" aria-label={ar?'الحركات المالية المثبتة':'Posted financial activity'}><h2>{ar?'الحركات المالية المثبتة':'Posted financial activity'}</h2><p>{ar?'الرصيد الدفتري / المحجوز بالدولار':'Posted / held USD'}: <span dir="ltr">{hideBalance?'••••••':status.balance?.posted} / {hideBalance?'••••••':status.balance?.held}</span></p><p>{ar?'تظهر الحركة بعد تسجيلها في دفتر الحسابات. تأكيد الشبكة ليس لحظيًا.':'Activity appears after ledger posting. Network confirmation is not instantaneous.'}</p>{status.activity?.length?<ul>{status.activity.map(a=><li key={a.id}><code>{a.id}</code> · <span dir="ltr">{a.amount} USD</span> · {a.type} · {a.status}</li>)}</ul>:<p>{ar?'لا توجد حركات مثبتة للعرض.':'No posted activity to display.'}</p>}</section>;
}
