import assert from 'node:assert/strict';
import {enforceWithdrawalLimit} from '../lib/withdrawal-limits';
for(const status of ['UNVERIFIED','PENDING','REJECTED',undefined,null,'EMAIL_VERIFIED','PRELIMINARY_APPROVED']){
 assert.equal(enforceWithdrawalLimit('100',status).limitMicros,100000000n);
 assert.throws(()=>enforceWithdrawalLimit('100.000001',status),/LIMIT_EXCEEDED/);
}
assert.equal(enforceWithdrawalLimit('1000','VERIFIED').limitMicros,1000000000n);
assert.throws(()=>enforceWithdrawalLimit('1000.000001','VERIFIED'),/LIMIT_EXCEEDED/);
for(const value of ['0','-1','NaN','1e2','100.0000001'])assert.throws(()=>enforceWithdrawalLimit(value,'VERIFIED'));
console.log('Gross withdrawal limits: unverified100 / final identity verified1000, exact boundaries and fail-closed status passed.');
