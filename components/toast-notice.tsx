'use client';
import {useCallback,useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle2,Info,ShieldAlert,X} from 'lucide-react';
export type ToastMessage={tone:'success'|'info'|'error';message:string};
export function useToastNotice(){
 const [notice,setNotice]=useState<ToastMessage|null>(null);
 const dismiss=useCallback(()=>setNotice(null),[]);
 const notify=useCallback((tone:ToastMessage['tone'],message:string)=>setNotice({tone,message}),[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(dismiss,5500);return()=>clearTimeout(timer)},[notice,dismiss]);
 return {notice,notify,dismiss};
}
export function ToastNotice({notice,dismiss,ar}:{notice:ToastMessage|null;dismiss:()=>void;ar:boolean}){
 if(!notice||typeof document==='undefined')return null;
 const Icon=notice.tone==='success'?CheckCircle2:notice.tone==='error'?ShieldAlert:Info;
 return createPortal(<div className={`toast obsidian-toast toast-${notice.tone}`} role={notice.tone==='error'?'alert':'status'} aria-atomic="true"><Icon size={20} aria-hidden="true"/><span>{notice.message}</span><button type="button" onClick={dismiss} aria-label={ar?'إغلاق الإشعار':'Dismiss notification'}><X size={18}/></button></div>,document.body);
}
