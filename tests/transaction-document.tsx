import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {receiptHtml} from '../lib/receipt-document';
import {TransactionDocument} from '../components/transaction-document';
import {InternalTransferSuccess} from '../components/internal-transfer-success';
import type {FinancialStatus} from '../components/use-financial-status';
const id='00000000-0000-0000-0000-000000000001';
for(const ar of [true,false]){
 const status:FinancialStatus={enabled:true,userId:'fixture',activity:[{id,type:'P2P',amount:'-101.000001',status:'COMPLETED',createdAt:'2026-11-05T01:02:03Z',senderName:'Fixture sender',recipientName:'Fixture receiver',transferAmount:'100.000001',transferFee:'1',totalDebit:'101.000001'}]};
 const page=new JSDOM(renderToStaticMarkup(<TransactionDocument scope="activity" data={status} ar={ar}/>)).window.document;
 assert.equal(page.querySelectorAll('.transaction-events time').length,1,'Only supplied creation time, never invented completion/approval events');assert.equal(page.querySelectorAll('.transaction-events li').length,2);assert(page.body.textContent!.includes('100.000001'));assert(page.body.textContent!.includes('101.000001'));
 assert(page.querySelector('[data-receipt-document]'));assert(page.body.textContent!.includes(ar?'تنزيل البيان · HTML':'Download statement · HTML'));
 const withdrawal:FinancialStatus={enabled:true,userId:'fixture',operations:[{id,kind:'WITHDRAWAL',amount:'6',feeAmount:'0',state:'SUBMITTED',createdAt:'2026-11-04T01:00:00Z'}],payouts:[{id:'payout',operationId:id,network:'TRC20',state:'CONFIRMED',txId:'a'.repeat(64),createdAt:'2026-11-04T01:01:00Z'}]};
 const doc=new JSDOM(renderToStaticMarkup(<TransactionDocument scope="withdrawals" data={withdrawal} ar={ar}/>)).window.document;
 assert.equal(doc.querySelectorAll('.transaction-events time').length,2);assert(doc.body.textContent!.includes(ar?'بانتظار التسوية':'Awaiting settlement'));assert(doc.body.textContent!.includes(ar?'مؤكدة على الشبكة':'Confirmed on chain'));assert(!doc.body.textContent!.includes(ar?'طلب سحب مكتمل':'Completed withdrawal'));
 const missing=new JSDOM(renderToStaticMarkup(<TransactionDocument scope="activity" data={{...status,activity:status.activity!.map(({transferFee,transferAmount,totalDebit,...r})=>r)}} ar={ar}/>)).window.document;assert.equal(missing.querySelectorAll('.receipt-money-details').length,0,'Never recompute unavailable historic fees');
 assert.equal(renderToStaticMarkup(<InternalTransferSuccess ar={ar} result={{state:'SUBMITTED'}} amount="100"/>),'');
}
const html=receiptHtml({title:'<script>alert(1)</script>',reference:id,fields:[['<img onerror=alert(1)>','<svg onload=alert(1)>']],notes:['" onclick="alert(1)']},true);const exported=new JSDOM(html).window.document;
assert.equal(exported.querySelectorAll('script,img,svg,iframe,form').length,0);assert.equal(exported.documentElement.lang,'ar');assert.equal(exported.documentElement.dir,'rtl');assert(exported.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!.includes("default-src 'none'"));assert(!html.includes('https://'));assert(exported.body.textContent!.includes('<svg onload=alert(1)>'));
console.log('Transaction statement PASS: supplied creation timestamps only, exact saved fees, no guessed historic fees, chain confirmation distinct from account completion, download/print controls, uncompleted transfer receipt withheld and escaped self-contained HTML. Offline only.');
