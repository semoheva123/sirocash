'use client';
import {ActionNotice} from './action-notice';
import {withdrawalReceiptState} from '@/lib/withdrawal-receipt';
import {InternalTransferSuccess} from './internal-transfer-success';
import {completedInternalTransfer} from '@/lib/internal-transfer-receipt';
import {useAccountLanguage} from './account-language';
import {ReceivingIdentityPanel,RecipientIdentityCard} from './receiving-identity';
import {normalizeUid,type ReceivingIdentity} from '@/lib/receiving-uid';
import {SendRoutePicker} from './send-route-picker';
import {WalletPageHeader} from './wallet-page-header';
import {previewInternalTransfer} from '@/lib/transfer-preview';
import {TransferFeePreview} from './transfer-fee-preview';
import {DeliveryMethods,type DeliveryMethod} from './delivery-methods';
import {displayAvailableBalance} from '@/lib/account-overview';
import {WithdrawalFeeSummary} from './withdrawal-fee-summary';
import {AccountNavigation} from './account-navigation';
import {useEffect,useRef,useState} from 'react';
import {FinancialHistory} from './financial-history';
import {useFinancialStatus} from './use-financial-status';
import {FinancialSyncStatus} from './financial-sync-status';
import {withdrawalPrefill,internalTransferPrefill} from '@/lib/wallet-presentation';
import {authorizePayment} from '@/lib/authorize-payment';
type Prepared={recipientIdentity?:ReceivingIdentity;kind:'TRANSFER'|'WITHDRAWAL';path:string;id?:string;payload:Record<string,string>;expiresAt?:string};
async function call(path:string,body?:unknown,token?:string,ar=true){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch(path,{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json',...(token?{'x-siro-approval':token}:{})}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error??'تعذّر تأكيد نتيجة الطلب.');return data}catch(error){if(error instanceof Error&&error.name==='AbortError')throw Error(ar?'انتهت مهلة انتظار النتيجة. راجع السجل قبل إعادة المحاولة.':'Timed out waiting for the result. Check history before retrying.');if(error instanceof TypeError)throw Error(ar?'تعذّر الاتصال لتأكيد النتيجة. تحقّق من اتصالك وراجع السجل.':'Connection failed before the result could be confirmed. Check your connection and history.');throw error}finally{clearTimeout(timeout)}
}
export function CustomerPayments({view='payments'}:{view?:'payments'|'withdraw'|'send'}){
 const withdrawalOnly=view==='withdraw';
 const actionLock=useRef(false),feedbackEpoch=useRef(0);
 useEffect(()=>()=>{feedbackEpoch.current++},[]);
 const [noticeTone,setNoticeTone]=useState<'info'|'success'|'error'>('error');
 const [sendRoute,setSendRoute]=useState<'choose'|'internal'|'external'>('choose'),[transferStep,setTransferStep]=useState(0);
 const guided=view==='send';
 const [deliveryMethod,setDeliveryMethod]=useState<DeliveryMethod>('internal');
 const [ar]=useAccountLanguage();
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState<'TRANSFER'|'WITHDRAWAL'>(withdrawalOnly?'WITHDRAWAL':'TRANSFER'),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[chain,setChain]=useState('TRC20'),[prepared,setPrepared]=useState<Prepared|null>(null),[attempted,setAttempted]=useState(false),[submitted,setSubmitted]=useState<unknown>(null),[requestKey,setRequestKey]=useState('');
 const t=(a:string,e:string)=>ar?a:e;
 const {status,sync,updatedAt,refresh}=useFinancialStatus();
 useEffect(()=>{setRequestKey('customer:'+crypto.randomUUID());const params=new URL(window.location.href).searchParams;if(view==='send'&&['internal','external'].includes(params.get('route')??'')){const route=params.get('route') as 'internal'|'external';setSendRoute(route);setDeliveryMethod(route==='internal'?'internal':'cash')}if(withdrawalOnly||(view!=='send'&&params.get('kind')==='WITHDRAWAL')){setKind('WITHDRAWAL');const prefill=withdrawalPrefill(params);if(prefill){setChain(prefill.chain);setRecipient(prefill.recipient);setAmount(prefill.amount)}}else{const prefill=internalTransferPrefill(params);if(prefill){setRecipient(prefill.recipient);setAmount(prefill.amount)}}},[withdrawalOnly,view]);
 useEffect(()=>{document.documentElement.lang=ar?'ar':'en';document.documentElement.dir=ar?'rtl':'ltr'},[ar]);
 function edit(){if(actionLock.current||(attempted&&!submitted))return;feedbackEpoch.current++;setNotice('');setAttempted(false);setPrepared(null);setTransferStep(0);setSubmitted(null);setRequestKey('customer:'+crypto.randomUUID())}
 const canExecute=(view!=='send'||(sendRoute==='internal'&&deliveryMethod==='internal'))&&sync==='current'&&status?.enabled===true&&(kind==='WITHDRAWAL'?status.capabilities?.withdrawals===true:status.capabilities?.transfers===true);
 const input={kind,recipient,amount,requestKey,...(kind==='WITHDRAWAL'?{chain,asset:'USDT'}:{})};
 async function prepare(e:React.FormEvent){e.preventDefault();if(actionLock.current||!requestKey||!canExecute)return;setNoticeTone('error');if(guided&&transferStep===0){if(!previewInternalTransfer(amount)){setNotice(t('أدخل مبلغًا صالحًا أكبر من صفر، وبحد أقصى 100,000 دولار.','Enter a valid amount above zero, up to 100,000 USD.'));return}setNotice('');setTransferStep(1);return}if(kind==='TRANSFER'&&!normalizeUid(recipient.replace(/^sirocash:pay:/,''))&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(recipient.replace(/^sirocash:pay:/,''))){setNotice(t('أدخل UID صالحًا من 10 أرقام. تحقّق من الرقم المنسوخ.','Enter a valid 10-digit UID. Check the copied identifier.'));return}actionLock.current=true;feedbackEpoch.current++;setBusy(true);setNotice('');try{setPrepared(await call('/api/financial/prepare',input,undefined,ar));setNoticeTone('info');setNotice(t('العرض جاهز للمراجعة؛ لم تُنفّذ العملية بعد.','Quote ready for review; no payment has been submitted.'))}catch(e){setNotice(e instanceof Error?e.message:'تعذّر إنشاء العرض.')}finally{actionLock.current=false;setBusy(false)}}
 async function submit(){if(actionLock.current||submitted||!prepared||!canExecute)return;if(prepared.kind==='TRANSFER'&&!prepared.recipientIdentity)return;actionLock.current=true;const epoch=++feedbackEpoch.current;setBusy(true);setNoticeTone('error');setNotice('');try{
  const token=await authorizePayment(prepared.path,prepared.payload);
  setAttempted(true);
  const result=await call(prepared.kind==='TRANSFER'?'/api/financial/transfer':'/api/financial/withdraw',prepared.kind==='TRANSFER'?{...input,recipient:prepared.payload.recipient,amount:prepared.payload.amount,requestKey:prepared.payload.requestKey}:{quoteId:prepared.id},token,ar);
  if(prepared.kind==='TRANSFER'&&!completedInternalTransfer(result)){setNotice(t('لم يُؤكَّد وصول المبلغ بعد. تحقّق من السجل ولا تُنشئ طلبًا بديلًا.','Recipient credit is not confirmed. Check history; do not create a replacement request.'));return}
  const withdrawalState=prepared.kind==='WITHDRAWAL'?withdrawalReceiptState(result,prepared.id):null;
  if(prepared.kind==='WITHDRAWAL'&&!withdrawalState){setNotice(t('لم تُؤكَّد نتيجة طلب السحب. راجع السجل، ولا تُنشئ طلبًا بديلًا.','Withdrawal outcome is uncertain. Check history; do not create a replacement request.'));return}
  setSubmitted(result);setNoticeTone(withdrawalState==='FAILED'?'error':withdrawalState==='COMPLETED'?'success':'info');setNotice(prepared.kind==='TRANSFER'?'':withdrawalState==='FAILED'?t('لم يكتمل طلب السحب. راجع حالته في السجل.','Withdrawal failed. Review its status in history.'):withdrawalState==='COMPLETED'?t('اكتمل طلب السحب.','Withdrawal completed.'):t('تم قبول طلب السحب وهو قيد المعالجة؛ لم يُؤكَّد وصوله بعد.','Withdrawal accepted and processing; delivery is not confirmed yet.'));void refresh().catch(()=>{if(epoch!==feedbackEpoch.current)return;setNoticeTone('info');setNotice(t('حُفظت نتيجة الطلب، لكن تعذّر تحديث السجل. لا تُعِد إنشاء الطلب.','Request outcome recorded, but history refresh failed. Do not create a duplicate command.'))});
 }catch(e){setNotice(e instanceof Error?e.message:'تعذّر تأكيد النتيجة.');/* Preserve exact request/quote for retry. Never generate a second command after an unknown result. */}finally{actionLock.current=false;setBusy(false)}}
 return <div className={`site-shell account-workspace pro-payments-workspace${guided?' guided-send':''}`}><AccountNavigation active={withdrawalOnly?"/withdraw":view==='send'?"/send":"/payments"} ar={ar}/><main id="main-content" className="section-width app-main pro-payments" data-payment-stage={prepared?(submitted?'receipt':'review'):guided&&sendRoute==='internal'?(transferStep===0?'amount':'recipient'):'route'} dir={ar?'rtl':'ltr'} lang={ar?'ar':'en'}>
  <WalletPageHeader ar={ar} title={withdrawalOnly?t('سحب USDT','Withdraw USDT'):t('إرسال الأموال','Send money')} href="/dashboard" onBack={guided&&sendRoute!=='choose'?()=>{if(actionLock.current||busy||(attempted&&!submitted))return;if(prepared){edit();return}if(transferStep>0){setTransferStep(0);return}setSendRoute('choose')}:undefined}/>
  <FinancialSyncStatus hasData={!!status} compact sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
  {guided&&sendRoute==='choose'&&<SendRoutePicker ar={ar} onChoose={route=>{setSendRoute(route);setDeliveryMethod(route==='internal'?'internal':'cash')}}/>}
  {guided&&sendRoute==='external'&&<DeliveryMethods externalOnly ar={ar} value={deliveryMethod} onChange={setDeliveryMethod}/>}
  {guided&&sendRoute==='internal'&&<ol className="transfer-progress" aria-label={t('خطوات التحويل','Transfer steps')}>{[t('المبلغ','Amount'),t('المستفيد','Recipient'),t('المراجعة','Review')].map((label,index)=><li key={label} aria-current={(prepared?2:transferStep)===index?'step':undefined}><span>{index+1}</span>{label}</li>)}</ol>}
  {busy?<ActionNotice tone="busy">{t('جارٍ التحقق من الطلب…','Verifying your request…')}</ActionNotice>:notice&&<ActionNotice tone={noticeTone}>{notice}</ActionNotice>}
  {(!guided||sendRoute==='internal')&&(!status?<p>{t('جارٍ التحقق من توفر الخدمة…','Checking availability…')}</p>:<>
   {!withdrawalOnly&&!guided&&<section className="card"><h2>{t('إجمالي الرصيد','Total balance')}</h2><strong dir="ltr">{displayAvailableBalance(status,status.userId)} USD</strong><ReceivingIdentityPanel ownerId={status.userId} ar={ar}/></section>}
   {!canExecute&&<p role="status">{t('الخدمة غير متاحة حاليًا.','Service currently unavailable.')}</p>}
   {!prepared&&<form className="card" onSubmit={prepare} aria-busy={busy}><h2>{kind==='WITHDRAWAL'?t('تفاصيل السحب','Withdrawal details'):guided?(transferStep===0?t('المبلغ المراد إرساله','How much would you like to send?'):t('إلى من ترسل؟','Who are you sending to?')):t('تفاصيل التحويل','Transfer details')}</h2><fieldset disabled={busy||!!prepared||!canExecute}>
    {!withdrawalOnly&&view!=='send'&&<label>{t('نوع الطلب','Command type')}<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="TRANSFER">{t('تحويل داخلي · عمولة 1% على المرسل','Internal transfer · 1% sender fee')}</option><option value="WITHDRAWAL" disabled={!status.capabilities?.withdrawals}>{t('سحب USDT','USDT withdrawal')}</option></select></label>}
    {kind==='WITHDRAWAL'&&<label>{t('الشبكة','Network')}<select value={chain} onChange={e=>setChain(e.target.value)}><option>TRC20</option><option>BEP20</option></select></label>}
    {(!guided||transferStep===1)&&<label>{kind==='TRANSFER'?t('UID المستفيد','Recipient UID'):t('عنوان المحفظة المستفيدة','Destination wallet address')}<input required dir="ltr" inputMode={kind==='TRANSFER'?'numeric':'text'} maxLength={100} placeholder={kind==='TRANSFER'?'UID · 0000 0000 00':undefined} value={recipient} onChange={e=>setRecipient(e.target.value)} autoComplete="off"/></label>}
    {(!guided||transferStep===0)&&<label className={guided?'transfer-amount-field':undefined}>{kind==='TRANSFER'?t('المبلغ بالدولار، قبل العمولة','USD amount before fee'):t('مبلغ USDT الإجمالي، شاملاً رسم السحب','Gross USDT including withdrawal fee')}<input required dir="ltr" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,6})?" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label>}
    {kind==='TRANSFER'&&(!guided||transferStep===0)&&<TransferFeePreview amount={amount} ar={ar}/>}
    {kind==='WITHDRAWAL'&&<WithdrawalFeeSummary asset="USDT" network={chain} amount={amount} ar={ar}/>}
   </fieldset><button className="button" disabled={busy||!!prepared||!requestKey||!canExecute} type="submit">{busy?t('جارٍ إعداد العرض…','Preparing quote…'):guided&&transferStep===0?t('التالي','Continue'):t('عرض التفاصيل قبل التفويض','Review before approval')}</button></form>}
   {prepared&&<section className="card payment-review"><h2>{t('راجع تفاصيل الطلب','Review command')}</h2>{prepared.kind==='TRANSFER'&&prepared.recipientIdentity&&<RecipientIdentityCard identity={prepared.recipientIdentity} ar={ar}/>}<dl>{Object.entries(prepared.payload).filter(([key])=>[...(prepared.kind==='TRANSFER'&&prepared.recipientIdentity?[]:['recipient']),'amount','fee','netAmount','totalDebit','grossUsd','feeUsd','netUsd','chain','asset'].includes(key)).map(([key,value])=><div key={key}><dt>{({recipient:t('المستفيد','Recipient'),amount:t('المبلغ','Amount'),fee:t('الرسم','Fee'),netAmount:t('صافي المستلم','Recipient net'),totalDebit:t('إجمالي الخصم','Total debit'),grossUsd:t('الخصم بالدولار','USD debit'),feeUsd:t('الرسم بالدولار','USD fee'),netUsd:t('الصافي بالدولار','USD net'),chain:t('الشبكة','Network'),asset:t('العملة','Asset')} as Record<string,string>)[key]}</dt><dd dir="ltr">{value}</dd></div>)}</dl>
    {prepared.expiresAt&&<p>{t('انتهاء العرض','Quote expiry')}: <time>{new Date(prepared.expiresAt).toLocaleString(ar?'ar':'en')}</time></p>}
    <p>{prepared.kind==='TRANSFER'?t('يستلم المستفيد المبلغ كاملًا، وتُضاف عمولة 1% على المرسل. تحويل 100 دولار يخصم 101 دولار.','The recipient receives the full amount; a 1% fee is added to the sender. Sending $100 debits $101.'):t('يُستخدم سعر صرف مرصود ومحفوظ، وليس افتراض تعادل USDT مع الدولار.','The stored observed exchange rate is used; USDT is not assumed equal to USD.')}</p>
    {prepared.kind==='TRANSFER'&&<InternalTransferSuccess result={submitted} identity={prepared.recipientIdentity} amount={prepared.payload.amount} ar={ar}/>}
    <button className="button" disabled={busy||!!submitted||!canExecute||(prepared.kind==='TRANSFER'&&!prepared.recipientIdentity)} onClick={()=>void submit()}>{busy?t('جارٍ التحقق…','Verifying…'):t('تفويض الجهاز وتأكيد الطلب','Approve with device and confirm')}</button>
    {attempted&&!submitted&&<p role="alert">{t('نتيجة الإرسال غير مؤكدة. أعد المحاولة بالطلب نفسه فقط؛ لا تُنشئ طلبًا بديلًا.','Submission outcome is uncertain. Retry this exact command only; do not create a replacement.')}</p>}
    <button className="button secondary" disabled={busy||(attempted&&!submitted)} onClick={edit}>{submitted?t('طلب جديد','New command'):t('تعديل العرض','Edit quote')}</button>
   </section>}
   {view!=='send'&&<FinancialHistory status={status} ar={ar} showBalance={false} scope={withdrawalOnly?'withdrawals':'all'}/>}
  </>)}

 </main></div>;
}
