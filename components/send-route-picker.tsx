'use client';
import {ArrowUpRight,ChevronLeft,ChevronRight,Globe2,Wallet} from 'lucide-react';
export function SendRoutePicker({ar,onChoose}:{ar:boolean;onChoose:(route:'internal'|'external')=>void}){
 const t=(a:string,e:string)=>ar?a:e;
 return <section className="send-route-picker" aria-label={t('نوع الإرسال','Transfer route')}><div className="route-heading-icon"><ArrowUpRight size={28}/></div><h2>{t('إلى أين تريد الإرسال؟','Where are you sending?')}</h2><p>{t('اختر وجهة التحويل','Choose a transfer destination')}</p>{([
 ['internal',Wallet,t('داخل Siro Cash','Within Siro Cash'),t('تحويل إلى حساب آخر','Transfer to another account')],
 ['external',Globe2,t('حوالة خارجية','External remittance'),t('التسليم النقدي وشبكات الحوالات · قريبًا','Cash delivery and remittance networks · coming soon')],
 ] as const).map(([route,Icon,title,description])=><button key={route} type="button" onClick={()=>onChoose(route)}><span className="route-option-icon"><Icon size={23}/></span><span><strong>{title}</strong><small>{description}</small></span>{ar?<ChevronLeft size={18}/>:<ChevronRight size={18}/>}</button>)}</section>;
}
