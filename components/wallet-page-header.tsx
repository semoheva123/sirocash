'use client';
import Link from 'next/link';
import {ArrowRight,ArrowLeft} from 'lucide-react';
export function WalletPageHeader({title,ar,href='/wallet',onBack}:{title:string;ar:boolean;href?:string;onBack?:()=>void}){
 const label=ar?'رجوع':'Back',icon=ar?<ArrowRight size={21}/>:<ArrowLeft size={21}/>;
 return <header className="wallet-page-header">{onBack?<button type="button" onClick={onBack} aria-label={label}>{icon}</button>:<Link href={href} aria-label={label}>{icon}</Link>}<h1>{title}</h1><span aria-hidden="true">SC</span></header>;
}
