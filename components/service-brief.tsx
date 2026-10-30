import Link from 'next/link';
import {Clock3,ReceiptText,ShieldCheck,ArrowUpRight} from 'lucide-react';
type Service='deposit'|'withdraw'|'sham-cash'|'mobile-topup';
/** Informational only: no promise of activation, live pricing or an invented operating calendar. */
export function ServiceBrief({service,ar}:{service:Service;ar:boolean}){
 const t=(en:string,arabic:string)=>ar?arabic:en;
 const sham=service==='sham-cash';
 const details=[
  {icon:Clock3,label:t('Execution window','مدة التنفيذ'),value:sham?t('1–24 hours','من ساعة إلى 24 ساعة'):t('Not activated','غير مفعّلة حاليًا'),note:sham?t('During designated operating days. The operating calendar has not been published.','خلال أيام التنفيذ المحدّدة. لم يُنشر جدول أيام وساعات العمل بعد.'):t('No live settlement time is available.','لا تتوفر مدة تسوية فعلية لهذه الخدمة.')},
  {icon:ReceiptText,label:t('Fees & charges','الرسوم والعمولات'),value:t('Before confirmation','توضَّح قبل التأكيد'),note:t('Live fees are not approved. Simulation pricing is not a live quote.','لم تُعتمد الرسوم التشغيلية بعد. رسوم المحاكاة ليست تسعيرًا فعليًا.')},
  {icon:ShieldCheck,label:t('Service status','حالة الخدمة'),value:t('Preview only','إصدار تجريبي'),note:t('No real transfer, deposit or top-up is performed.','لا يُنفّذ تحويل أو إيداع أو شحن رصيد فعلي.')},
 ];
 return <section className="atelier-service-brief" aria-label={t('Important service information','معلومات الخدمة الأساسية')}><div className="atelier-brief-title"><span>{t('BEFORE YOU PROCEED','قبل المتابعة')}</span><Link href="/support">{t('Service guidance','إرشادات الخدمة')}<ArrowUpRight size={14}/></Link></div><div className="atelier-brief-grid">{details.map(item=><div key={item.label}><item.icon size={19}/><div><span>{item.label}</span><strong>{item.value}</strong><p>{item.note}</p></div></div>)}</div></section>;
}
