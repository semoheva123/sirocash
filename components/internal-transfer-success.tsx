import {ReceiptShare} from './receipt-share';
import {FinancialReference} from './financial-ui';
import {completedInternalTransfer} from '@/lib/internal-transfer-receipt';
import type {ReceivingIdentity} from '@/lib/receiving-uid';
export function InternalTransferSuccess({result,identity,amount,ar}:{result:unknown;identity?:ReceivingIdentity;amount:string;ar:boolean}){
 if(!completedInternalTransfer(result))return null;
 const receipt=result as {id:string;transactionId:string;fee?:string;totalDebit?:string};
 const valid=(value:unknown)=>typeof value==='string'&&/^\d+(\.\d{1,6})?$/.test(value);
 const text=['SIROCASH',ar?'تحويل مكتمل':'Completed transfer',receipt.transactionId,identity?.displayName,identity?.uid,amount+' USD',valid(receipt.fee)?(ar?'العمولة: ':'Fee: ')+receipt.fee+' USD':null,valid(receipt.totalDebit)?(ar?'إجمالي الخصم: ':'Total debit: ')+receipt.totalDebit+' USD':null].filter(Boolean).join('\n');
 return <div className="transfer-success" role="status"><strong>{ar?'تم التحويل بنجاح ووصل المبلغ إلى حساب المستفيد.':'Transfer completed successfully. The recipient account has been credited.'}</strong>{identity&&<><p><bdi>{identity.displayName}</bdi></p><p dir="ltr">UID · {identity.uid}</p></>}<p dir="ltr">{amount} USD</p>{valid(receipt.fee)&&<p>{ar?'العمولة: ':'Fee: '}<bdi>{receipt.fee} USD</bdi></p>}{valid(receipt.totalDebit)&&<p>{ar?'إجمالي الخصم: ':'Total debit: '}<bdi>{receipt.totalDebit} USD</bdi></p>}<FinancialReference value={receipt.transactionId} ar={ar}/><ReceiptShare text={text} ar={ar}/></div>;
}
