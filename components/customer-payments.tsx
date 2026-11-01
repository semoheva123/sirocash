'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {FinancialHistory} from './financial-history';
import {useFinancialStatus} from './use-financial-status';
import {FinancialSyncStatus} from './financial-sync-status';
import {authorizePayment} from '@/lib/authorize-payment';
type Prepared={kind:'TRANSFER'|'WITHDRAWAL';path:string;id?:string;payload:Record<string,string>;expiresAt?:string};
async function call(path:string,body?:unknown,token?:string){const r=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json',...(token?{'x-siro-approval':token}:{})}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error??'تعذّر تأكيد نتيجة الطلب.');return data}
export function CustomerPayments(){
 const [deposit,setDeposit]=useState<{chain:string;address:string}|null>(null),[ar,setAr]=useState(true),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState<'TRANSFER'|'WITHDRAWAL'>('TRANSFER'),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[chain,setChain]=useState('TRC20'),[prepared,setPrepared]=useState<Prepared|null>(null),[attempted,setAttempted]=useState(false),[submitted,setSubmitted]=useState<unknown>(null),[requestKey,setRequestKey]=useState('');
 const t=(a:string,e:string)=>ar?a:e;
 const {status,sync,updatedAt,refresh}=useFinancialStatus();
 useEffect(()=>{setAr(localStorage.getItem('siro-language')!=='en');setRequestKey('customer:'+crypto.randomUUID());if(new URL(window.location.href).searchParams.get('kind')==='WITHDRAWAL')setKind('WITHDRAWAL');},[]);
 function edit(){if(attempted&&!submitted)return;setAttempted(false);setPrepared(null);setSubmitted(null);setRequestKey('customer:'+crypto.randomUUID())}
 const input={kind,recipient,amount,requestKey,...(kind==='WITHDRAWAL'?{chain,asset:'USDT'}:{})};
 async function prepare(e:React.FormEvent){e.preventDefault();setBusy(true);setNotice('');try{setPrepared(await call('/api/financial/prepare',input))}catch(e){setNotice(e instanceof Error?e.message:'تعذّر إنشاء العرض.')}finally{setBusy(false)}}
 async function submit(){if(!prepared)return;setBusy(true);setNotice('');try{
  const token=await authorizePayment(prepared.path,prepared.payload);
  setAttempted(true);
  const result=await call(prepared.kind==='TRANSFER'?'/api/financial/transfer':'/api/financial/withdraw',prepared.kind==='TRANSFER'?input:{quoteId:prepared.id},token);
  setSubmitted(result);setNotice(prepared.kind==='TRANSFER'?t('اكتمل التحويل الداخلي.','Internal transfer completed.'):t('حُجز مبلغ السحب. لا يعني ذلك تأكيد التحويل على الشبكة.','Withdrawal reserved; this is not an on-chain confirmation.'));await refresh().catch(()=>setNotice(t('تم قبول الطلب، لكن تعذّر تحديث قائمة العمليات. لا تُعِد إنشاء الطلب.','Command accepted, but history refresh failed. Do not create a duplicate command.')));
 }catch(e){setNotice(e instanceof Error?e.message:'تعذّر تأكيد النتيجة.');/* Preserve exact request/quote for retry. Never generate a second command after an unknown result. */}finally{setBusy(false)}}
 return <main className="section-width app-main" dir={ar?'rtl':'ltr'} lang={ar?'ar':'en'}>
  <Link href="/dashboard">{t('العودة إلى المحفظة','Back to wallet')}</Link><h1>{t('الطلبات المالية','Financial commands')}</h1>
  <p>{t('كل طلب مرتبط بحسابك وتفويض جهازك. لا تُدخل مفاتيح محافظ أو عبارة استرداد.','Every command is bound to your account and device approval. Never enter wallet keys or recovery phrases.')}</p>
  <FinancialSyncStatus sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
  {notice&&<p role="status">{notice}</p>}
  {!status?<p>{t('جارٍ التحقق من توفر الخدمة…','Checking availability…')}</p>:!status.enabled?<section className="card"><h2>{t('التنفيذ المالي غير مفعّل','Financial execution is disabled')}</h2><p>{t('هذه الواجهة جاهزة برمجيًا، لكنها لا تتجاوز إعدادات التشغيل أو حدود المصاريف. لم تُنفّذ أي عملية.','This interface does not bypass deployment gates or spending limits. No command has executed.')}</p></section>:<>
   <section className="card"><h2>{t('بيانات الحساب','Account')}</h2><p>{t('معرّف الاستلام','Receiving ID')}: <code dir="ltr">{status.userId}</code></p><p>{t('الرصيد الدفتري / المحجوز بالدولار','Posted / held USD')}: <span dir="ltr">{status.balance?.posted} / {status.balance?.held}</span></p></section>
   {(!status.capabilities?.withdrawals||!status.capabilities?.deposits)&&<p role="status">{t('التحويل الداخلي متاح؛ بعض خدمات الإيداع أو السحب لم تُفعّل بعد.','Internal transfers are available; some deposit or withdrawal services are not yet enabled.')}</p>}
   <section className="card"><h2>{t('إيداع USDT','Deposit USDT')}</h2><p>{t('العنوان مخصص لحسابك. استخدم الشبكة المطابقة فقط؛ يظهر الرصيد بعد نهائية المعاملة والتحقق منها.','The address is assigned to your account. Use the exact network; credit follows verified finality.')}</p>{(['TRC20','BEP20'] as const).map(network=><button key={network} className="button secondary" disabled={busy||!status.capabilities?.deposits} onClick={async()=>{setBusy(true);setDeposit(null);try{setDeposit(await call('/api/deposit/generate-address',{chain:network,asset:'USDT'}))}catch(e){setNotice(e instanceof Error?e.message:'Deposit unavailable')}finally{setBusy(false)}}}>{network}</button>)}{deposit&&<p>{deposit.chain}: <code dir="ltr" style={{overflowWrap:'anywhere'}}>{deposit.address}</code></p>}</section>
   <form className="card" onSubmit={prepare}><h2>{t('إنشاء طلب','Prepare command')}</h2><fieldset disabled={busy||!!prepared||sync!=='current'}>
    <label>{t('نوع الطلب','Command type')}<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="TRANSFER">{t('تحويل داخلي · عمولة 1% على المرسل','Internal transfer · 1% sender fee')}</option><option value="WITHDRAWAL" disabled={!status.capabilities?.withdrawals}>{t('سحب USDT','USDT withdrawal')}</option></select></label>
    {kind==='WITHDRAWAL'&&<label>{t('الشبكة','Network')}<select value={chain} onChange={e=>setChain(e.target.value)}><option>TRC20</option><option>BEP20</option></select></label>}
    <label>{kind==='TRANSFER'?t('معرّف حساب المستفيد','Recipient account ID'):t('عنوان المحفظة المستفيدة','Destination wallet address')}<input required dir="ltr" value={recipient} onChange={e=>setRecipient(e.target.value)} autoComplete="off"/></label>
    <label>{kind==='TRANSFER'?t('المبلغ بالدولار، قبل العمولة','USD amount before fee'):t('مبلغ USDT الإجمالي، شاملاً رسم السحب','Gross USDT including withdrawal fee')}<input required dir="ltr" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   </fieldset><button className="button" disabled={busy||!!prepared||sync!=='current'} type="submit">{t('عرض التفاصيل قبل التفويض','Review before approval')}</button></form>
   {prepared&&<section className="card"><h2>{t('راجع تفاصيل الطلب','Review command')}</h2><dl>{Object.entries(prepared.payload).filter(([key])=>['recipient','amount','fee','netAmount','totalDebit','grossUsd','feeUsd','netUsd','chain','asset'].includes(key)).map(([key,value])=><div key={key}><dt>{({recipient:t('المستفيد','Recipient'),amount:t('المبلغ','Amount'),fee:t('الرسم','Fee'),netAmount:t('صافي المستلم','Recipient net'),totalDebit:t('إجمالي الخصم','Total debit'),grossUsd:t('الخصم بالدولار','USD debit'),feeUsd:t('الرسم بالدولار','USD fee'),netUsd:t('الصافي بالدولار','USD net'),chain:t('الشبكة','Network'),asset:t('العملة','Asset')} as Record<string,string>)[key]}</dt><dd dir="ltr">{value}</dd></div>)}</dl>
    {prepared.expiresAt&&<p>{t('انتهاء العرض','Quote expiry')}: <time>{new Date(prepared.expiresAt).toLocaleString(ar?'ar':'en')}</time></p>}
    <p>{t('يُستخدم سعر صرف مرصود ومحفوظ، وليس افتراض تعادل USDT مع الدولار.','The stored observed exchange rate is used; USDT is not assumed equal to USD.')}</p>
    <button className="button" disabled={busy||!!submitted||sync!=='current'} onClick={()=>void submit()}>{busy?t('جارٍ التحقق…','Verifying…'):t('تفويض الجهاز وتأكيد الطلب','Approve with device and confirm')}</button>
    {attempted&&!submitted&&<p role="alert">{t('نتيجة الإرسال غير مؤكدة. أعد المحاولة بالطلب نفسه فقط؛ لا تُنشئ طلبًا بديلًا.','Submission outcome is uncertain. Retry this exact command only; do not create a replacement.')}</p>}
    <button className="button secondary" disabled={busy||(attempted&&!submitted)} onClick={edit}>{submitted?t('طلب جديد','New command'):t('تعديل العرض','Edit quote')}</button>
   </section>}
   <FinancialHistory status={status} ar={ar}/>
  </>}
 </main>;
}
