import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
import {planTronFunding,type TronFundingInput} from '../lib/tron-funding-workflow';
const xpub=HDKey.fromMasterSeed(new Uint8Array(32).fill(2)).derive("m/44'/195'/0'").publicExtendedKey;
const addresses=[0,1,2].map(i=>deriveTronDepositAddress(xpub,i).address);
const resource={required:65000,available:0,bandwidthReady:true,nativeFeeReserveReady:true,rentalState:'NONE' as const,rentalPriceSun:1500000n,quoteExpiresAt:20000,delegationExpiresAt:0,priceCapEnforceable:true};
const input:TronFundingInput={operationId:'withdrawal:test:001',gross:'20',destination:addresses[0],operatingAddress:addresses[1],operatingSpendable:5000000n,fundingReservedForOperation:true,reservationValid:true,deviceApprovalValid:true,reconciled:true,observedAt:1000,now:2000,maxEvidenceAgeMs:30000,maxRentalSun:2000000n,minExecutionWindowMs:60000,catalog:[{energy:65000,durationMinutes:60}],payoutResource:resource,sources:[{address:addresses[2],spendable:30000000n,economical:true,resource}],pendingSweepTxId:null,payoutTxId:null,payoutFinality:'UNKNOWN'};
const rental=planTronFunding(input);assert.equal(rental.type,'RENT_ENERGY');if(rental.type==='RENT_ENERGY')assert.equal(rental.sender,addresses[2]);
const ready={...resource,available:65000};
const sweep=planTronFunding({...input,sources:[{...input.sources[0],resource:ready}]});
assert.equal(sweep.type,'PREPARE_TRANSFER');if(sweep.type==='PREPARE_TRANSFER'){assert.equal(sweep.kind,'SWEEP');assert.equal(sweep.amountBaseUnits,'10000000')}
const txId='ab'.repeat(32);
assert.deepEqual(planTronFunding({...input,pendingSweepTxId:txId}),{type:'RECONCILE',kind:'SWEEP',txId});
const funded={...input,operatingSpendable:15000000n};
const payoutEnergy=planTronFunding(funded);assert.equal(payoutEnergy.type,'RENT_ENERGY');if(payoutEnergy.type==='RENT_ENERGY')assert.equal(payoutEnergy.sender,addresses[1]);
const payout=planTronFunding({...funded,payoutResource:ready});assert.equal(payout.type,'PREPARE_TRANSFER');if(payout.type==='PREPARE_TRANSFER'){assert.equal(payout.kind,'PAYOUT');assert.equal(payout.amountBaseUnits,'15000000')}
assert.deepEqual(planTronFunding({...funded,payoutTxId:txId}),{type:'RECONCILE',kind:'PAYOUT',txId});
assert.deepEqual(planTronFunding({...funded,payoutTxId:txId,payoutFinality:'CONFIRMED'}),{type:'SETTLE',txId,outcome:'CONFIRMED'});
for(const changed of [{deviceApprovalValid:false},{reservationValid:false},{reconciled:false},{observedAt:-100000},{fundingReservedForOperation:false}])assert.equal(planTronFunding({...funded,...changed}).type,'WAIT');
for(const changed of [{rentalState:'UNKNOWN' as const},{priceCapEnforceable:false},{rentalPriceSun:3000000n},{bandwidthReady:false},{nativeFeeReserveReady:false},{quoteExpiresAt:1000}])assert.equal(planTronFunding({...funded,payoutResource:{...resource,...changed}}).type,'WAIT');
assert.deepEqual(planTronFunding(input),rental);
assert.equal(planTronFunding({...input,sources:[]}).type,'WAIT');
console.log('TRON funding workflow passed: demand sweep -> sender energy -> reconcile -> payout energy -> net payout -> final settlement, with fail-closed guards. Planner only.');
