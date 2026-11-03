import assert from 'node:assert/strict';
import {Client,type Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readAccountNotifications} from '../lib/account-notifications';
/** Independent sessions in the existing disposable PostgreSQL 16/17 harness ONLY. */
export async function accountNotificationAcceptance(pool:Pool,url:string,owner:string,other:string){
 const listener=new Client({connectionString:url});await listener.connect();
 const events:string[]=[];let signal:((id:string)=>void)|undefined;
 listener.on('notification',m=>{const p=JSON.parse(m.payload!);assert.deepEqual(Object.keys(p),['ownerId']);events.push(p.ownerId);signal?.(p.ownerId)});
 await listener.query('SET ROLE sirocash_app');await listener.query('LISTEN siro_account_notifications');
 try{
  const ticket=randomUUID();await pool.query('INSERT INTO "SupportTicket"(id,"ownerId",subject,category) VALUES($1,$2,\'Isolated inbox fixture\',\'OTHER\')',[ticket,owner]);
  async function message(c:Pick<Client,'query'>,support:boolean){await c.query('INSERT INTO "SupportMessage"(id,"ticketId","authorId","fromSupport",body,"requestKey") VALUES($1,$2,$3,$4,\'Isolated fixture only\',$5)',[randomUUID(),ticket,support?other:owner,support,randomUUID()])}
  const c=await pool.connect();try{
   await c.query('BEGIN');await message(c,true);await listener.query('SELECT pg_sleep(0.05)');assert.equal(events.length,0);await c.query('ROLLBACK');await listener.query('SELECT pg_sleep(0.05)');assert.equal(events.length,0);
  }finally{c.release()}
  async function committed(expected:string,fromSupport:boolean){
   let timer:ReturnType<typeof setTimeout>|undefined;
   const received=new Promise<void>((resolve,reject)=>{timer=setTimeout(()=>reject(Error('ACCOUNT_NOTIFICATION_MISSING')),3000);signal=id=>{if(id===expected)resolve()}});void received.catch(()=>{});
   try{await message(pool,fromSupport);await received}finally{clearTimeout(timer);signal=undefined}
  }
  await committed(owner,true);await committed('support-staff',false);
  assert.deepEqual(events,[owner,'support-staff']);
  const a=await pool.connect();try{
   await a.query('BEGIN');await a.query('SET LOCAL ROLE sirocash_app');
   assert((await readAccountNotifications(a,owner,false)).notifications.some(n=>n.reference===ticket));
   assert(!(await readAccountNotifications(a,other,false)).notifications.some(n=>n.reference===ticket));
   await a.query('COMMIT');
  }finally{a.release()}
  console.log('Account notifications PostgreSQL PASS: real independent app-role LISTEN session, no precommit/rollback notification, committed owner-only and staff-only invalidations, owner-bound durable snapshot. Isolated support messages only.');
 }finally{await listener.end()}
}
