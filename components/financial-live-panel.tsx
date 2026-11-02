'use client';
import {FinancialEmpty} from './financial-ui';
import {useFinancialStatus} from './use-financial-status';
import {FinancialHistory} from './financial-history';
import {FinancialSyncStatus} from './financial-sync-status';
export function FinancialLivePanel({ar,userId,hideBalance=false,showBalance=true,scope="all"}:{ar:boolean;userId:string;hideBalance?:boolean;showBalance?:boolean;scope?:"all"|"deposits"|"withdrawals"}){
 const {status,sync,updatedAt,refresh}=useFinancialStatus(true,userId);
 return <section aria-label={ar?'المتابعة المالية المباشرة':'Live financial overview'}>
  <FinancialSyncStatus compact={scope!=="all"} sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
  {status?.balance?<><FinancialHistory status={status} ar={ar} hideBalance={hideBalance} showBalance={showBalance} scope={scope}/></>:<div className="card pro-availability"><FinancialEmpty locked title={status?ar?'العمليات المالية غير مفعّلة حاليًا':'Financial operations are not activated':ar?'جارٍ التحقق من الاتصال المالي…':'Checking financial connection…'}/></div>}
 </section>;
}
