'use client';
import {useState} from 'react';
export function ReceiptShare({text,ar}:{text:string;ar:boolean}){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function share(){if(busy)return;setBusy(true);setNotice('');try{if(navigator.share){await navigator.share({title:ar?'إيصال تحويل SiroCash':'SiroCash transfer receipt',text});setNotice(ar?'تمت المشاركة.':'Shared.')}else{await navigator.clipboard.writeText(text);setNotice(ar?'تم نسخ الإيصال.':'Receipt copied.')}}catch(e){setNotice(e instanceof Error&&e.name==='AbortError'?(ar?'أُلغيت المشاركة.':'Sharing cancelled.'):(ar?'تعذّرت المشاركة؛ يمكنك نسخ المراجع أدناه.':'Sharing failed; you can copy the references below.'))}finally{setBusy(false)}}
 return <><button className="button secondary" type="button" disabled={busy} onClick={()=>void share()}>{busy?(ar?'جارٍ المشاركة…':'Sharing…'):(ar?'مشاركة الإيصال':'Share receipt')}</button><span role="status">{notice}</span></>;
}
