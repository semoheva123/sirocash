'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Search,ArrowUpRight,LayoutDashboard,ArrowDownLeft,ArrowLeftRight,Smartphone,Settings2,LifeBuoy} from 'lucide-react';
import {DialogFrame} from './dialog-frame';
const destinations=[
 {href:'/wallet',en:'Wallet',ar:'المحفظة',keywords:'wallet محفظة',icon:LayoutDashboard},
 {href:'/activity',en:'Activity',ar:'النشاط',keywords:'history transactions سجل معاملات',icon:LayoutDashboard},
 {href:'/send',en:'Send money',ar:'إرسال الأموال',keywords:'send transfer إرسال تحويل',icon:ArrowUpRight},
 {href:'/notifications',en:'Notifications',ar:'الإشعارات',keywords:'notifications إشعارات',icon:LifeBuoy},
 {href:'/settings/support',en:'Contact support',ar:'تواصل مع الدعم',keywords:'ticket support طلب دعم',icon:LifeBuoy},
 {href:'/exchange',en:'Exchange · soon',ar:'التبديل · قريبًا',keywords:'exchange تبديل',icon:ArrowLeftRight},
 {href:'/dashboard',en:'Wallet overview',ar:'ملخص المحفظة',keywords:'overview balance رصيد نظرة عامة',icon:LayoutDashboard},
 {href:'/deposit',en:'Digital asset deposit',ar:'إيداع العملات الرقمية',keywords:'deposit USDT USDC crypto إيداع ايداع عملات',icon:ArrowDownLeft},
 {href:'/withdraw',en:'Withdraw funds',ar:'سحب الأموال',keywords:'withdraw سحب اموال',icon:ArrowUpRight},
 {href:'/sham-cash',en:'Sham Cash',ar:'شام كاش',keywords:'sham cash transfer شام كاش تحويل',icon:ArrowLeftRight},
 {href:'/mobile-topup',en:'Mobile top-up',ar:'شحن رصيد الهاتف',keywords:'mobile topup Syriatel MTN هاتف شحن سيريتل',icon:Smartphone},
 {href:'/settings',en:'Account & security',ar:'الحساب والأمان',keywords:'settings email password sessions اعدادات إعدادات أمان امان بريد جلسات مرور',icon:Settings2},
 {href:'/support',en:'Help centre',ar:'مركز المساعدة',keywords:'help support مساعدة دعم',icon:LifeBuoy},
];
export function WorkspaceSearch({ar,compact=false,shortcut=true}:{ar:boolean;compact?:boolean;shortcut?:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState(0);
 const results=destinations.filter(item=>`${item.en} ${item.ar} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
 function show(){setQuery('');setSelected(0);setOpen(true)}
 useEffect(()=>{if(!shortcut)return;function onShortcut(event:KeyboardEvent){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!document.querySelector('[role=dialog]'))show()}}document.addEventListener('keydown',onShortcut);return()=>document.removeEventListener('keydown',onShortcut)},[shortcut]);
 return <><button type="button" className={`atelier-search-trigger${compact?' wallet-search-compact':''}`} aria-label={ar?'انتقال سريع':'Quick access'} onClick={show}><Search size={15}/><span>{ar?'انتقال سريع':'Quick access'}</span><kbd>⌘ / Ctrl K</kbd></button>{open&&<DialogFrame initialFocus="input" label={ar?'انتقال سريع في المنصة':'Quick platform navigation'} closeLabel={ar?'إغلاق البحث':'Close search'} onClose={()=>setOpen(false)}><div className="atelier-command"><span className="eyebrow plain">SIROCASH / QUICK ACCESS</span><h2>{ar?'إلى أين تودّ الانتقال؟':'Where would you like to go?'}</h2><label htmlFor="workspace-search">{ar?'ابحث عن قسم أو خدمة':'Find a section or service'}</label><div className="atelier-command-input"><Search size={18}/><input id="workspace-search" type="search" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="workspace-results" aria-activedescendant={results.length?`workspace-result-${selected}`:undefined} value={query} onChange={event=>{setQuery(event.target.value);setSelected(0)}} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setSelected(index=>Math.min(index+1,results.length-1))}else if(event.key==='ArrowUp'){event.preventDefault();setSelected(index=>Math.max(index-1,0))}else if(event.key==='Enter'&&results[selected]){event.preventDefault();window.location.assign(results[selected].href);setOpen(false)}}} placeholder={ar?'المحفظة، الأمان، شام كاش…':'Wallet, security, Sham Cash…'}/></div><div id="workspace-results" role="listbox" aria-label={ar?'وجهات المنصة':'Platform destinations'}>{results.map((item,index)=><Link id={`workspace-result-${index}`} role="option" aria-selected={selected===index} href={item.href} key={item.href} onMouseMove={()=>setSelected(index)} onClick={()=>setOpen(false)}><item.icon size={18}/><span>{ar?item.ar:item.en}</span><ArrowUpRight size={15}/></Link>)}</div>{!results.length&&<p className="atelier-command-empty" role="status">{ar?'لا توجد نتائج مطابقة. جرّب اسم قسم آخر.':'No matching sections. Try another name.'}</p>}<div className="atelier-command-footer"><span>↑ ↓ {ar?'للتنقّل':'Navigate'}</span><span>↵ {ar?'للفتح':'Open'}</span><span>Esc {ar?'للإغلاق':'Close'}</span></div></div></DialogFrame>}</>;
}
