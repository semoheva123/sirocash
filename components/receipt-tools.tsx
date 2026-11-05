'use client';
import {useState} from 'react';
import {Download,Printer} from 'lucide-react';
import {receiptHtml,type ReceiptDocument} from '@/lib/receipt-document';
export function ReceiptTools({document:record,ar}:{document:ReceiptDocument;ar:boolean}){
 const [notice,setNotice]=useState('');
 function download(){let url:string|undefined;try{url=URL.createObjectURL(new Blob([receiptHtml(record,ar)],{type:'text/html;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='SiroCash-'+record.reference.replace(/[^a-z0-9-]/gi,'').slice(0,80)+'.html';document.body.append(anchor);anchor.click();anchor.remove();const retained=url;setTimeout(()=>URL.revokeObjectURL(retained),1000);setNotice(ar?'أُرسل بيان HTML إلى تنزيلات المتصفح.':'HTML statement sent to browser downloads.')}catch{if(url)URL.revokeObjectURL(url);setNotice(ar?'تعذّر تنزيل البيان. حاول الطباعة بدلًا منه.':'Could not download the statement. Try printing instead.')}}
 return <div className="receipt-tools" data-no-print><button type="button" className="button secondary" onClick={download}><Download size={17}/>{ar?'تنزيل البيان · HTML':'Download statement · HTML'}</button><button type="button" className="button secondary" onClick={()=>{try{window.print()}catch{setNotice(ar?'تعذّر فتح الطباعة.':'Could not open print dialog.')}}}><Printer size={17}/>{ar?'طباعة / حفظ PDF':'Print / Save PDF'}</button><span role="status">{notice}</span></div>;
}
