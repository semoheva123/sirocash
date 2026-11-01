import assert from 'node:assert/strict';
import {Client,type Pool} from 'pg';
import {randomUUID} from 'node:crypto';
/** Actual PostgreSQL LISTEN over a separate session, never production. */
export async function financialNotificationFixture(pool:Pool,url:string,ownerId:string){
 const privileges=await pool.query("SELECT has_function_privilege('anon','public.financial_notify_change()','EXECUTE') OR has_function_privilege('authenticated','public.financial_notify_change()','EXECUTE') OR has_function_privilege('sirocash_app','public.financial_notify_change()','EXECUTE') AS exposed");assert.equal(privileges.rows[0].exposed,false);
 const listener=new Client({connectionString:url});await listener.connect();
 const seen:string[]=[];let signal:((owner:string)=>void)|undefined;
 listener.on('notification',event=>{const payload=JSON.parse(event.payload!);assert.deepEqual(Object.keys(payload),['ownerId']);seen.push(payload.ownerId);signal?.(payload.ownerId)});
 await listener.query('LISTEN siro_financial_changes');
 try{
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query('INSERT INTO "LedgerAccount" (id,"userId","accountType") VALUES ($1,$2,\'USER\')',[randomUUID(),ownerId]);
   // The notification must not arrive before commit, nor after rollback.
   await listener.query('SELECT pg_sleep(0.05)');assert.equal(seen.length,0);await c.query('ROLLBACK');
   await listener.query('SELECT pg_sleep(0.05)');assert.equal(seen.length,0);
  }finally{c.release()}
  let timeout:ReturnType<typeof setTimeout>;
  const delivered=new Promise<void>((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('COMMITTED_NOTIFICATION_MISSING')),3000);signal=owner=>{if(owner===ownerId){clearTimeout(timeout);resolve()}}});
  try{await pool.query('INSERT INTO "LedgerAccount" (id,"userId","accountType") VALUES ($1,$2,\'USER\')',[randomUUID(),ownerId]);await delivered}finally{clearTimeout(timeout!)}
  assert.deepEqual(seen,[ownerId]);
  console.log('PostgreSQL event PASS: separate LISTEN session receives only owner invalidation after COMMIT, none before commit or on ROLLBACK.');
 }finally{await listener.end()}
}
