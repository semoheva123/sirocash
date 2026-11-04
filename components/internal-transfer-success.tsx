import {completedInternalTransfer} from '@/lib/internal-transfer-receipt';
import type {ReceivingIdentity} from '@/lib/receiving-uid';
export function InternalTransferSuccess({result,identity,amount,ar}:{result:unknown;identity?:ReceivingIdentity;amount:string;ar:boolean}){
 if(!completedInternalTransfer(result))return null;
 return <div className="transfer-success" role="status"><strong>{ar?'تم التحويل بنجاح ووصل المبلغ إلى حساب المستفيد.':'Transfer completed successfully. The recipient account has been credited.'}</strong>{identity&&<><p><bdi>{identity.displayName}</bdi></p><p dir="ltr">UID · {identity.uid}</p></>}<p dir="ltr">{amount} USD</p></div>;
}
