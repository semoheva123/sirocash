import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {randomBytes} from 'node:crypto';
import {serverUser} from '@/lib/server-user';
import {supportAdmin} from '@/lib/support-center';
import {operationsAllowed} from '@/lib/operations-policy';
import {databaseTransaction} from '@/lib/database';
export const dynamic='force-dynamic';
export const metadata={title:'العمليات | SiroCash',robots:{index:false,follow:false}};
export default async function Page(){
 const user=await serverUser();if(!user)redirect('/auth');
 if(!operationsAllowed(user.id,process.env.OPERATIONS_ADMIN_IDS))notFound();
 const stats=await databaseTransaction(async c=>{
  await c.query('INSERT INTO "SecurityEvent"(id,"userId",kind) VALUES($1,$2,$3)',[randomBytes(24).toString('hex'),user.id,'operations_view']);
  const {rows:[r]}=await c.query(`SELECT
   (SELECT count(*)::text FROM "AuthSession" WHERE "expiresAt">NOW()) AS sessions,
   (SELECT count(*)::text FROM "SecurityEvent" WHERE "createdAt">NOW()-INTERVAL '24 hours') AS events,
   (SELECT count(*)::text FROM "SecurityNotification" WHERE "deliveredAt" IS NULL AND attempts<5) AS queued,
   (SELECT count(*)::text FROM "SecurityNotification" WHERE "deliveredAt" IS NULL AND attempts>=5) AS failed`);
  return r;
 });
 return <main className="trust-page section-width"><Link className="logo" href="/dashboard">SiroCash.</Link><span className="eyebrow plain">وصول تشغيلي مقيّد · للقراءة فقط</span><h1>متابعة التشغيل الأمني</h1>{supportAdmin(user.id)&&<Link className="button secondary" href="/operations/support">مكتب الدعم · قراءة الطلبات والرد</Link>}<p>تُسجَّل مشاهدة هذه الصفحة في سجل التدقيق. لا تعرض الصفحة بيانات المستخدمين أو كلمات المرور أو الرموز أو أرصدتهم، ولا تتيح تعديل الأموال أو الحسابات.</p><div className="trust-grid">{[['الجلسات النشطة',stats.sessions],['الأحداث خلال 24 ساعة',stats.events],['التنبيهات بانتظار الإرسال',stats.queued],['التنبيهات التي استنفدت المحاولات',stats.failed]].map(([label,value])=><section className="glass settings-card" key={label}><h2>{label}</h2><strong className="operations-number">{value}</strong></section>)}</div><p className="warning">الخدمات المالية غير مفعّلة. هذه لوحة متابعة أمنية وليست نظام تسوية مالية أو إثبات جاهزية تشغيلية.</p><Link className="button secondary" href="/dashboard">العودة إلى الحساب</Link></main>;
}
