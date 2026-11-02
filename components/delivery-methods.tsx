'use client';
import {ExternalRemittancePreview} from './external-remittance-preview';
export type DeliveryMethod='internal'|'cash'|'networks';
/** Unavailable rails are explicit UI states, never synthetic quotes or API calls. */
export function DeliveryMethods({ar,value,onChange,externalOnly=false}:{externalOnly?:boolean;ar:boolean;value:DeliveryMethod;onChange:(value:DeliveryMethod)=>void}){
 const t=(a:string,e:string)=>ar?a:e;
 if(externalOnly)return <ExternalRemittancePreview ar={ar}/>;
 return <section className="delivery-methods" aria-label={t('طريقة التسليم','Delivery method')}><h2>{t('طريقة الإرسال','Send method')}</h2><div className="delivery-options">{([
  ['cash',t('تسليم باليد','Cash hand-delivery')],['networks',t('شبكات الهرم والفؤاد','Al Haram & Al Fouad networks')],['internal',t('تحويل داخلي','Internal wallet transfer')],
 ] as const).filter(([method])=>!externalOnly||method!=='internal').map(([method,label])=><button type="button" key={method} aria-pressed={value===method} onClick={()=>onChange(method)}><strong>{label}</strong>{method!=='internal'&&<small>{t('قريبًا','Coming soon')}</small>}</button>)}</div>
 {value!=='internal'&&<div className="card"><p role="status">{t('هذه الطريقة غير مفعّلة حاليًا. لا يمكن إرسال طلب أو احتساب رسوم تنفيذية.','This method is not activated. No request can be submitted or execution fee quoted.')}</p><fieldset disabled><label>{t('المبلغ','Amount')}<input inputMode="decimal" placeholder="0.00"/></label><label>{t('رسوم العملية','Transaction fees')}<input readOnly value={t('غير متاحة','Unavailable')}/></label><label>{t('الاسم الكامل للمستلم','Recipient full name')}<input autoComplete="off"/></label><label>{t('رقم الهاتف','Phone number')}<input type="tel" autoComplete="off"/></label><label>{t('المدينة','City')}<input autoComplete="off"/></label></fieldset></div>}
 </section>;
}
