'use client';
import Link from 'next/link';
import {Bell,Check} from 'lucide-react';
import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {createFinancialStream,type SyncState} from '@/lib/financial-stream-client';
import {useAccountLanguage} from './account-language';
export type Notice={id:string;kind:string;reference:string;staff:boolean;createdAt:string;readAt:string|null};
type Inbox={enabled:boolean;userId:string;notifications:Notice[];unread:number};
const Context=createContext<{inbox:Inbox|null;sync:SyncState;refresh:()=>Promise<void>}|null>(null);
export function NotificationProvider({userId,children}:{userId:string;children:React.ReactNode}){
 const [inbox,setInbox]=useState<Inbox|null>(null),[sync,setSync]=useState<SyncState>('syncing');
 const stream=useRef<ReturnType<typeof createFinancialStream<Inbox>>|null>(null);
 useEffect(()=>{
  setInbox(null);
  const c=createFinancialStream<Inbox>({expectedUserId:userId,active:()=>document.visibilityState!=='hidden'&&navigator.onLine,
   open:()=>new EventSource('/api/notifications/events'),data:d=>{if(Array.isArray(d.notifications)&&Number.isInteger(d.unread))setInbox(d)},state:s=>{setSync(s);if(s==='unauthenticated')setInbox(null)}});
  stream.current=c;
  const changed=()=>{if(document.visibilityState==='hidden'||!navigator.onLine)c.pause();else c.wake()};
  document.addEventListener('visibilitychange',changed);window.addEventListener('online',changed);window.addEventListener('offline',changed);window.addEventListener('focus',changed);c.wake();
  return()=>{c.stop();stream.current=null;document.removeEventListener('visibilitychange',changed);window.removeEventListener('online',changed);window.removeEventListener('offline',changed);window.removeEventListener('focus',changed)};
 },[userId]);
 return <Context.Provider value={{inbox:inbox?.userId===userId?inbox:null,sync,refresh:async()=>{await stream.current?.refresh()}}}>{children}</Context.Provider>;
}
export const useNotifications=()=>useContext(Context);
export function NotificationBell(){
 const [ar]=useAccountLanguage(),data=useNotifications(),count=data?.inbox?.unread??0;
 return <Link className="mobile-icon-button notification-bell" href="/notifications" aria-label={ar?`الإشعارات${count?'، غير مقروءة: '+count:''}`:`Notifications${count?', unread: '+count:''}`}><Bell size={21}/>{count>0&&<span className="notification-count">{count>99?'99+':count}</span>}</Link>;
}
const labels:Record<string,[string,string]>={DEPOSIT_OBSERVED:['رُصد إيداع على الشبكة؛ لم يُضَف إلى الرصيد بعد','Deposit observed on-chain; not credited yet'],TRANSFER_RECEIVED:['وصل تحويل إلى حسابك','Transfer received'],OPERATION_DEPOSIT_COMPLETED:['أُضيف الإيداع إلى رصيد حسابك','Deposit credited to your account'],OPERATION_TRANSFER_COMPLETED:['اكتمل التحويل','Transfer completed'],OPERATION_WITHDRAWAL_RESERVED:['حُجز مبلغ طلب السحب','Withdrawal amount reserved'],OPERATION_WITHDRAWAL_SUBMITTED:['أُرسل طلب السحب للمتابعة','Withdrawal submitted'],OPERATION_WITHDRAWAL_COMPLETED:['اكتمل السحب','Withdrawal completed'],OPERATION_WITHDRAWAL_FAILED:['تعذّر السحب؛ راجع سجل العملية','Withdrawal failed; review the operation'],SUPPORT_REPLY:['ردّ فريق الدعم على طلبك','Support replied to your request'],SUPPORT_MESSAGE:['رسالة جديدة في مكتب الدعم','New support message'],SUPPORT_CLOSED:['أُغلق طلب الدعم','Support request closed'],OPERATION_RESERVED:['حُجز مبلغ العملية','Operation reserved'],OPERATION_SUBMITTED:['أُرسلت العملية للمتابعة','Operation submitted'],OPERATION_COMPLETED:['اكتملت العملية','Operation completed'],OPERATION_FAILED:['تعذّر إكمال العملية؛ راجع سجلها','Operation failed; review its history'],SECURITY_sign_in:['تسجيل دخول جديد','New sign-in'],SECURITY_password_changed:['تغيّرت كلمة المرور','Password changed'],SECURITY_password_recovered:['استُعيد الوصول إلى الحساب','Account access recovered'],SECURITY_email_changed:['تغيّر البريد الإلكتروني','Email changed'],SECURITY_session_revoked:['أُنهِيت جلسة حساب','Account session ended'],SECURITY_sessions_revoked:['أُنهِيت جلسات حساب','Account sessions ended']};
export function NotificationsPage(){
 const [ar]=useAccountLanguage(),data=useNotifications(),[error,setError]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const t=(a:string,e:string)=>ar?a:e;
 async function read(id:string){setBusy(id);setError(false);try{const r=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(!r.ok)throw Error();await data?.refresh()}catch{setError(true)}finally{setBusy(null)}}
 return <main id="main-content" className="notifications-page" dir={ar?'rtl':'ltr'}><header><h1>{t('الإشعارات','Notifications')}</h1><Link href="/settings">{t('الإعدادات','Settings')}</Link></header>
  {data?.sync!=='current'&&<p role="status">{t(data?.sync==='syncing'?'جارٍ تحميل الإشعارات…':'تعذّر تحديث الإشعارات.',data?.sync==='syncing'?'Loading notifications…':'Could not update notifications.')}{data?.sync!=='syncing'&&<button onClick={()=>void data?.refresh().catch(()=>setError(true))}>{t('إعادة المحاولة','Retry')}</button>}</p>}
  {data?.inbox&&(data.inbox.notifications.length?<ul>{data.inbox.notifications.map(n=>{
   const href=n.kind.startsWith('SUPPORT_')?(n.staff?'/operations/support':'/settings/support')+'?ticket='+encodeURIComponent(n.reference):n.kind.startsWith('SECURITY_')?'/settings#active-sessions':n.kind.includes('DEPOSIT')?'/wallet#deposit':'/activity';
   return <li key={n.id} data-unread={!n.readAt}><div><strong>{labels[n.kind]?.[ar?0:1]??t('تحديث في حسابك','Account update')}</strong><time dateTime={n.createdAt}>{new Intl.DateTimeFormat(ar?'ar-SY':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(n.createdAt))}</time><Link href={href}>{t('عرض التفاصيل','View details')}</Link></div>{!n.readAt&&<button disabled={busy!==null} onClick={()=>void read(n.id)}><Check size={16}/>{t('تحديد كمقروء','Mark read')}</button>}</li>;
  })}</ul>:<p>{t('لا توجد إشعارات','No notifications') }</p>)}
  {error&&<p role="alert">{t('تعذّر تأكيد الطلب. حاول مجددًا.','Could not confirm the request. Please retry.')}</p>}
 </main>;
}
