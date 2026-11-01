import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {FinancialHistory} from '../components/financial-history';
import type {FinancialStatus} from '../components/use-financial-status';
async function main(){
 const status:FinancialStatus={enabled:true,userId:'alice',balance:{posted:'100',held:'6'},activity:[{id:'incoming-transfer',amount:'100',type:'P2P',status:'COMPLETED',createdAt:'2026-11-01'}],operations:[{id:'withdrawal-command',kind:'WITHDRAWAL',amount:'6',feeAmount:'5',state:'RESERVED',createdAt:'2026-11-01'}],deposits:[{id:'observed',network:'TRC20',txId:'incoming-chain-tx',amountBaseUnits:'1000000',state:'AWAITING_VALUATION',createdAt:'2026-11-01'}],payouts:[{id:'outgoing',operationId:'withdrawal-command',network:'TRC20',txId:'outgoing-chain-tx',state:'BROADCAST_UNKNOWN',createdAt:'2026-11-01'}],addresses:[{network:'TRC20',address:'assigned-address'}]};
 for(const ar of [true,false]){
  const html=renderToStaticMarkup(<FinancialHistory status={status} ar={ar}/>);
  for(const id of ['incoming-transfer','withdrawal-command','incoming-chain-tx','outgoing-chain-tx','assigned-address'])assert(html.includes(id));
  assert(html.includes(ar?'بانتظار التقييم المالي':'Awaiting valuation'));assert(html.includes(ar?'نتيجة الإرسال غير مؤكدة':'Broadcast outcome unknown'));
  const updated=renderToStaticMarkup(<FinancialHistory status={{...status,payouts:status.payouts!.map(p=>({...p,state:'CONFIRMED'}))}} ar={ar}/>);
  assert(updated.includes(ar?'مؤكدة على الشبكة':'Confirmed on chain'));assert(!updated.includes(ar?'نتيجة الإرسال غير مؤكدة':'Broadcast outcome unknown'));
 }
 const layout=await readFile('app/(account)/layout.tsx','utf8');assert(layout.includes('<FinancialStatusProvider userId={user.id}>'));
 const app=await readFile('components/siro-app.tsx','utf8');assert(app.includes("useFinancialStatus(page!=='home'&&Boolean(user),user?.id)"));assert(app.includes('<FinancialLivePanel ar={ar} userId={user.id}'));assert(!app.includes('displayAccountBalance(accountBalance)'));assert(app.includes('{!user&&<div className="transactions glass">'));
 const hook=await readFile('components/use-financial-status.ts','utf8');assert(hook.includes('enabled&&!shared'));assert.equal((hook.match(/new EventSource/g)??[]).length,1);
 console.log('Financial UI coverage PASS: shared authenticated-layout stream, all member financial routes, live balance/history, deposit observation, payout transitions, Arabic/English and no authenticated legacy balance/table.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
