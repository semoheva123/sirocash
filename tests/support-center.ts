import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {PoolClient} from 'pg';
import {supportGet,supportPost,type SupportDependencies} from '../lib/support-http';
import {writeSupport,supportInput,supportAdmin} from '../lib/support-center';
async function main(){
 const pg=new PGlite();
 const owner=randomUUID(),other=randomUUID(),admin=randomUUID();
 try{
  await pg.exec('CREATE ROLE sirocash_app;CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "User"(id uuid PRIMARY KEY);');
  await pg.exec(await readFile('prisma/migrations/20261103160000_support_center/migration.sql','utf8'));
  for(const id of [owner,other,admin])await pg.query('INSERT INTO "User" VALUES($1)',[id]);
  const act=(id:string,staff:boolean,input:Parameters<typeof writeSupport>[3],ticket?:string)=>pg.transaction(tx=>writeSupport({query:async(sql:string,values:unknown[])=>tx.query(sql,values)} as unknown as Pick<PoolClient,'query'>,id,staff,input,ticket));
  const input={action:'create' as const,subject:'Account inquiry',category:'ACCOUNT' as const,body:'Please help with my account.',requestKey:randomUUID()};
  assert(!supportInput.safeParse({...input,ownerId:other}).success);
  assert(!supportInput.safeParse({...input,body:' '}).success);
  assert(!supportInput.safeParse({...input,body:'😀'}).success);
  assert(!supportInput.safeParse({...input,body:'bad\u0000text'}).success);
  assert(!supportInput.safeParse({...input,subject:'😀😀'}).success);
  assert(!supportInput.safeParse({...input,body:'a'.repeat(4001)}).success);
  assert(!supportInput.safeParse({...input,category:'FAKE'}).success);
  assert(!supportAdmin(owner));
  const ticket=await act(owner,false,input);
  assert.deepEqual(await act(owner,false,input),ticket);
  assert.equal((await pg.query<{n:number}>('SELECT count(*)::int n FROM "SupportMessage"')).rows[0].n,1);
  await assert.rejects(()=>act(owner,false,{...input,body:'Changed replay text'}));
  await assert.rejects(()=>act(other,false,{action:'reply',body:'Foreign reply',requestKey:randomUUID()},ticket.id));
  await assert.rejects(()=>act(owner,false,{action:'close'},ticket.id));
  const staffReply={action:'reply' as const,body:'We can help. Please describe the issue.',requestKey:randomUUID()};
  await act(admin,true,staffReply,ticket.id);
  assert.equal((await pg.query<{status:string}>('SELECT status FROM "SupportTicket" WHERE id=$1',[ticket.id])).rows[0].status,'WAITING_CUSTOMER');
  await act(admin,true,staffReply,ticket.id);
  await act(owner,false,{action:'reply',body:'Here are more details.',requestKey:randomUUID()},ticket.id);
  assert.equal((await pg.query<{status:string}>('SELECT status FROM "SupportTicket" WHERE id=$1',[ticket.id])).rows[0].status,'WAITING_SUPPORT');
  assert.equal((await pg.query<{n:number}>('SELECT count(*)::int n FROM "SupportMessage"')).rows[0].n,3);
  await act(admin,true,{action:'close'},ticket.id);
  await assert.rejects(()=>act(owner,false,{action:'reply',body:'After close',requestKey:randomUUID()},ticket.id));
  for(let i=0;i<5;i++)await act(other,false,{...input,requestKey:randomUUID()});
  await assert.rejects(()=>act(other,false,{...input,requestKey:randomUUID()}));
  assert.equal((await pg.query<{n:number}>('SELECT count(*)::int n FROM "SupportTicket" WHERE "ownerId"=$1',[other])).rows[0].n,5);
  const {rows:[priv]}=await pg.query(`SELECT has_table_privilege('anon','"SupportMessage"','SELECT') anon,has_table_privilege('authenticated','"SupportMessage"','INSERT') browser,has_table_privilege('sirocash_app','"SupportMessage"','UPDATE') edit,has_table_privilege('sirocash_app','"SupportMessage"','DELETE') erase`);
  assert.deepEqual(priv,{anon:false,browser:false,edit:false,erase:false});
  const client={query:async(sql:string,values:unknown[])=>pg.query(sql,values)} as unknown as PoolClient;
  const deps=(id:string|null):SupportDependencies=>({user:async()=>id?{id}:null,admin:id=>id===admin,db:()=>client,transaction:run=>pg.transaction(tx=>run({query:async(sql:string,values:unknown[])=>tx.query(sql,values)} as unknown as PoolClient))});
  assert.equal((await supportGet(new Request('https://wallet.test/api/support'),undefined,deps(null))).status,401);
  assert.equal((await supportGet(new Request('https://wallet.test/api/support?staff=1'),undefined,deps(other))).status,403);
  assert.equal((await supportGet(new Request('https://wallet.test/api/support/'+ticket.id),ticket.id,deps(other))).status,404);
  const ownResponse=await supportGet(new Request('https://wallet.test/api/support/'+ticket.id),ticket.id,deps(owner));
  assert.equal(ownResponse.status,200);assert.equal(ownResponse.headers.get('cache-control'),'no-store');
  const own=await ownResponse.json();assert.equal(own.messages.length,3);assert(!JSON.stringify(own).includes(owner));assert(!JSON.stringify(own).includes('requestKey'));
  assert.equal((await supportGet(new Request('https://wallet.test/api/support/'+ticket.id+'?staff=1'),ticket.id,deps(admin))).status,200);
  const oldOrigin=process.env.WEBAUTHN_ORIGIN;process.env.WEBAUTHN_ORIGIN='https://wallet.test';
  try{
   const req=(data:unknown,origin='https://wallet.test')=>new Request('https://wallet.test/api/support',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
   assert.equal((await supportPost(req({...input,ownerId:other}),undefined,deps(owner))).status,400);
   assert.equal((await supportPost(req(input,'https://evil.test'),undefined,deps(owner))).status,400);
   assert.equal((await supportPost(req(input),undefined,deps(null))).status,401);
   assert.equal((await supportPost(req(input),undefined,deps(owner))).status,200);
  }finally{if(oldOrigin===undefined)delete process.env.WEBAUTHN_ORIGIN;else process.env.WEBAUTHN_ORIGIN=oldOrigin}
  await pg.exec('SET ROLE sirocash_app');
  assert.equal((await pg.query<{n:number}>('SELECT count(*)::int n FROM "SupportTicket"')).rows[0].n,6);
  await assert.rejects(()=>pg.query('UPDATE "SupportMessage" SET body=\'tamper\''));
  await pg.exec('RESET ROLE');
  console.log('Support center PASS: isolated PostgreSQL migration, strict input, authenticated-owner binding in writes, private replay/no duplicates, staff replies/status/closure, closed denial, durable quotas and public/immutable-message privileges. No email or financial I/O.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
