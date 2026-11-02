'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {ArrowUpRight,ArrowDownLeft,Plus,ExternalLink,ArrowLeftRight,Copy,Check,ShieldCheck,ScanLine,Wallet,Layers} from 'lucide-react';
import {DialogFrame} from './dialog-frame';
import {ToastNotice,useToastNotice} from './toast-notice';
import type {FinancialStatus} from './use-financial-status';
import {receiveDetails,withdrawalReviewHref,internalTransferReviewHref,type SendNetwork} from '@/lib/wallet-presentation';

/** Read-only dialogs; execution stays on the existing device-approved payments flow. */
export function WalletActions({ar,ownerId,status,current,mobileWallet=false,onSend}:{onSend?:()=>void;mobileWallet?:boolean;ar:boolean;ownerId:string;status:FinancialStatus|null;current:boolean}){
 const [dialog,setDialog]=useState<'send'|'receive'|null>(null),[network,setNetwork]=useState<SendNetwork>('TRC20');
 const [sendMethod,setSendMethod]=useState<'account'|'crypto'>('account');
 const [method,setMethod]=useState<'account'|'crypto'>('account'),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState(false),[copying,setCopying]=useState(false);
 const {notice,notify,dismiss}=useToastNotice();
 const copyVersion=useRef(0);
 const t=(en:string,arabic:string)=>ar?arabic:en;
 const owned=status?.userId===ownerId?status:null;
 const details=current?receiveDetails(owned,ownerId,method,network):null;
 const available=current&&Boolean(owned?.enabled&&(sendMethod==='account'?owned.capabilities?.transfers:owned.capabilities?.withdrawals));
 // A stale or replaced QR must never retain a previous address's copied state.
 useEffect(()=>{copyVersion.current++;setCopied(false);setCopying(false)},[dialog,details?.value,method,network]);
 useEffect(()=>()=>{copyVersion.current++},[]);
 function openReceive(){
  const assigned=(['TRC20','BEP20'] as const).find(chain=>current&&receiveDetails(owned,ownerId,'crypto',chain));
  setMethod(assigned?'crypto':'account');setNetwork(assigned??'TRC20');setError('');setDialog('receive');
 }
 function close(){copyVersion.current++;setDialog(null);setError('');setRecipient('');setAmount('')}
 async function copy(){
  if(!details||copying)return;const version=++copyVersion.current;setCopied(false);setCopying(true);
  try{await navigator.clipboard.writeText(details.value);if(version!==copyVersion.current)return;setCopied(true);notify('success',t('Copied. Verify the identifier before sharing.','تم النسخ. تحقّق من المعرّف قبل مشاركته.'))}
  catch{if(version===copyVersion.current)notify('error',t('Clipboard unavailable. Select and copy the identifier manually.','تعذّر النسخ. حدّد المعرّف وانسخه يدويًا.'))}
  finally{if(version===copyVersion.current)setCopying(false)}
 }
 function review(event:React.FormEvent){
  event.preventDefault();setError('');
  if(!available){notify('info',t('Sending is not available. No request was submitted and no funds moved.','الإرسال غير متاح. لم يُرسل أي طلب ولم تُحرّك أموال.'));return}
  try{window.location.assign(sendMethod==='account'?internalTransferReviewHref(recipient.trim(),amount):withdrawalReviewHref(recipient.trim(),amount,network))}
  catch(e){const message=e instanceof Error&&e.message==='INVALID_AMOUNT'?t('Enter a positive amount, up to six decimal places.','أدخل مبلغًا موجبًا، بحد أقصى ست خانات عشرية.'):sendMethod==='account'?t('Enter a valid recipient account ID.','أدخل معرّف حساب مستفيد صالحًا.'):t('Check the address and selected network.','تحقّق من العنوان والشبكة المحدّدة.');setError(message);notify('error',message)}
 }
 return <><div className="wallet-actions obsidian-wallet-actions">
  {mobileWallet?<Link href="/send" onClick={e=>{if(onSend){e.preventDefault();onSend()}}}><span><ArrowUpRight size={19}/></span>{t('Send','إرسال')}</Link>:<button type="button" onClick={()=>{setError('');setDialog('send')}}><span><ArrowUpRight size={19}/></span>{t('Send','إرسال')}</button>}
  <button type="button" onClick={openReceive}><span><ArrowDownLeft size={19}/></span>{t('Receive','استلام')}</button>
  <Link href="/deposit"><span><Plus size={19}/></span>{t('Deposit','إيداع')}</Link>
  {mobileWallet?<Link href="/exchange"><span><ArrowLeftRight size={19}/></span>{t('Exchange','تبديل')}</Link>:<Link href="/withdraw"><span><ExternalLink size={19}/></span>{t('Withdraw','سحب')}</Link>}
 </div>
 {dialog&&<DialogFrame label={dialog==='send'?t('Send funds','إرسال الأموال'):t('Receive funds','استلام الأموال')} closeLabel={t('Close dialog','إغلاق النافذة')} onClose={close} initialFocus={dialog==='send'?'#wallet-recipient':undefined}>
  <div className={`obsidian-dialog-icon ${dialog==='receive'?'receive':''}`}>{dialog==='send'?<ArrowUpRight size={26}/>:<ScanLine size={26}/>}</div>
  <span className="obsidian-overline">SIROCASH / {dialog==='send'?'SEND':'RECEIVE'}</span>
  <h2>{dialog==='send'?t('Your next move.','خطوتك التالية.'):t('Made to receive.','استلام بوضوح. ')}</h2>
  <p className="obsidian-dialog-description">{dialog==='send'?sendMethod==='account'?t('Internal USD transfer. The recipient receives the full amount; a 1% fee is added to the sender.','تحويل داخلي بالدولار. يستلم المستفيد المبلغ كاملًا وتُضاف عمولة 1% على المرسل.'):t('USDT withdrawal. Review the network and gross amount before device approval.','سحب USDT. راجع الشبكة والمبلغ الإجمالي قبل تفويض الجهاز.'):t('An account identifier and a blockchain address are different. Choose the right receiving method.','معرّف الحساب وعنوان الشبكة مختلفان. اختر طريقة الاستلام الصحيحة.')}</p>
  {dialog==='send'&&<div className="obsidian-segments" role="group" aria-label={t('Transfer method','طريقة التحويل')}><button type="button" aria-pressed={sendMethod==='account'} onClick={()=>{setSendMethod('account');setRecipient('');setError('')}}>{t('SiroCash account','حساب SiroCash')}</button><button type="button" aria-pressed={sendMethod==='crypto'} onClick={()=>{setSendMethod('crypto');setRecipient('');setError('')}}>{t('External wallet','محفظة خارجية')}</button></div>}
  {dialog==='receive'&&<div className="obsidian-segments" role="group" aria-label={t('Receiving method','طريقة الاستلام')}><button type="button" aria-pressed={method==='account'} onClick={()=>setMethod('account')}><Wallet size={16}/>{t('Account QR','رمز الحساب')}</button><button type="button" aria-pressed={method==='crypto'} onClick={()=>setMethod('crypto')}><Layers size={16}/>{t('USDT address','عنوان USDT')}</button></div>}
  {(dialog==='send'?sendMethod==='crypto':method==='crypto')&&<div className="obsidian-network-select"><label htmlFor="wallet-network">{t('Network','شبكة التحويل')}</label><select id="wallet-network" value={network} onChange={event=>{setNetwork(event.target.value as SendNetwork);setRecipient('');setError('')}}><option value="TRC20">TRON · TRC20</option><option value="BEP20">BNB Smart Chain · BEP20</option></select><span className={network==='TRC20'?'obsidian-network-tag':'obsidian-network-tag bnb'}>{network==='TRC20'?'TRON / TRC20':'BNB / BEP20'}</span></div>}
  {dialog==='send'?<form onSubmit={review} className="obsidian-send-form">
   <label htmlFor="wallet-recipient">{sendMethod==='account'?t('Recipient account ID','معرّف حساب المستفيد'):t('Destination wallet address','عنوان المحفظة المستفيدة')}</label><input id="wallet-recipient" dir="ltr" value={recipient} onChange={event=>setRecipient(event.target.value)} autoComplete="off" spellCheck={false} maxLength={100} placeholder={sendMethod==='account'?'UUID / sirocash:pay:…':network==='TRC20'?'T…':'0x…'} required/>
   <label htmlFor="wallet-send-amount">{sendMethod==='account'?t('Amount before fee · USD','المبلغ قبل العمولة · USD'):t('Gross amount · USDT','المبلغ الإجمالي · USDT')}</label><div className="obsidian-amount-input"><input id="wallet-send-amount" dir="ltr" inputMode="decimal" autoComplete="off" value={amount} onChange={event=>setAmount(event.target.value.replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace('٫','.'))} pattern="[0-9]+([.][0-9]{1,6})?" maxLength={21} placeholder="0.00" required/><span>{sendMethod==='account'?'USD':'USDT'}</span></div>
   <p className="obsidian-inline-note"><ShieldCheck size={17}/>{available?t('This step does not send funds. Fees and the final quote are shown in secure review.','هذه الخطوة لا ترسل أموالًا. تظهر الرسوم والعرض النهائي في المراجعة الآمنة.'):t('Financial execution is inactive or the live connection is unavailable.','التنفيذ المالي غير مفعّل أو الاتصال اللحظي غير متاح.')}</p>
   {error&&<p className="service-error" role="alert">{error}</p>}
   <button type="submit" className="button full">{available?t('Continue to secure review','متابعة إلى المراجعة الآمنة'):t('Check sending availability','التحقّق من إتاحة الإرسال')}<ArrowUpRight size={18}/></button>
  </form>:<div className="obsidian-receive-content">
   {details?<><div className="obsidian-qr"><QRCodeSVG role="img" title={method==='account'?t('SiroCash account QR code','رمز حساب SiroCash'):t('USDT receiving address QR code','رمز عنوان استلام USDT')} value={details.qr} size={184} level="M" marginSize={4}/></div><strong>{method==='account'?t('Internal account identifier','معرّف الحساب للتحويل الداخلي'):t('Your assigned USDT address','عنوان USDT المخصّص لحسابك')}</strong><div className="obsidian-address"><code dir="ltr">{details.value}</code><button type="button" disabled={copying} onClick={()=>void copy()} aria-label={t('Copy receiving identifier','نسخ معرّف الاستلام')}>{copied?<Check size={19}/>:<Copy size={19}/>}</button></div></>:<div className="obsidian-no-address"><ScanLine size={34}/><h3>{t('No verified address to display','لا يوجد عنوان مؤكّد للعرض')}</h3><p>{t('A live owner-bound address is required. No sample address or QR will be substituted.','يلزم عنوان فعلي مرتبط بحسابك واتصال متاح. لن يُعرض عنوان أو رمز تجريبي بدلًا منه.')}</p><Link href="/deposit" className="button secondary">{t('View deposit details','تفاصيل الإيداع')}</Link></div>}
   <p className="obsidian-inline-note">{method==='account'?t('This QR identifies your SiroCash account only. It is not a blockchain address. Transfers remain subject to service availability.','هذا الرمز يعرّف حساب SiroCash فقط، وليس عنوان شبكة. تظل التحويلات خاضعة لإتاحة الخدمة.'):t('USDT only, on the selected network. Do not send funds while deposits are inactive.','USDT فقط، على الشبكة المحدّدة. لا ترسل أموالًا ما دامت الإيداعات غير مفعّلة.')}</p>
  </div>}
 </DialogFrame>}
 <ToastNotice ar={ar} notice={notice} dismiss={dismiss}/></>;
}
