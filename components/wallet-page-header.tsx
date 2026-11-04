'use client';
import Link from 'next/link';
import {ArrowRight,ArrowLeft,ArrowLeftRight} from 'lucide-react';
export function WalletPageHeader({title,ar,href='/wallet',onBack}:{title:string;ar:boolean;href?:string;onBack?:()=>void}){
 const label=ar?'رجوع':'Back',icon=ar?<ArrowRight size={21}/>:<ArrowLeft size={21}/>;
 return <header className="wallet-page-header">{onBack?<button type="button" onClick={onBack} aria-label={label}>{icon}</button>:<Link href={href} aria-label={label}>{icon}</Link>}<div className="wallet-page-title"><small>SIROCASH</small><h1>{title}</h1></div><span className="wallet-page-mark" aria-hidden="true"><ArrowLeftRight size={19}/></span></header>;
}
