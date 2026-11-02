'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {ArrowDownLeft,Check,Copy,LoaderCircle,ShieldCheck,TriangleAlert} from 'lucide-react';
import {useFinancialStatus} from './use-financial-status';
type Network='TRC20'|'BEP20';
type Address={chain:Network;address:string;asset:'USDT';demo:false};
export function DepositPanel({ar,userId}:{ar:boolean;userId:string}){
 const t=(en:string,arabic:string)=>ar?arabic:en;
 const {status,sync}=useFinancialStatus(true,userId);
 const available=sync==='current'&&status?.userId===userId&&status.capabilities?.deposits===true;
 const [network,setNetwork]=useState<Network>('TRC20'),[result,setResult]=useState<Address|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const request=useRef<AbortController|null>(null),generation=useRef(0),copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function clear(){generation.current++;request.current?.abort();setResult(null);setBusy(false);setError('');setCopied(false);if(copyTimer.current)clearTimeout(copyTimer.current)}
 useEffect(()=>{clear();if(available)void generate();return()=>{generation.current++;request.current?.abort();if(copyTimer.current)clearTimeout(copyTimer.current)}},[userId,available,network]);
 const address=available&&result?.chain===network?result.address:null;
 async function generate(){
  clear();const id=generation.current,controller=new AbortController();request.current=controller;setBusy(true);
  try{
   const response=await fetch('/api/deposit/generate-address',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({chain:network,asset:'USDT'})});
   const data=await response.json();
   if(!response.ok||data.chain!==network||data.asset!=='USDT'||data.demo!==false||typeof data.address!=='string'||!(network==='TRC20'?/^T[1-9A-HJ-NP-Za-km-z]{33}$/:/^0x[0-9a-fA-F]{40}$/).test(data.address))throw Error('ADDRESS_UNAVAILABLE');
   if(id===generation.current)setResult(data);
  }catch{if(id===generation.current)setError(t('We could not verify your deposit address. Please try again. Do not send funds yet.','تعذّر تأكيد عنوان إيداعك. يُرجى المحاولة مجددًا، ولا ترسل أموالًا الآن.'))}
  finally{if(id===generation.current)setBusy(false)}
 }
 async function copy(){if(!address)return;const id=generation.current;try{await navigator.clipboard.writeText(address);if(id!==generation.current)return;setCopied(true);copyTimer.current=setTimeout(()=>setCopied(false),2500)}catch{if(id===generation.current)setError(t('Copy failed. You can select and copy the complete address below.','تعذّر النسخ. يمكنك تحديد العنوان الكامل أدناه ونسخه يدويًا.'))}}
 return <section className="deposit-studio" aria-labelledby="deposit-studio-title">
  <div className="deposit-studio-main glass">
   <header className="deposit-studio-heading"><span className="deposit-symbol">₮</span><div><span className="deposit-kicker">TETHER USD</span><h2 id="deposit-studio-title">{t('Deposit USDT','إيداع USDT')}</h2></div><ArrowDownLeft size={23} aria-hidden="true"/></header>
   <label className="deposit-asset-label">{t('Currency','العملة')}<select aria-label={t('Deposit currency','عملة الإيداع')} value="USDT" onChange={()=>{}}><option value="USDT">USDT</option><option value="USDC" disabled>USDC · {t('Coming soon','سيتوفر قريباً')}</option></select></label>
   <fieldset className="deposit-networks"><legend>{t('Choose a network','اختر شبكة الإيداع')}</legend><div className="deposit-network-options">{(['TRC20','BEP20'] as const).map(n=><button type="button" key={n} aria-pressed={network===n} className={'deposit-network '+(n==='TRC20'?'tron':'bnb')} onClick={()=>setNetwork(n)}><span className="deposit-network-mark" aria-hidden="true">{n==='TRC20'?'△':'◇'}</span><span><strong dir="ltr">{n==='TRC20'?'TRON':'BNB Smart Chain'}</strong><small dir="ltr">{n}</small></span><span className="deposit-network-radio">{network===n&&<Check size={12}/>}</span></button>)}<button type="button" className="deposit-network" disabled aria-label={t('Ethereum ERC20 coming soon','Ethereum ERC20 سيتوفر قريباً')}><span><strong>Ethereum</strong><small>ERC20 · {t('Coming soon','قريبًا')}</small></span></button></div></fieldset>
   <div className="deposit-address-area"><h3>{t('Your deposit address','عنوان الإيداع الخاص بك')}</h3>
    {!available?<div className="deposit-placeholder" role="status"><ShieldCheck size={30}/><strong>{sync==='syncing'?t('Checking deposit availability…','جارٍ التحقق من إتاحة الإيداع…'):t('Deposits are not available right now','الإيداع غير متاح حاليًا')}</strong></div>:address?<>
     <div className="deposit-wallet-qr-wrap"><div className="deposit-wallet-qr"><QRCodeSVG value={address} size={188} level="M" marginSize={4} role="img" title={t(`Your USDT deposit address on ${network}`,`عنوان إيداع USDT الخاص بك عبر ${network}`)}/></div><span className={'deposit-network-badge '+(network==='TRC20'?'tron':'bnb')} dir="ltr">USDT · {network}</span></div>
     <label className="deposit-address-label" htmlFor="verified-deposit-address">{t('Wallet address','عنوان المحفظة')}<input id="verified-deposit-address" readOnly dir="ltr" value={address} onFocus={e=>e.currentTarget.select()}/></label>
     <button type="button" className="button deposit-copy" onClick={()=>void copy()}>{copied?<Check size={18}/>:<Copy size={18}/>}<span aria-live="polite">{copied?t('Address copied','تم نسخ العنوان'):t('Copy address','نسخ العنوان')}</span></button>
    </>:<div className="deposit-placeholder" role="status">{busy?<><LoaderCircle className="deposit-spin" size={24}/><strong>{t('Loading address…','جارٍ تحميل العنوان…')}</strong></>:<button type="button" className="button" onClick={()=>void generate()}>{t('Retry','إعادة المحاولة')}</button>}</div>}
    {error&&<p className="deposit-error" role="alert">{error}</p>}
   </div>
   <div className="deposit-network-warning"><TriangleAlert size={19}/><p>{t(`Send only USDT using ${network}. Using another asset or network may result in loss of funds.`,`أرسل USDT فقط عبر شبكة ${network}. إرسال عملة أخرى أو استخدام شبكة مختلفة قد يؤدي إلى فقدان الأموال.`)}</p></div>
   <details className="deposit-alternatives"><summary>{t('Local funding partners','شركاء التمويل المحليون')}</summary><Link href="/sham-cash">{t('Sham Cash · view availability','شام كاش · عرض حالة الخدمة')}</Link></details>
  </div>
 </section>
}
