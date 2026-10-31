import assert from 'node:assert/strict';
import { planTreasuryRefill, custodyReadiness } from '../lib/treasury-automation';
const p={lowWater:20n,target:100n,maxTopup:100n,dailyLimit:200n,reserveFloor:50n,maxFee:5n,evidenceMaxAgeMs:30000};
const s={operating:10n,reserve:200n,fee:2n,spentToday:0n,observedAt:1000,now:2000,reconciled:true,pendingRefill:false};
assert.deepEqual(planTreasuryRefill(p,s),{action:'PREPARE',amount:90n});
for(const [change,reason] of [
 [{pendingRefill:true},'PENDING_REFILL_REQUIRES_RECONCILIATION'],
 [{reconciled:false},'RECONCILIATION_REQUIRED'],[{now:40000},'STALE_EVIDENCE'],
 [{observedAt:3000},'STALE_EVIDENCE'],[{operating:20n},'SUFFICIENT_OPERATING_BALANCE'],
 [{fee:6n},'FEE_CAP'],[{spentToday:111n},'DAILY_CAP'],[{reserve:139n},'RESERVE_FLOOR'],
] as const) assert.deepEqual(planTreasuryRefill(p,{...s,...change}),{action:'WAIT',reason});
assert.deepEqual(planTreasuryRefill({...p,maxTopup:89n},s),{action:'WAIT',reason:'TOPUP_CAP'});
assert.deepEqual(planTreasuryRefill(p,{...s,reserve:140n}),{action:'PREPARE',amount:90n});
assert.throws(()=>planTreasuryRefill({...p,target:10n},s));
assert.throws(()=>planTreasuryRefill(p,{...s,operating:-1n}));
assert.equal(custodyReadiness({}).ready,false);
assert.equal(custodyReadiness({isolatedSigner:true}).blockers.includes('isolatedSigner'),false);
assert.equal(custodyReadiness({fake:true}).ready,false);
console.log('Treasury policy tests passed: caps, pending outcomes, freshness, reserve protection and fail-closed readiness. No funds moved.');
