import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createOwnerSnapshotReader,observeDatabasePool,readSessionWithRecovery} from '../lib/database-resilience';
async function main(){
 let calls=0,waits=0;
 assert.equal(await readSessionWithRecovery(async()=>{if(++calls===1)throw {code:'ECONNRESET'};return 'session'},async()=>{waits++}), 'session');assert.equal(calls,2);assert.equal(waits,1);
 for(const code of ['42501','28P01','CERT_HAS_EXPIRED','ETIMEDOUT','57014','unknown','ECONNRESET']){calls=0;const error={code};await assert.rejects(readSessionWithRecovery(async()=>{calls++;throw error},async()=>{}),e=>e===error);assert.equal(calls,code==='ECONNRESET'?2:1)}
 calls=0;assert.equal(await readSessionWithRecovery(async()=>{calls++;return null}),null);assert.equal(calls,1);
 const pool=new EventEmitter();const original=console.error;const logs:unknown[][]=[];console.error=(...args)=>{logs.push(args)};
 try{observeDatabasePool(pool,'account');pool.emit('error',{code:'ECONNRESET',message:'secret://password/customer/token',query:'PRIVATE SQL'});assert.equal(logs.length,1);assert.deepEqual(logs[0],['DATABASE_IDLE_CONNECTION_ERROR',{scope:'account',category:'NETWORK'}]);assert(!JSON.stringify(logs).includes('secret'))}finally{console.error=original}
 let reads=0;const resolvers=new Map<string,(value:string)=>void>();const read=createOwnerSnapshotReader(async owner=>{reads++;return new Promise<string>(resolve=>resolvers.set(owner,resolve))});
 const a=read('alice'),a2=read('alice'),b=read('bob');assert.equal(a,a2);assert.notEqual(a,b);await Promise.resolve();assert.equal(reads,2);resolvers.get('alice')!('A');resolvers.get('bob')!('B');assert.deepEqual(await Promise.all([a,a2,b]),['A','A','B']);const next=read('alice');assert.notEqual(next,a);await Promise.resolve();resolvers.get('alice')!('fresh');assert.equal(await next,'fresh');assert.equal(reads,3);
 let failures=0;const broken=createOwnerSnapshotReader(async()=>{failures++;throw Error('read failed')});await assert.rejects(broken('owner'));await assert.rejects(broken('owner'));assert.equal(failures,2);
 console.log('Database resilience PASS: redacted idle socket observation, bounded session SELECT recovery, no security-error replay, owner-isolated in-flight sharing, fresh settled reads and failure eviction.');
}
void main();
