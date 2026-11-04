'use client';
import {CheckCircle2,Info,LoaderCircle,TriangleAlert} from 'lucide-react';
/** Inline, persistent feedback. Financial results must never vanish on a toast timer. */
export function ActionNotice({tone='info',children}:{tone?:'info'|'success'|'error'|'busy';children:React.ReactNode}){
 const Icon=tone==='busy'?LoaderCircle:tone==='success'?CheckCircle2:tone==='error'?TriangleAlert:Info;
 return <div className={'action-notice action-notice-'+tone} role={tone==='error'?'alert':'status'} aria-atomic="true"><Icon size={19} aria-hidden="true"/><span>{children}</span></div>;
}
