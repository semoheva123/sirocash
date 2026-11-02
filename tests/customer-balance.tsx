import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {displayAvailableBalance} from '../lib/account-overview';
import {FinancialRecords,depositTokenAmount} from '../components/financial-records';
import {FinancialActivity} from '../components/financial-activity';
import {FinancialReference} from '../components/financial-ui';
import type {FinancialStatus} from '../components/use-financial-status';
const status:FinancialStatus={enabled:true,userId:'alice',balance:{posted:'100.000000',held:'0'},operations:[{id:'withdraw',kind:'WITHDRAWAL',amount:'6',feeAmount:'5',state:'RESERVED',createdAt:'2026-11-02'},{id:'private-transfer',kind:'TRANSFER',amount:'4',feeAmount:'.04',state:'COMPLETED',createdAt:'2026-11-02'}],deposits:[{id:'deposit',network:'BEP20',txId:'deposit-tx',amountBaseUnits:'4990000000000000000',state:'CREDITED',createdAt:'2026-11-02'}],payouts:[{id:'payout',operationId:'withdraw',network:'TRC20',txId:'withdraw-tx',state:'BROADCAST_UNKNOWN',createdAt:'2026-11-02'}]};
const balance=(posted:string,held:string)=>displayAvailableBalance({...status,balance:{posted,held}},'alice');
assert.equal(balance('100','0'),'100.00');
assert.equal(balance('100','6'),'94.00'); // accepted/reserved
assert.equal(balance('100','0'),'100.00'); // rejected/released
assert.equal(balance('94','0'),'94.00'); // settled; no second deduction
assert.equal(balance('98765432109876.129999','.01'),'—');
assert.equal(balance('98765432109876.129999','0.010000'),'98,765,432,109,876.11');
assert.equal(balance('0.300000','0.200000'),'0.10');
assert.equal(balance('0.009999','0'),'0.00');
for(const [posted,held] of [['NaN','0'],['1','2'],['1','-1'],['1',''],['1','0.0000001']])assert.equal(balance(posted,held),'—');
assert.equal(displayAvailableBalance(status,'bob'),'—');assert.equal(displayAvailableBalance(null,'alice'),'—');assert.equal(displayAvailableBalance({userId:'alice',balance:{posted:'100'}},'alice'),'—');
assert.equal(depositTokenAmount('4990000','TRC20'),'4.99');assert.equal(depositTokenAmount('4990000000000000000','BEP20'),'4.99');assert.equal(depositTokenAmount('oops','BEP20'),'—');
for(const ar of [true,false]){
 const deposits=renderToStaticMarkup(<FinancialRecords status={status} scope="deposits" ar={ar}/>);
 assert(deposits.includes('deposit-tx'));assert(deposits.includes('4.99 USDT'));assert(!deposits.includes('withdraw-tx'));assert(!deposits.includes('private-transfer'));
 const withdrawals=renderToStaticMarkup(<FinancialRecords status={status} scope="withdrawals" ar={ar}/>);
 assert(withdrawals.includes('withdraw-tx'));assert(!withdrawals.includes('deposit-tx'));assert(!withdrawals.includes('private-transfer'));
 const pending=renderToStaticMarkup(<FinancialRecords status={{...status,payouts:[]}} scope="withdrawals" ar={ar}/>);assert(pending.includes(ar?'قيد المعالجة':'Processing'));
 const summary=renderToStaticMarkup(<FinancialActivity status={{...status,balance:{posted:'100',held:'6'}}} ar={ar}/>);
 assert(summary.includes('94.00'));assert(summary.includes(ar?'إجمالي الرصيد':'Total balance'));
 for(const html of [summary,pending,deposits,withdrawals])assert(!/محجوز|دفتري|held|ledger|Funds reserved/i.test(html.replace(/<[^>]*>/g,'')));
}
// Regression: scoped history is outside .financial-history; long chain hashes must
// have a compact display, an exact copy source and an expandable full reference.
for(const ar of [true,false]){
 const hash='0x'+'a'.repeat(64);
 const html=renderToStaticMarkup(<FinancialRecords status={{...status,deposits:[{id:'long-hash',network:'BEP20',txId:hash,amountBaseUnits:'4990000000000000000',state:'CREDITED',createdAt:'2026-11-03T09:24:00Z'}]}} ar={ar} scope="deposits"/>);
 assert(html.includes('4.99 USDT'));assert(html.includes('financial-record-card'));assert(html.includes('0xaaaaaaaa…aaaaaaaa'));
 assert(html.includes(`<code dir="ltr">${hash}</code>`));assert(html.includes('<details'));assert(html.includes('2026-11-03T09:24:00.000Z'));
 const defaultReference=renderToStaticMarkup(<FinancialReference value={hash} ar={ar}/>);assert(defaultReference.includes(`>${hash}</code>`));assert(!defaultReference.includes('…'));
 const empty=renderToStaticMarkup(<FinancialRecords status={{enabled:true,userId:'alice'}} ar={ar} scope="deposits"/>);assert(empty.includes(ar?'لا توجد إيداعات بعد':'No deposits yet'));
}
console.log('Customer balance and focused records PASS: exact subtraction, acceptance/release/settlement, owner and malformed-value isolation, no financial jargon, deposit/withdrawal scope, precise network units.');
