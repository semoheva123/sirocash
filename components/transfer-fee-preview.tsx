import {previewInternalTransfer} from '@/lib/transfer-preview';
export function TransferFeePreview({amount,ar}:{amount:string;ar:boolean}){
 const quote=previewInternalTransfer(amount),t=(a:string,e:string)=>ar?a:e;
 return <div className="transfer-fee-preview" aria-live="polite"><div><span>{t('رسوم التحويل · 1% على المرسل','Transfer fee · 1% added to sender')}</span><strong dir="ltr">{quote?.fee??'—'} USD</strong></div>{quote&&<><div><span>{t('يستلم المستفيد','Recipient receives')}</span><strong dir="ltr">{quote.amount} USD</strong></div><div><span>{t('إجمالي الخصم','Total debit')}</span><strong dir="ltr">{quote.totalDebit} USD</strong></div></>}</div>;
}
