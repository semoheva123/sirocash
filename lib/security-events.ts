import {randomBytes} from 'node:crypto';
export type SecurityClient={query:(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
export type SecurityKind='sign_in'|'password_changed'|'password_recovered'|'email_changed'|'session_revoked'|'sessions_revoked';
/** Append-only audit event and durable notification are committed with the security mutation. */
export async function recordSecurityEvent(c:SecurityClient,userId:string,kind:SecurityKind,email:string){
 const id=randomBytes(24).toString('hex');
 await c.query('INSERT INTO "SecurityEvent" (id,"userId",kind) VALUES($1,$2,$3)',[id,userId,kind]);
 await c.query('INSERT INTO "SecurityNotification" (id,recipient) VALUES($1,$2)',[id,email]);
}
export const securityLabels:Record<SecurityKind,{ar:string;en:string}>={
 sign_in:{ar:'تسجيل دخول جديد',en:'New sign-in'},
 password_changed:{ar:'تغيير كلمة المرور',en:'Password changed'},
 password_recovered:{ar:'استعادة الوصول وتعيين كلمة مرور جديدة',en:'Password recovered'},
 email_changed:{ar:'تغيير البريد الإلكتروني',en:'Email address changed'},
 session_revoked:{ar:'إنهاء جلسة حساب',en:'Account session ended'},
 sessions_revoked:{ar:'إنهاء جلسات الحساب',en:'Account sessions ended'},
};
export function securityAlert(kind:SecurityKind){
 const label=securityLabels[kind];
 return {subject:`SiroCash — ${label.ar} / ${label.en}`,text:`سيرو كاش\n\nتنبيه أمني: ${label.ar}.\nإذا لم تنفّذ هذا الإجراء، افتح موقع سيرو كاش مباشرة وراجع جلسات الحساب أو استخدم استعادة كلمة المرور. لا تشارك كلمة المرور أو رموز التحقق.\nهذه الرسالة للإشعار فقط، ولا تحتوي رابطاً لاعتماد أي عملية.\n\nSiroCash security alert: ${label.en}.\nIf this was not you, open SiroCash directly and review your sessions or recover your password. Never share passwords or verification codes. This notification does not authorize any action.`};
}
/** Claims are committed before calling the mail provider, preventing concurrent senders from claiming the same batch. */
export async function deliverSecurityNotifications(c:SecurityClient,send:(recipient:string,message:{subject:string;text:string},id:string)=>Promise<void>){
 const {rows}=await c.query(`WITH pending AS (
 SELECT n.id FROM "SecurityNotification" n WHERE n."deliveredAt" IS NULL AND n.attempts<5 AND n."nextAttemptAt"<=NOW()
 ORDER BY n."nextAttemptAt" LIMIT 10 FOR UPDATE SKIP LOCKED
 ) UPDATE "SecurityNotification" n SET attempts=n.attempts+1,"nextAttemptAt"=NOW()+INTERVAL '15 minutes'
 FROM pending p,"SecurityEvent" e WHERE n.id=p.id AND e.id=n.id RETURNING n.id,n.recipient,e.kind`);
 let delivered=0;
 for(const row of rows){
  try{await send(String(row.recipient),securityAlert(row.kind as SecurityKind),String(row.id));
   await c.query('UPDATE "SecurityNotification" SET "deliveredAt"=NOW() WHERE id=$1',[row.id]);delivered++;
  }catch{/* No raw provider errors or recipient addresses in logs; row remains retryable. */}
 }
 return {processed:rows.length,delivered};
}
