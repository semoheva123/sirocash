import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {activityDirection,activityAmount,pendingActivityStates} from '../lib/activity-presentation';
import {WalletTransactionFeed} from '../components/wallet-transaction-feed';
import {ExternalRemittancePreview} from '../components/external-remittance-preview';
assert.equal(activityDirection('25.000000'),'incoming');
assert.equal(activityDirection('-25.000000'),'outgoing');
for(const value of ['0','-0.000000','bad','NaN','1e3','1.0000001'])assert.equal(activityDirection(value),'neutral');
assert.equal(activityAmount('0.000001'),'+0.000001');
assert.equal(activityAmount('-0.000001'),'−0.000001');
assert.equal(activityAmount('12345678901234567890.123456'),'+12,345,678,901,234,567,890.123456');
assert.equal(activityAmount('100.000000'),'+100.00');
assert.equal(activityAmount('-100.200000'),'−100.20');
assert.equal(activityAmount('bad'),'—');
for(const state of ['PENDING','BROADCAST_UNKNOWN','AWAITING_VALUATION'])assert(pendingActivityStates.has(state));
assert(!pendingActivityStates.has('COMPLETED'));
for(const ar of [true,false]){
 const rows=[{id:'in',type:'P2P',amount:'0.000001',status:'COMPLETED',createdAt:'2026-11-03'},{id:'out',type:'P2P',amount:'-25.000000',status:'COMPLETED',createdAt:'2026-11-03'}];
 const html=renderToStaticMarkup(<WalletTransactionFeed ar={ar} status={{enabled:true,userId:'alice',activity:rows}}/>);
 assert(html.includes('direction-incoming'));assert(html.includes('direction-outgoing'));assert(html.includes('+0.000001'));assert(html.includes('−25.00'));
 assert(html.includes(ar?'قيد الانتظار':'Pending'));
 const empty=renderToStaticMarkup(<WalletTransactionFeed ar={ar} status={{enabled:true,userId:'alice'}}/>);assert(empty.includes(ar?'لا توجد عمليات بعد':'No transactions yet'));
 const external=renderToStaticMarkup(<ExternalRemittancePreview ar={ar}/>);assert(external.includes('disabled=""'));assert(!external.includes('<form'));assert(external.includes(ar?'لا يمكن إرسال حوالة':'no remittance can be submitted'));
}
console.log('Activity presentation PASS: signed P2P direction, full six-decimal precision, malformed values, bilingual cards, empty state and blocked external rails.');
