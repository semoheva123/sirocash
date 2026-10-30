import assert from 'node:assert/strict';
import {accountOverview,displayAccountBalance} from '../lib/account-overview';
async function main(){
 const alice={id:'account-alice',email:'alice@example.test',emailVerifiedAt:'2026-10-30'};
 const bob={...alice,id:'account-bob',email:'bob@example.test'};
 const balances=new Map([[alice.id,'0.000000'],[bob.id,'98765432109876.120000']]);
 const query=async(sql:string,values:string[])=>{
  assert.equal(sql,'SELECT balance FROM "User" WHERE id=$1');assert.equal(values.length,1);
  const balance=balances.get(values[0]);return {rows:balance?[{balance}]:[]};
 };
 const first=await accountOverview(alice,query),second=await accountOverview(bob,query);
 assert.equal(first.balance,'0.000000');assert.equal(first.user.id,alice.id);
 assert.equal(second.balance,'98765432109876.120000');assert.equal(second.user.id,bob.id);
 for(const result of [first,second]){
  assert.deepEqual(result.transactions,[]);assert.equal(result.demo,false);
  assert.equal(result.financialServicesEnabled,false);assert.equal(result.historyAvailable,false);
  assert.ok(!JSON.stringify(result).includes('SC-8901'));
 }
 assert.equal(displayAccountBalance(first.balance),'0.00');
 assert.equal(displayAccountBalance(second.balance),'98,765,432,109,876.12');
 await assert.rejects(()=>accountOverview({...alice,id:'missing'},query));
 await assert.rejects(()=>accountOverview(alice,async()=>{throw Error('DB down')}));
 await assert.rejects(()=>accountOverview(alice,async()=>({rows:[{balance:'NaN'}]})));
 console.log('Account overview: user-scoped persisted balances, exact display, no demo/history mixing, inactive services and fail-closed errors passed.');
}
main();
