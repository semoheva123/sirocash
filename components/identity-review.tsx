'use client';
import {authorizePayment} from '@/lib/authorize-payment';
import {clientRequest} from '@/lib/client-request';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
type Request={id:string;kind:string;expiresAt:number|null;checks:unknown};
/** The workspace stays unlocked for this long without any reviewer action; the password is then dropped from memory. */
const idleLockMs=15*60*1000;
/** `authorize` is injectable for interaction tests only; production always uses the WebAuthn-bound approval. */
export function IdentityReview({authorize=authorizePayment}:{authorize?:typeof authorizePayment}={}){
 const [ar,setAr]=useState(true),[password,setPassword]=useState(''),[unlocked,setUnlocked]=useState(false),[requests,setRequests]=useState<Request[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(''),[confirmed,setConfirmed]=useState(false);
 // The current password lives only in component memory while the workspace is unlocked: never in storage, cookies or URLs.
 const lock=useRef(false),secret=useRef(''),idle=useRef<ReturnType<typeof setTimeout>|null>(null);
 const t=(en:string,a:string)=>ar?a:en;
 useEffect(()=>{setAr(localStorage.getItem('siro-language')!=='en')},[]);
 useEffect(()=>{document.documentElement.dir=ar?'rtl':'ltr';document.documentElement.lang=ar?'ar':'en'},[ar]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 const lockWorkspace=useCallback((message='')=>{secret.current='';if(idle.current){clearTimeout(idle.current);idle.current=null}setUnlocked(false);setPassword('');setRequests([]);setLoaded(false);setPreview('');setConfirmed(false);setError('');setNotice(message)},[]);
 const touch=useCallback(()=>{if(idle.current)clearTimeout(idle.current);idle.current=setTimeout(()=>lockWorkspace(ar?'أُقفلت المساحة تلقائيًا بعد فترة خمول. أدخل كلمة المرور مرة أخرى للمتابعة.':'Workspace locked automatically after inactivity. Enter your password again to continue.'),idleLockMs)},[ar,lockWorkspace]);
 useEffect(()=>()=>{secret.current='';if(idle.current)clearTimeout(idle.current)},[]);
 async function action(input:Record<string,unknown>,entered?:string){
  if(lock.current)return;
  const current=entered??secret.current;
  if(!current){setError(t('Enter your current password once to open the review workspace.','أدخل كلمة مرورك الحالية مرة واحدة لفتح مساحة المراجعة.'));return}
  lock.current=true;setBusy(true);setError('');setNotice('');if(input.action!=='list')setPreview('');
  try{
   // Device verification stays bound to every individual action; only the password prompt is per session.
   const approval=await authorize('/api/identity/review',input);
   const r=await clientRequest('/api/identity/review',{method:'POST',headers:{'Content-Type':'application/json','x-siro-approval':approval},body:JSON.stringify({...input,password:current})});
   if(!r.ok){const d=await r.json().catch(()=>({}));if(r.status===403&&entered===undefined){lockWorkspace(d.error||t('Authority could not be confirmed. Enter your password again.','تعذّر تأكيد الصلاحية. أدخل كلمة المرور مرة أخرى.'));return}throw Error(d.error||(entered!==undefined?t('Password or reviewer authority could not be confirmed.','تعذّر تأكيد كلمة المرور أو صلاحية المراجع.'):t('Review failed.','تعذّر إكمال الإجراء.')))}
   if(entered!==undefined){secret.current=entered;setPassword('');setUnlocked(true)}
   touch();
   if(input.action==='document')setPreview(URL.createObjectURL(await r.blob()));
   else{const d=await r.json();if(input.action==='list'){setRequests(d.requests);setLoaded(true)}else{setRequests(prev=>prev.filter(x=>x.id!==input.id));setConfirmed(false);setNotice(t('Decision recorded.','تم تسجيل القرار.'))}}
  }catch(e){setError(e instanceof Error?e.message:t('Result not confirmed. Reload pending requests before making another decision.','النتيجة غير مؤكدة. أعد تحميل الطلبات المعلّقة قبل اتخاذ قرار آخر.'));if(entered!==undefined)setPassword('')}
  finally{setBusy(false);lock.current=false}
 }
 return <main className="section-width settings-main identity-review-main" id="main-content"><Link href="/settings">{t('Back to settings','العودة إلى الإعدادات')}</Link><div className="settings-heading"><h1>{t('Identity document review','مراجعة وثائق الهوية')}</h1><p>{t('Restricted workspace. Your current password is entered once to open it; each decision still requires device verification and is audited. OCR only assists reading; it cannot establish authenticity, liveness or document ownership. Never approve your own request.','مساحة مقيّدة. تُدخل كلمة المرور الحالية مرة واحدة لفتحها؛ ويبقى كل قرار مرتبطًا بتحقق الجهاز ومسجّلًا. قراءة النص أداة مساعدة ولا تثبت الأصالة أو الحيوية أو ملكية الوثيقة. يُحظر قبول طلبك الشخصي.')}</p></div>
 {!unlocked&&<form className="identity-form glass settings-card" onSubmit={e=>{e.preventDefault();void action({action:'list'},password)}}><label htmlFor="review-password">{t('Current password — once per visit','كلمة المرور الحالية — مرة واحدة لكل زيارة')}</label><input id="review-password" type="password" autoComplete="current-password" maxLength={128} required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/><button className="button" disabled={busy||!password}>{busy?t('Opening…','جارٍ الفتح…'):t('Open review workspace','فتح مساحة المراجعة')}</button><p className="settings-description">{t('The workspace locks automatically after 15 minutes without activity or when you leave the page.','تُقفل المساحة تلقائيًا بعد 15 دقيقة من دون نشاط أو عند مغادرة الصفحة.')}</p></form>}
 {unlocked&&<div className="identity-review-toolbar glass settings-card"><div><strong>{t('Workspace open','المساحة مفتوحة')}</strong><span className="settings-description">{loaded?t(`${requests.length} pending request(s)`,`${requests.length} طلب معلّق`):t('Loading…','جارٍ التحميل…')}</span></div><div className="identity-actions"><button className="button secondary" disabled={busy} onClick={()=>void action({action:'list'})}>{t('Refresh','تحديث')}</button><button className="button secondary" disabled={busy} onClick={()=>lockWorkspace(t('Workspace locked.','أُقفلت المساحة.'))}>{t('Lock','قفل')}</button></div></div>}
 {notice&&<p className="settings-note" role="status">{notice}</p>}
 {error&&<p className="service-error" role="alert">{error}</p>}
 {preview&&<section className="identity-review-preview-panel glass settings-card" aria-label={t('Private document preview','معاينة خاصة للوثيقة')}><button className="button secondary" onClick={()=>setPreview('')}>{t('Close document','إغلاق الوثيقة')}</button>{/* Blob is private, ephemeral and revoked on close/unmount. */}<img src={preview} alt={t('Submitted identity document','وثيقة الهوية المقدّمة')} className="identity-review-preview"/></section>}
 {unlocked&&loaded&&requests.length===0&&<p className="identity-review-empty glass settings-card">{t('No pending requests right now.','لا توجد طلبات معلّقة حاليًا.')}</p>}
 {unlocked&&requests.length>0&&<label className="identity-consent glass settings-card"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{t('I personally reviewed the complete document and understand this is not an automated authenticity or biometric check.','راجعتُ الوثيقة كاملةً بنفسي وأفهم أن الفحص ليس تحققًا آليًا من الأصالة أو الهوية البيومترية.')}</label>}
 <div className="identity-review-list">{requests.map(r=><article key={r.id}><div className="identity-review-head"><h2 dir="ltr">{r.kind}</h2><p className="identity-review-id" dir="ltr">{r.id}</p></div><p className="settings-description">{r.expiresAt===null?t('Retained while account is registered and not closed.','تُحفظ ما دام الحساب مسجّلًا وغير مغلق.'):t('Scheduled deletion: ','الحذف المجدول: ')+new Date(r.expiresAt).toLocaleDateString(ar?'ar':'en-GB')}</p><details><summary>{t('Initial processing diagnostics','نتائج الفحص الأولي')}</summary><pre dir="ltr">{JSON.stringify(r.checks,null,2)}</pre></details><h3>{t('Documents','الوثائق')}</h3><div className="identity-actions">{(r.kind==='passport'?['front']:['front','back']).map(side=><button className="button secondary" key={side} disabled={busy} onClick={()=>action({action:'document',id:r.id,side})}>{side==='front'?t('View front','عرض الأمام'):t('View back','عرض الخلف')}</button>)}</div><h3>{t('Decision','القرار')}</h3>{!confirmed&&<p className="settings-description">{t('Tick the confirmation above to enable decisions.','فعّل خانة التأكيد أعلاه لتمكين القرارات.')}</p>}<div className="identity-actions"><button className="button" disabled={busy||!confirmed} onClick={()=>action({action:'decision',id:r.id,status:'approved',confirmed})}>{t('Approve document review','قبول مراجعة الوثائق')}</button>{(['unreadable','incomplete','unsupported','details_mismatch'] as const).map((reason,i)=><button className="button secondary" key={reason} disabled={busy||!confirmed} onClick={()=>action({action:'decision',id:r.id,status:'resubmit',reason,confirmed})}>{(ar?['صورة غير واضحة','وثائق غير مكتملة','وثيقة غير مدعومة','بيانات غير متطابقة']:['Unreadable','Incomplete','Unsupported','Details mismatch'])[i]}</button>)}</div></article>)}</div>
 </main>;
}
