'use client';
import {clientRequest} from '@/lib/client-request';
import Link from 'next/link';
import {useNotifications} from './account-notifications';
import {useEffect,useRef,useState,useCallback} from 'react';
import {ArrowLeft,ArrowRight,Check,ChevronDown,Headphones,LockKeyhole,MessageSquare,Plus,Send,ShieldCheck,X} from 'lucide-react';
import {useAccountLanguage} from './account-language';
type Cursor={at:string;id:string}|null;
type Ticket={id:string;subject:string;category:string;status:string;createdAt:string;updatedAt:string};
type Message={id:string;body:string;fromSupport:boolean;createdAt:string};
const categories=[['ACCOUNT','الحساب والأمان','Account & security'],['DEPOSIT','الإيداعات','Deposits'],['TRANSFER','التحويلات','Transfers'],['OTHER','استفسار آخر','Something else']] as const;
export function SupportCenter({staff=false}:{staff?:boolean}){
 const notifications=useNotifications();
 const liveInbox=useRef<unknown>(null);
 const [ar]=useAccountLanguage(),t=(a:string,e:string)=>ar?a:e;
 const [tickets,setTickets]=useState<Ticket[]>([]),[next,setNext]=useState<Cursor>(null),[ticket,setTicket]=useState<Ticket|null>(null),[messages,setMessages]=useState<Message[]>([]),[older,setOlder]=useState<Cursor>(null);
 const [compose,setCompose]=useState(false),[subject,setSubject]=useState(''),[category,setCategory]=useState('ACCOUNT'),[body,setBody]=useState(''),[reply,setReply]=useState('');
 const [loading,setLoading]=useState(true),[threadLoading,setThreadLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false),[pending,setPending]=useState(false);
 const active=useRef<string|null>(null),epoch=useRef(0),mounted=useRef(true),lock=useRef(false),key=useRef<string|null>(null);
 const api=useCallback(async(path:string,init?:RequestInit)=>{
  const response=await clientRequest('/api/support'+path+(path.includes('?')?'&':'?')+(staff?'staff=1':'staff=0'),{cache:'no-store',...init});
  if(response.status===401){window.location.replace('/auth?mode=login');throw Error()}
  if(!response.ok)throw Error(response.status===429?'LIMIT':response.status===409?'CONFLICT':response.status===400?'INVALID':'UNAVAILABLE');
  return response.json();
 },[staff]);
 const fail=(e:unknown)=>setError(e instanceof Error&&e.message==='LIMIT'?t('بلغت حد الطلبات. حاول لاحقاً.','Request limit reached. Please try later.'):e instanceof Error&&e.message==='CONFLICT'?t('الطلب مغلق أو تغيّرت بيانات المحاولة. أعد فتح المحادثة للتحقق.','This request is closed or the retry differs. Reopen the conversation to check.'):t('تعذّر إكمال الطلب. احتفظنا بنص رسالتك؛ يمكنك إعادة المحاولة.','Could not complete the request. Your draft is preserved; you can retry.'));
 const load=useCallback(async(cursor:Cursor=null)=>{
  const generation=epoch.current;
  try{const data=await api(cursor?'?before='+encodeURIComponent(JSON.stringify(cursor)):'');if(!mounted.current||generation!==epoch.current)return;setTickets(previous=>cursor?[...previous,...data.tickets.filter((x:Ticket)=>!previous.some(p=>p.id===x.id))]:data.tickets);setNext(data.next)}finally{if(mounted.current)setLoading(false)}
 },[api]);
 async function open(id:string,cursor:Cursor=null){
  if(lock.current)return;
  const previous=active.current;active.current=id;setCompose(false);setThreadLoading(true);setError('');setSent(false);
  if(previous!==id){setTicket(null);setMessages([]);setReply('');key.current=null;setPending(false)}
  const generation=++epoch.current;
  try{const data=await api('/'+id+(cursor?'?before='+encodeURIComponent(JSON.stringify(cursor)):''));if(!mounted.current||generation!==epoch.current)return;setTicket(data.ticket);setMessages(previous=>cursor?[...data.messages.filter((m:Message)=>!previous.some(p=>p.id===m.id)),...previous]:data.messages);setOlder(data.next)}catch(e){if(generation===epoch.current)fail(e)}finally{if(generation===epoch.current)setThreadLoading(false)}
 }
 useEffect(()=>{mounted.current=true;void load().catch(()=>setError(ar?'تعذّر تحميل الطلبات.':'Could not load requests.'));return()=>{mounted.current=false;epoch.current++}},[load]);
 // Database-driven invalidation only; never a periodic fetch. Preserve drafts/pending writes.
 useEffect(()=>{
  if(!notifications?.inbox||liveInbox.current===notifications.inbox||lock.current||pending)return;
  liveInbox.current=notifications.inbox;
  void (async()=>{if(active.current)await open(active.current);await load()})().catch(()=>{});
 },[notifications?.inbox,pending,load]);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search),reference=params.get('reference');
  if(reference&&/^[0-9a-f-]{36}$/i.test(reference)){setCompose(true);setSubject(t('استفسار عن معاملة','Transaction inquiry'));setBody(t('مرجع المعاملة: ','Transaction reference: ')+reference+'\n');}
  const id=params.get('ticket');
  if(id&&/^[0-9a-f-]{36}$/i.test(id))void open(id);
 },[]);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(lock.current)return;
  const creating=compose;if(!creating&&!ticket)return;
  lock.current=true;setBusy(true);setError('');setSent(false);setPending(true);
  key.current??=crypto.randomUUID();
  try{
   const result=await api(creating?'':'/'+ticket!.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(creating?{action:'create',subject,category,body,requestKey:key.current}:{action:'reply',body:reply,requestKey:key.current})});
   key.current=null;setPending(false);if(creating){setSubject('');setBody('')}else setReply('');
   lock.current=false;await open(result.id);setSent(true);void load().catch(()=>{});
  }catch(e){if(e instanceof Error&&['LIMIT','CONFLICT','INVALID'].includes(e.message)){setPending(false);key.current=null}fail(e)}finally{lock.current=false;setBusy(false)}
 }
 async function close(){if(!ticket||lock.current||!window.confirm(t('إغلاق هذا الطلب؟ سيبقى سجل المحادثة محفوظاً.','Close this request? The conversation will remain available.')))return;lock.current=true;setBusy(true);setError('');try{await api('/'+ticket.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close'})});lock.current=false;await open(ticket.id);await load()}catch(e){fail(e)}finally{lock.current=false;setBusy(false)}}
 const label=(status:string)=>status==='CLOSED'?t('مغلق','Closed'):status==='WAITING_CUSTOMER'?t('ردّ فريق الدعم','Support replied'):t('بانتظار الدعم','Awaiting support');
 const time=(value:string)=>new Intl.DateTimeFormat(ar?'ar':'en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 return <main id="main-content" className="support-workspace" dir={ar?'rtl':'ltr'}>
  <header className="support-heading"><Link href="/settings" className="support-back" aria-label={t('العودة','Back')}>{ar?<ArrowRight size={20}/>:<ArrowLeft size={20}/>}</Link><div><span className="support-eyebrow">SIRO CASH / {staff?'SUPPORT DESK':'CARE'}</span><h1>{staff?t('مكتب الدعم','Support desk'):t('نحن هنا لمساعدتك','Here to help')}</h1><p>{staff?t('محادثات العملاء · وصول إداري مقيّد','Customer conversations · restricted staff access'):t('تواصل مباشر مع فريق الدعم، في مساحة خاصة بحسابك.','A direct conversation with our team, private to your account.')}</p></div><Headphones className="support-hero-icon" size={34}/></header>
  <div className={"support-layout"+(compose?" composing":"")}><aside className="support-inbox"><div className="support-inbox-heading"><h2>{t('الطلبات','Requests')}</h2><button type="button" disabled={busy||threadLoading} onClick={()=>{setError('');void load().catch(fail);if(ticket)void open(ticket.id)}}>{t('تحديث','Refresh')}</button></div>
   {!staff&&<button className="support-new" disabled={busy||pending} onClick={()=>{epoch.current++;active.current=null;setCompose(true);setTicket(null);setMessages([]);setError('');setSent(false);setThreadLoading(false);key.current=null}}><Plus size={18}/>{t('طلب دعم جديد','New request')}</button>}
   <div className="support-ticket-list">{loading?<p role="status">{t('جارٍ تحميل طلباتك…','Loading requests…')}</p>:tickets.length===0?<div className="support-list-empty"><MessageSquare size={24}/><p>{t('لا توجد طلبات بعد','No requests yet')}</p></div>:tickets.map(item=><button key={item.id} className={'support-ticket '+(ticket?.id===item.id?'selected':'')} disabled={busy||pending} onClick={()=>void open(item.id)}><span className={'support-state '+item.status.toLowerCase()}>{label(item.status)}</span><strong>{item.subject}</strong><small>{time(item.updatedAt)}</small></button>)}</div>
   {next&&<button type="button" className="support-more" disabled={busy} onClick={()=>void load(next).catch(fail)}>{t('طلبات أقدم','Older requests')}<ChevronDown size={16}/></button>}
  </aside><section className="support-detail" aria-busy={busy||threadLoading}>
   {compose?<><div className="support-detail-heading"><span className="support-icon"><Send size={23}/></span><div><span className="support-eyebrow">{t('لنبدأ بالتفاصيل','LET’S START WITH THE DETAILS')}</span><h2>{t('كيف يمكننا مساعدتك؟','How can we help?')}</h2></div></div><form onSubmit={submit} className="support-form"><fieldset disabled={busy||pending}><label htmlFor="support-category">{t('نوع الاستفسار','Topic')}</label><select id="support-category" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(([value,a,e])=><option key={value} value={value}>{ar?a:e}</option>)}</select><label htmlFor="support-subject">{t('عنوان الطلب','Subject')}</label><input id="support-subject" required minLength={4} maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)} placeholder={t('عنوان واضح يساعدنا على فهم طلبك','A clear summary of your request')}/><label htmlFor="support-body">{t('رسالتك','Your message')}</label><textarea id="support-body" required minLength={2} maxLength={4000} rows={8} value={body} onChange={e=>setBody(e.target.value)} placeholder={t('اشرح ما حدث، ومتى حدث، وما المساعدة التي تحتاجها. يمكنك إضافة مرجع العملية إن وجد.','Tell us what happened, when, and how we can help. Include the transaction reference if relevant.')}/><small className="support-character-count">{body.length} / 4000</small></fieldset><div className="support-safety"><LockKeyhole size={18}/><p>{t('لا ترسل كلمات المرور، رموز التحقق، المفاتيح الخاصة أو عبارات الاسترداد. لا يطلبها فريق الدعم أبداً.','Never share passwords, verification codes, private keys or recovery phrases. Support will never ask for them.')}</p></div><button className="support-submit" type="submit" disabled={busy}>{busy?t('جارٍ الحفظ…','Saving…'):pending?t('إعادة المحاولة بنفس الرسالة','Retry the same message'):t('إرسال الطلب','Send request')}<Send size={18}/></button><p className="support-footnote">{t('يُحفظ الطلب في حسابك. لا يُعرض تأكيد الإرسال إلا بعد حفظه فعلياً.','Your request stays in your account. Confirmation appears only after it is saved.')}</p></form></>:ticket?<><div className="support-detail-heading"><div><span className={'support-state '+ticket.status.toLowerCase()}>{label(ticket.status)}</span><h2>{ticket.subject}</h2><p className="support-reference" dir="ltr">#{ticket.id.slice(0,8).toUpperCase()}</p></div>{staff&&ticket.status!=='CLOSED'&&<button className="support-close" disabled={busy} onClick={()=>void close()}><X size={16}/>{t('إغلاق الطلب','Close request')}</button>}</div>
    {older&&<button className="support-more" disabled={busy||threadLoading} onClick={()=>void open(ticket.id,older)}>{t('رسائل أقدم','Earlier messages')}</button>}
    <div className="support-messages" aria-label={t('المحادثة','Conversation')}>{messages.map(message=><article className={'support-message '+(message.fromSupport?'from-team':'from-customer')} key={message.id}><header><strong>{message.fromSupport?<><ShieldCheck size={15}/>{t('فريق Siro Cash','Siro Cash team')}</>:t('العميل','Customer')}</strong><time dateTime={message.createdAt}>{time(message.createdAt)}</time></header><p dir="auto">{message.body}</p></article>)}</div>
    {ticket.status==='CLOSED'?<div className="support-safety"><Check size={18}/><p>{t('أُغلق هذا الطلب. يمكنك الرجوع إلى سجل المحادثة أو إنشاء طلب جديد.','This request is closed. You can view its conversation or create a new request.')}</p></div>:<form onSubmit={submit} className="support-form support-reply"><label htmlFor="support-reply">{staff?t('ردّ فريق الدعم','Support reply'):t('إضافة رد','Add a reply')}</label><textarea id="support-reply" required minLength={2} maxLength={4000} rows={4} value={reply} disabled={busy||pending} onChange={e=>setReply(e.target.value)} placeholder={t('اكتب ردّك هنا…','Write your reply…')}/><small>{reply.length} / 4000 · {t('لا تُشارك معلومات سرّية','Do not share secrets')}</small><button className="support-submit" type="submit" disabled={busy}>{busy?t('جارٍ الحفظ…','Saving…'):pending?t('إعادة المحاولة بنفس الرسالة','Retry the same message'):t('إرسال الرد','Send reply')}<Send size={18}/></button></form>}
   </>:threadLoading?<p className="support-welcome" role="status">{t('جارٍ تحميل المحادثة…','Loading conversation…')}</p>:<div className="support-welcome"><span className="support-icon"><MessageSquare size={32}/></span><h2>{t('كل محادثة، في مكان واحد','Every conversation, in one place')}</h2><p>{staff?t('اختر طلباً من القائمة لقراءة المحادثة والرد عليه.','Select a request to read and reply.'):t('أنشئ طلباً جديداً أو اختر محادثة سابقة لمتابعة الردود.','Start a new request or select a previous conversation to follow up.')}</p><span><ShieldCheck size={16}/>{t('مرتبط بحسابك · محفوظ بأمان','Account-bound · securely stored')}</span></div>}
   {sent&&<p role="status" className="support-success"><Check size={16}/>{t('حُفظت رسالتك بنجاح.','Your message has been saved.')}</p>}{pending&&!busy&&<p className="support-footnote">{t('لم يتأكد الحفظ. أعد المحاولة بنفس الرسالة لتجنّب التكرار.','Saving is unconfirmed. Retry the same message to avoid duplicates.')}</p>}{error&&<p role="alert" className="support-error">{error}</p>}
  </section></div><footer className="support-footer">{t('رسائل الأمان:','Security emails:')} <span dir="ltr">security@sirocash.online</span><span>·</span><span dir="ltr">support@sirocash.online</span> · {t('الدعم والردود داخل هذه المنصة','Support and replies are handled in this platform')}</footer>
 </main>;
}
