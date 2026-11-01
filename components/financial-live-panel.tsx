'use client';
import {FinancialEmpty} from './financial-ui';
import {useFinancialStatus} from './use-financial-status';
import {FinancialHistory} from './financial-history';
import {FinancialSyncStatus} from './financial-sync-status';
export function FinancialLivePanel({ar,userId,hideBalance=false}:{ar:boolean;userId:string;hideBalance?:boolean}){
 const {status,sync,updatedAt,refresh}=useFinancialStatus(true,userId);
 return <section aria-label={ar?'المتابعة المالية المباشرة':'Live financial overview'}>
  <FinancialSyncStatus sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
  {status?.balance?<><p className="pro-card-caption">{!status.enabled&&(ar?'عرض مالي للقراءة فقط؛ الدفع والسحب غير مفعّلين.':'Read-only financial view; payments and withdrawals remain disabled.')}</p><FinancialHistory status={status} ar={ar} hideBalance={hideBalance}/></>:<div className="card pro-availability"><FinancialEmpty locked title={status?ar?'العمليات المالية غير مفعّلة حاليًا':'Financial operations are not activated':ar?'جارٍ التحقق من الاتصال المالي…':'Checking financial connection…'} description={ar?'تظهر الأرصدة والحركات بعد نجاح قراءة دفتر الحسابات. لا تُعرض بيانات تجريبية بدل معاملات حسابك.':'Verified balances and movements appear after a successful ledger read. Demonstration data never replaces your account records.'}/></div>}
 </section>;
}
