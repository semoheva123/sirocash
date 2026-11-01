'use client';
import {useFinancialStatus} from './use-financial-status';
import {FinancialHistory} from './financial-history';
import {FinancialSyncStatus} from './financial-sync-status';
export function FinancialLivePanel({ar,userId,hideBalance=false}:{ar:boolean;userId:string;hideBalance?:boolean}){
 const {status,sync,updatedAt,refresh}=useFinancialStatus(true,userId);
 return <section aria-label={ar?'المتابعة المالية المباشرة':'Live financial overview'}>
  <FinancialSyncStatus sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
  {status?.enabled?<FinancialHistory status={status} ar={ar} hideBalance={hideBalance}/>:<p>{status?ar?'الخدمات المالية غير مفعّلة؛ لا تُعرض بيانات تجريبية بدل معاملاتك.':'Financial services are disabled; no demonstration data replaces your transactions.':ar?'جارٍ التحقق من الاتصال المالي…':'Checking financial connection…'}</p>}
 </section>;
}
