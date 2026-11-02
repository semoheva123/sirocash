import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {quoteUsdtWithdrawal} from '../lib/withdrawal-fees';
import {WithdrawalFeeSummary} from '../components/withdrawal-fee-summary';
assert.equal(quoteUsdtWithdrawal('TRC20','20').net,'15.000000');
assert.equal(quoteUsdtWithdrawal('BEP20','20').net,'18.000000');
assert.equal(quoteUsdtWithdrawal('TRC20','100').fee,'5.000000');
assert.equal(quoteUsdtWithdrawal('TRC20','5.000001').net,'0.000001');
for(const amount of ['0','5','4.99','-1','1e2','NaN','5.0000001'])assert.throws(()=>quoteUsdtWithdrawal('TRC20',amount));
assert.throws(()=>quoteUsdtWithdrawal('BEP20','2'));
assert.throws(()=>quoteUsdtWithdrawal('ETHEREUM','20'));
for(const ar of [true,false]){
 const html=renderToStaticMarkup(<WithdrawalFeeSummary asset="USDT" network="TRC20" amount="20" ar={ar}/>);
 assert.ok(html.includes('15.000000'));assert.ok(html.includes('5 USDT'));
 assert.ok(html.includes(ar?'صافي المبلغ للمستلم':'Recipient receives'));
 assert.ok(!html.includes(ar?'السحب الفعلي غير مفعّل':'live withdrawals are not activated'),'Capability state belongs to the live form, not the fee calculator');
}
assert.equal(renderToStaticMarkup(<WithdrawalFeeSummary asset="USDC" network="ETHEREUM" amount="20" ar/>),'');
console.log('Fixed gross-deducted USDT withdrawal tariffs and bilingual summaries passed.');
