'use client';
import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import {createPortal} from 'react-dom';
export function DialogFrame({label,closeLabel,onClose,busy=false,initialFocus,children}:{label:string;closeLabel:string;onClose:()=>void;busy?:boolean;initialFocus?:string;children:React.ReactNode}){
 const panel=useRef<HTMLElement>(null);const close=useRef(onClose);const pending=useRef(busy);close.current=onClose;pending.current=busy;
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const focusable=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);
  (initialFocus&&panel.current?.querySelector<HTMLElement>(initialFocus)||focusable()[0]||panel.current)?.focus();
  function keyboard(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();if(!pending.current)close.current()}
   if(event.key==='Tab'){const elements=focusable(),first=elements[0],last=elements.at(-1);if(!first){event.preventDefault();panel.current?.focus();return}if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&(document.activeElement===last||!panel.current?.contains(document.activeElement))){event.preventDefault();first.focus()}}
  }
  document.addEventListener('keydown',keyboard);return()=>{document.removeEventListener('keydown',keyboard);document.body.style.overflow=oldOverflow;previous?.focus()};
 },[initialFocus]);
 return typeof document==='undefined'?null:createPortal(<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}><section ref={panel} tabIndex={-1} className="modal glass" role="dialog" aria-modal="true" aria-label={label}><button type="button" disabled={busy} className="close-modal" aria-label={closeLabel} onClick={onClose}><X size={20}/></button>{children}</section></div>,document.body);
}
