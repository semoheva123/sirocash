import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {databaseOptions} from '../lib/database-options';
import {accountNotificationEvents,notificationEventConnection} from '../lib/account-notification-events';
async function main(){
 if(process.env.VERCEL_ENV!=='production'){console.log('Account notification preflight: SKIPPED (not production).');return}
 const c=new Client(databaseOptions(notificationEventConnection(process.env.DATABASE_URL),true,process.env.DATABASE_SSL_CA));
 let off:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await c.connect();
  const {rows:[schema]}=await c.query(`SELECT
   (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN ('account_support_message','account_support_closed','account_security_event','account_operation_event','account_notification_changed','account_notification_read','account_notification_session','account_deposit_observed'))=8 AS triggers,
   (SELECT count(*) FROM pg_class WHERE oid IN ('public."AccountNotification"'::regclass,'public."AccountNotificationRead"'::regclass) AND relrowsecurity)=2 AS rls,
   NOT has_table_privilege('sirocash_financial_worker','public."AccountNotification"','SELECT') AND NOT has_table_privilege('anon','public."AccountNotification"','SELECT') AND NOT has_table_privilege('authenticated','public."AccountNotification"','SELECT') AND NOT has_table_privilege('sirocash_app','public."AccountNotification"','INSERT') AND NOT has_function_privilege('sirocash_app','public.account_notification_event()','EXECUTE') AND NOT has_function_privilege('sirocash_app','public.account_notification_invalidate()','EXECUTE') AS private`);
  const {rows:[feed]}=await c.query(`SELECT
   EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='exchange_public_snapshot' AND tgenabled='O' AND NOT tgisinternal) AS installed,
   NOT has_function_privilege('sirocash_app','public.exchange_feed_changed()','EXECUTE') AND NOT has_function_privilege('anon','public.exchange_feed_changed()','EXECUTE') AS private`);
  await c.query('SELECT "publicEnabled","publicNextAttemptAt","publicBlockedUntil","publicNextWakeAt","publicRequestId","publicOutcome","publicHttpStatus" FROM "ExchangeReference" WHERE false');
  if(!feed?.installed||!feed.private)throw Error('PUBLIC_FEED_SCHEMA_UNSAFE');
  if(!schema?.triggers||!schema.rls||!schema.private)throw Error('NOTIFICATION_SCHEMA_UNSAFE');
  await c.query('SELECT n.id,n.kind,n.reference,n.staff,n."createdAt",r."readAt" FROM public."AccountNotification" n LEFT JOIN public."AccountNotificationRead" r ON r."notificationId"=n.id WHERE false');
  const ownerId=randomUUID();let received!:()=>void,failed!:(e:Error)=>void;
  const delivered=new Promise<void>((resolve,reject)=>{received=resolve;failed=reject});void delivered.catch(()=>{});
  off=await accountNotificationEvents().subscribe(ownerId,received,()=>failed(Error('LISTENER_LOST')));
  timer=setTimeout(()=>failed(Error('ACCOUNT_EVENT_MISSING')),5000);
  // Invalidates a nonexistent synthetic owner ONLY. No users, inbox rows, messages,
  // mail, read receipts or monetary operations are created by this check.
  await c.query("SELECT pg_notify('siro_account_notifications',$1)",[JSON.stringify({ownerId})]);await delivered;
  console.log('Account notification preflight: VERIFIED eight notification triggers plus private exchange trigger, private/RLS inbox, app-role dedicated session LISTEN and synthetic owner-only delivery. No customer data, external delivery or financial operations. This is not end-user device receipt proof.');
 }finally{clearTimeout(timer);off?.();await c.end()}
}
main().catch(()=>{console.error('Account notification preflight: FAILED (schema, private role, session connection or delivery). No credentials or customer data logged.');process.exitCode=1});
