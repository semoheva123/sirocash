'use client';
import {SendRoutePicker} from './send-route-picker';
import {WalletPageHeader} from './wallet-page-header';
import {previewInternalTransfer} from '@/lib/transfer-preview';
import {TransferFeePreview} from './transfer-fee-preview';
import {DeliveryMethods,type DeliveryMethod} from './delivery-methods';
import {displayAvailableBalance} from '@/lib/account-overview';
import {WithdrawalFeeSummary} from './withdrawal-fee-summary';
import {AccountNavigation} from './account-navigation';
import {useEffect,useState} from 'react';
import {FinancialHistory} from './financial-history';
import {useFinancialStatus} from './use-financial-status';
import {FinancialSyncStatus} from './financial-sync-status';
import {withdrawalPrefill,internalTransferPrefill} from '@/lib/wallet-presentation';
import {authorizePayment} from '@/lib/authorize-payment';
type Prepared={kind:'TRANSFER'|'WITHDRAWAL';path:string;id?:string;payload:Record<string,string>;expiresAt?:string};
async function call(path:string,body?:unknown,token?:string){const r=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json',...(token?{'x-siro-approval':token}:{})}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error??'تعذّر تأكيد نتيجة الطلب.');return data}
export function CustomerPayments({view='payments'}:{view?:'payments'|'withdraw'|'send'}){
 const withdrawalOnly=view==='withdraw';
 const [sendRoute,setSendRoute]=useState<'choose'|'internal'|'external'>('choose'),[transferStep,setTransferStep]=useState(0);
 const guided=view==='send';
 const [deliveryMethod,setDeliveryMethod]=useState<DeliveryMethod>('internal');
 const [ar,setAr]=useState(true),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState<'TRANSFER'|'WITHDRAWAL'>(withdrawalOnly?'WITHDRAWAL':'TRANSFER'),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[chain,setChain]=useState('TRC20'),[prepared,setPrepared]=useState<Prepared|null>(null),[attempted,setAttempted]=useState(false),[submitted,setSubmitted]=useState<unknown>(null),[requestKey,setRequestKey]=useState('');
 const t=(a:string,e:string)=>ar?a:e;
 const {status,sync,updatedAt,refresh}=useFinancialStatus();
 useEffect(()=>{setAr(localStorage.getItem('siro-language')!=='en');setRequestKey('customer:'+crypto.randomUUID());const params=new URL(window.location.href).searchParams;if(withdrawalOnly||(view!=='send'&&params.get('kind')==='WITHDRAWAL')){setKind('WITHDRAWAL');const prefill=withdrawalPrefill(params);if(prefill){setChain(prefill.chain);setRecipient(prefill.recipient);setAmount(prefill.amount)}}else{const prefill=internalTransferPrefill(params);if(prefill){setRecipient(prefill.recipient);setAmount(prefill.amount)}}},[withdrawalOnly,view]);
 useEffect(()=>{document.documentElement.lang=ar?'ar':'en';document.documentElement.dir=ar?'rtl':'ltr'},[ar]);
 function edit(){if(attempted&&!submitted)return;setAttempted(false);setPrepared(null);setTransferStep(0);setSubmitted(null);setRequestKey('customer:'+crypto.randomUUID())}
 const canExecute=(view!=='send'||(sendRoute==='internal'&&deliveryMethod==='internal'))&&sync==='current'&&status?.enabled===true&&(kind==='WITHDRAWAL'?status.capabilities?.withdrawals===true:status.capabilities?.transfers===true);
 const input={kind,recipient,amount,requestKey,...(kind==='WITHDRAWAL'?{chain,asset:'USDT'}:{})};
 async function prepare(e:React.FormEvent){e.preventDefault();if(!canExecute)return;if(guided&&transferStep===0){if(!previewInternalTransfer(amount)){setNotice(t('أدخل مبلغًا صالحًا أكبر من صفر، وبحد أقصى 100,000 دولار.','Enter a valid amount above zero, up to 100,000 USD.'));return}setNotice('');setTransferStep(1);return}setBusy(true);setNotice('');try{setPrepared(await call('/api/financial/prepare',input))}catch(e){setNotice(e instanceof Error?e.message:'تعذّر إنشاء العرض.')}finally{setBusy(false)}}
 async function submit(){if(!prepared||!canExecute)return;setBusy(true);setNotice('');try{
  const token=await authorizePayment(prepared.path,prepared.payload);
  setAttempted(true);
  const result=await call(prepared.kind==='TRANSFER'?'/api/financial/transfer':'/api/financial/withdraw',prepared.kind==='TRANSFER'?input:{quoteId:prepared.id},token);
  setSubmitted(result);setNotice(prepared.kind==='TRANSFER'?t('اكتمل التحويل الداخلي.','Internal transfer completed.'):t('تم قبول طلب السحب وهو قيد المعالجة.','Withdrawal accepted and processing.'));await refresh().catch(()=>setNotice(t('تم قبول الطلب، لكن تعذّر تحديث قائمة العمليات. لا تُعِد إنشاء الطلب.','Command accepted, but history refresh failed. Do not create a duplicate command.')));
 }catch(e){setNotice(e instanceof Error?e.message:'تعذّر تأكيد النتيجة.');/* Preserve exact request/quote for retry. Never generate a second command after an unknown result. */}finally{setBusy(false)}}
 return <div className={`site-shell account-workspace pro-payments-workspace${guided?' guided-send':''}`}><AccountNavigation active={withdrawalOnly?"/withdraw":view==='send'?"/send":"/payments"} ar={ar}/><main id="main-content" className="section-width app-main pro-payments" dir={ar?'rtl':'ltr'} lang={ar?'ar':'en'}>
  <WalletPageHeader ar={ar} title={withdrawalOnly?t('سحب USDT','Withdraw USDT'):t('إرسال الأموال','Send money')} href="/dashboard" onBack={guided&&sendRoute!=='choose'?()=>{if(busy||(attempted&&!submitted))return;if(prepared){edit();return}if(transferStep>0){setTransferStep(0);return}setSendRoute('choose')}:undefined}/>
  <FinancialSyncStatus compact sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
  {guided&&sendRoute==='choose'&&<SendRoutePicker ar={ar} onChoose={route=>{setSendRoute(route);setDeliveryMethod(route==='internal'?'internal':'cash')}}/>}
  {guided&&sendRoute==='external'&&<DeliveryMethods externalOnly ar={ar} value={deliveryMethod} onChange={setDeliveryMethod}/>}
  {guided&&sendRoute==='internal'&&<ol className="transfer-progress" aria-label={t('خطوات التحويل','Transfer steps')}>{[t('المبلغ','Amount'),t('المستفيد','Recipient'),t('المراجعة','Review')].map((label,index)=><li key={label} aria-current={(prepared?2:transferStep)===index?'step':undefined}><span>{index+1}</span>{label}</li>)}</ol>}
  {notice&&<p role="status">{notice}</p>}
  {(!guided||sendRoute==='internal')&&(!status?<p>{t('جارٍ التحقق من توفر الخدمة…','Checking availability…')}</p>:<>
   {!withdrawalOnly&&!guided&&<section className="card"><h2>{t('إجمالي الرصيد','Total balance')}</h2><strong dir="ltr">{displayAvailableBalance(status,status.userId)} USD</strong><p>{t('معرّف الاستلام','Receiving ID')}: <code dir="ltr">{status.userId}</code></p></section>}
   {!canExecute&&<p role="status">{t('الخدمة غير متاحة حاليًا.','Service currently unavailable.')}</p>}
   {!prepared&&<form className="card" onSubmit={prepare}><h2>{kind==='WITHDRAWAL'?t('تفاصيل السحب','Withdrawal details'):guided?(transferStep===0?t('المبلغ المراد إرساله','How much would you like to send?'):t('إلى من ترسل؟','Who are you sending to?')):t('تفاصيل التحويل','Transfer details')}</h2><fieldset disabled={busy||!!prepared||!canExecute}>
    {!withdrawalOnly&&view!=='send'&&<label>{t('نوع الطلب','Command type')}<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="TRANSFER">{t('تحويل داخلي · عمولة 1% على المرسل','Internal transfer · 1% sender fee')}</option><option value="WITHDRAWAL" disabled={!status.capabilities?.withdrawals}>{t('سحب USDT','USDT withdrawal')}</option></select></label>}
    {kind==='WITHDRAWAL'&&<label>{t('الشبكة','Network')}<select value={chain} onChange={e=>setChain(e.target.value)}><option>TRC20</option><option>BEP20</option></select></label>}
    {(!guided||transferStep===1)&&<label>{kind==='TRANSFER'?t('معرّف حساب المستفيد','Recipient account ID'):t('عنوان المحفظة المستفيدة','Destination wallet address')}<input required dir="ltr" value={recipient} onChange={e=>setRecipient(e.target.value)} autoComplete="off"/></label>}
    {(!guided||transferStep===0)&&<label className={guided?'transfer-amount-field':undefined}>{kind==='TRANSFER'?t('المبلغ بالدولار، قبل العمولة','USD amount before fee'):t('مبلغ USDT الإجمالي، شاملاً رسم السحب','Gross USDT including withdrawal fee')}<input required dir="ltr" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label>}
    {kind==='TRANSFER'&&(!guided||transferStep===0)&&<TransferFeePreview amount={amount} ar={ar}/>}
    {kind==='WITHDRAWAL'&&<WithdrawalFeeSummary asset="USDT" network={chain} amount={amount} ar={ar}/>}
   </fieldset><button className="button" disabled={busy||!!prepared||!canExecute} type="submit">{guided&&transferStep===0?t('التالي','Continue'):t('عرض التفاصيل قبل التفويض','Review before approval')}</button></form>}
   {prepared&&<section className="card"><h2>{t('راجع تفاصيل الطلب','Review command')}</h2><dl>{Object.entries(prepared.payload).filter(([key])=>['recipient','amount','fee','netAmount','totalDebit','grossUsd','feeUsd','netUsd','chain','asset'].includes(key)).map(([key,value])=><div key={key}><dt>{({recipient:t('المستفيد','Recipient'),amount:t('المبلغ','Amount'),fee:t('الرسم','Fee'),netAmount:t('صافي المستلم','Recipient net'),totalDebit:t('إجمالي الخصم','Total debit'),grossUsd:t('الخصم بالدولار','USD debit'),feeUsd:t('الرسم بالدولار','USD fee'),netUsd:t('الصافي بالدولار','USD net'),chain:t('الشبكة','Network'),asset:t('العملة','Asset')} as Record<string,string>)[key]}</dt><dd dir="ltr">{value}</dd></div>)}</dl>
    {prepared.expiresAt&&<p>{t('انتهاء العرض','Quote expiry')}: <time>{new Date(prepared.expiresAt).toLocaleString(ar?'ar':'en')}</time></p>}
    <p>{prepared.kind==='TRANSFER'?t('يستلم المستفيد المبلغ كاملًا، وتُضاف عمولة 1% على المرسل. تحويل 100 دولار يخصم 101 دولار.','The recipient receives the full amount; a 1% fee is added to the sender. Sending $100 debits $101.'):t('يُستخدم سعر صرف مرصود ومحفوظ، وليس افتراض تعادل USDT مع الدولار.','The stored observed exchange rate is used; USDT is not assumed equal to USD.')}</p>
    <button className="button" disabled={busy||!!submitted||!canExecute} onClick={()=>void submit()}>{busy?t('جارٍ التحقق…','Verifying…'):t('تفويض الجهاز وتأكيد الطلب','Approve with device and confirm')}</button>
    {attempted&&!submitted&&<p role="alert">{t('نتيجة الإرسال غير مؤكدة. أعد المحاولة بالطلب نفسه فقط؛ لا تُنشئ طلبًا بديلًا.','Submission outcome is uncertain. Retry this exact command only; do not create a replacement.')}</p>}
    <button className="button secondary" disabled={busy||(attempted&&!submitted)} onClick={edit}>{submitted?t('طلب جديد','New command'):t('تعديل العرض','Edit quote')}</button>
   </section>}
   {view!=='send'&&<FinancialHistory status={status} ar={ar} showBalance={false} scope={withdrawalOnly?'withdrawals':'all'}/>}
  </>)}

 </main></div>;
}
