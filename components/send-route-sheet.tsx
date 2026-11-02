'use client';
import {Globe2,Wallet,ChevronLeft,ChevronRight} from 'lucide-react';
import {DialogFrame} from './dialog-frame';
export function SendRouteSheet({ar,onClose}:{ar:boolean;onClose:()=>void}){
 const t=(a:string,e:string)=>ar?a:e;
 return <DialogFrame variant="sheet" label={t('اختر طريقة الإرسال','Choose a send method')} closeLabel={t('إغلاق','Close')} onClose={onClose}><span className="sheet-handle" aria-hidden="true"/><h2>{t('اختر طريقة الإرسال','Choose a send method')}</h2><p className="sheet-description">{t('داخل المنصة أو حوالة خارجية','Within the platform or an external remittance')}</p><div className="sheet-route-list">{([['internal',Wallet,t('تحويل داخل Siro Cash','Transfer within Siro Cash'),t('إرسال إلى حساب آخر','Send to another account')],['external',Globe2,t('حوالة خارجية','External remittance'),t('عرض وسائل التحويل · قريبًا','Explore delivery methods · coming soon')]] as const).map(([route,Icon,title,description])=><a key={route} href={`/send?route=${route}`}><span className="route-option-icon"><Icon size={23}/></span><span><strong>{title}</strong><small>{description}</small></span>{ar?<ChevronLeft size={18}/>:<ChevronRight size={18}/>}</a>)}</div><button type="button" className="sheet-cancel" onClick={onClose}>{t('إلغاء','Cancel')}</button></DialogFrame>;
}
