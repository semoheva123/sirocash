import Link from 'next/link';
import {Clock3,ReceiptText,ShieldCheck,ArrowUpRight} from 'lucide-react';
type Service='deposit'|'withdraw'|'sham-cash'|'mobile-topup';
/** Informational only: no promise of activation, live pricing or an invented operating calendar. */
export function ServiceBrief({service,ar,depositActive=false}:{service:Service;ar:boolean;depositActive?:boolean}){
 const t=(en:string,arabic:string)=>ar?arabic:en;
 const liveDeposit=service==='deposit'&&depositActive;
 const sham=service==='sham-cash';
 const details=[
  {icon:Clock3,label:t('Execution window','مدة التنفيذ'),value:liveDeposit?t('After verified network finality','بعد التحقق من تأكيدات الشبكة'):sham?t('1–24 hours','من ساعة إلى 24 ساعة'):t('Not activated','غير مفعّلة حاليًا'),note:liveDeposit?t('Credit follows verified finality; no immediate confirmation is promised.','يُقيد الرصيد بعد التحقق من نهائية المعاملة؛ لا يُضمن التأكيد الفوري.'):sham?t('During designated operating days. The operating calendar has not been published.','خلال أيام التنفيذ المحدّدة. لم يُنشر جدول أيام وساعات العمل بعد.'):t('No live settlement time is available.','لا تتوفر مدة تسوية فعلية لهذه الخدمة.')},
  {icon:ReceiptText,label:t('Fees & charges','الرسوم والعمولات'),value:liveDeposit?t('Observed USDT / USD rate','سعر USDT / USD المرصود'):t('Before confirmation','توضَّح قبل التأكيد'),note:liveDeposit?t('The ledger uses USD at an observed rate, not an assumed one-to-one peg.','يُقيد الرصيد بالدولار وفق سعر مرصود، وليس بافتراض تعادل ثابت.'):t('Live fees are not approved. Simulation pricing is not a live quote.','لم تُعتمد الرسوم التشغيلية بعد. رسوم المحاكاة ليست تسعيرًا فعليًا.')},
  {icon:ShieldCheck,label:t('Service status','حالة الخدمة'),value:liveDeposit?t('Deposits only','الإيداع فقط'):t('Preview only','إصدار تجريبي'),note:liveDeposit?t('Funds remain in assigned subaddresses. No sweep, withdrawal or internal transfer is enabled.','تبقى الأموال في العناوين الفرعية. التجميع والسحب والتحويل الداخلي غير مفعّلة.'):t('No real transfer, deposit or top-up is performed.','لا يُنفّذ تحويل أو إيداع أو شحن رصيد فعلي.')},
 ];
 return <section className="atelier-service-brief" aria-label={t('Important service information','معلومات الخدمة الأساسية')}><div className="atelier-brief-title"><span>{t('BEFORE YOU PROCEED','قبل المتابعة')}</span><Link href="/support">{t('Service guidance','إرشادات الخدمة')}<ArrowUpRight size={14}/></Link></div><div className="atelier-brief-grid">{details.map(item=><div key={item.label}><item.icon size={19}/><div><span>{item.label}</span><strong>{item.value}</strong><p>{item.note}</p></div></div>)}</div></section>;
}
