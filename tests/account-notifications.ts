import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {PoolClient} from 'pg';
import {readAccountNotifications,markAccountNotificationRead} from '../lib/account-notifications';
import {notificationEventConnection} from '../lib/account-notification-events';
async function main(){
 const pg=new PGlite(),owner=randomUUID(),other=randomUUID(),admin=randomUUID(),admin2=randomUUID(),ticket=randomUUID();
 try{
  await pg.exec(`CREATE ROLE sirocash_app;CREATE ROLE sirocash_financial_worker;CREATE ROLE anon;CREATE ROLE authenticated;
   CREATE TABLE "User"(id uuid PRIMARY KEY);CREATE TABLE "SupportTicket"(id uuid PRIMARY KEY,"ownerId" uuid,status text);CREATE TABLE "SupportMessage"(id uuid PRIMARY KEY,"ticketId" uuid,"fromSupport" boolean);
   CREATE TABLE "SecurityEvent"(id text PRIMARY KEY,"userId" uuid,kind text);CREATE TABLE "WalletOperation"(id uuid PRIMARY KEY,"ownerId" uuid,state text,kind text,"counterpartyId" uuid);CREATE TABLE "UserDepositAddress"(id uuid,"ownerId" uuid,network text);CREATE TABLE "ChainDepositInbox"(id uuid,"addressId" uuid,network text);CREATE TABLE "AuthSession"("userId" uuid);`);
  await pg.exec(await readFile('prisma/migrations/20261104020000_account_notifications/migration.sql','utf8'));
  for(const id of [owner,other,admin,admin2])await pg.query('INSERT INTO "User" VALUES($1)',[id]);
  const db={query:(sql:string,params?:unknown[])=>pg.query(sql,params)} as unknown as Pick<PoolClient,'query'>;
  await pg.query('INSERT INTO "SupportTicket" VALUES($1,$2,\'WAITING_SUPPORT\')',[ticket,owner]);
  const staffMessage=randomUUID();await pg.query('INSERT INTO "SupportMessage" VALUES($1,$2,true)',[staffMessage,ticket]);
  let own=await readAccountNotifications(db,owner,false);assert.equal(own.unread,1);assert.equal(own.notifications[0].kind,'SUPPORT_REPLY');assert.equal(own.notifications[0].reference,ticket);
  assert.equal((await readAccountNotifications(db,other,false)).notifications.length,0);
  assert.equal((await readAccountNotifications(db,admin,true)).notifications.length,0,'Staff cannot read private customer notifications');
  await markAccountNotificationRead(db,other,false,own.notifications[0].id);assert.equal((await readAccountNotifications(db,owner,false)).unread,1);
  await markAccountNotificationRead(db,owner,false,own.notifications[0].id);await markAccountNotificationRead(db,owner,false,own.notifications[0].id);assert.equal((await readAccountNotifications(db,owner,false)).unread,0);
  await pg.query('INSERT INTO "SupportMessage" VALUES($1,$2,false)',[randomUUID(),ticket]);
  const staff=await readAccountNotifications(db,admin,true);assert.equal(staff.unread,1);assert.equal(staff.notifications[0].kind,'SUPPORT_MESSAGE');
  assert.equal((await readAccountNotifications(db,other,false)).unread,0);
  await markAccountNotificationRead(db,admin,true,staff.notifications[0].id);assert.equal((await readAccountNotifications(db,admin2,true)).unread,1,'Staff read receipts isolated');
  await pg.query('INSERT INTO "SecurityEvent" VALUES($1,$2,\'password_changed\')',['fixture-security',owner]);
  await pg.query('UPDATE "SupportTicket" SET status=\'CLOSED\' WHERE id=$1',[ticket]);await pg.query('UPDATE "SupportTicket" SET status=\'CLOSED\' WHERE id=$1',[ticket]);
  own=await readAccountNotifications(db,owner,false);assert.equal(own.notifications.filter(n=>n.kind==='SUPPORT_CLOSED').length,1);assert(own.notifications.some(n=>n.kind==='SECURITY_password_changed'));
  const operation=randomUUID();await pg.query('INSERT INTO "WalletOperation" VALUES($1,$2,\'PENDING\',\'TRANSFER\',$3)',[operation,owner,other]);await pg.query('UPDATE "WalletOperation" SET state=\'COMPLETED\' WHERE id=$1',[operation]);
  assert((await readAccountNotifications(db,owner,false)).notifications.some(n=>n.kind==='OPERATION_TRANSFER_COMPLETED'));
  assert.equal((await readAccountNotifications(db,other,false)).notifications[0].kind,'TRANSFER_RECEIVED');
  const address=randomUUID();await pg.query('INSERT INTO "UserDepositAddress" VALUES($1,$2,\'TRC20\')',[address,owner]);await pg.query('INSERT INTO "ChainDepositInbox" VALUES($1,$2,\'TRC20\')',[randomUUID(),address]);
  assert((await readAccountNotifications(db,owner,false)).notifications.some(n=>n.kind==='DEPOSIT_OBSERVED'));
  const before=(await readAccountNotifications(db,owner,false)).unread;
  await pg.exec('BEGIN');await pg.query('INSERT INTO "SecurityEvent" VALUES($1,$2,\'sign_in\')',['rolled-back',owner]);await pg.exec('ROLLBACK');
  assert.equal((await readAccountNotifications(db,owner,false)).unread,before);
  const {rows:[permissions]}=await pg.query<{safe:boolean}>(`SELECT NOT has_table_privilege('anon','"AccountNotification"','SELECT') AND NOT has_table_privilege('authenticated','"AccountNotificationRead"','INSERT') AND NOT has_table_privilege('sirocash_app','"AccountNotification"','INSERT') AND NOT has_function_privilege('sirocash_app','public.account_notification_event()','EXECUTE') AS safe`);assert(permissions.safe);
  assert.equal(new URL(notificationEventConnection('postgresql://sirocash_app.fixture:fake@aws-0-x.pooler.supabase.com:6543/db')).port,'5432');
  for(const v of [undefined,'postgresql://postgres:fake@db.example/db','postgresql://sirocash_app:fake@db.example:6543/db'])assert.throws(()=>notificationEventConnection(v));
  console.log('Account inbox PASS: durable support/security/operation events, no backfill, owner/staff isolation, per-user idempotent read receipts, rollback, private functions/table grants, dedicated session connection. No real financial or external delivery I/O.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
