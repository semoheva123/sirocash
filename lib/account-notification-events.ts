import 'server-only';
import {Client} from 'pg';
import {databaseOptions} from './database-options';
import {createFinancialChangeHub} from './financial-change-hub';
export function notificationEventConnection(value:string|undefined){
 if(!value)throw Error('NOTIFICATION_CONNECTION_REQUIRED');
 const url=new URL(value);
 if(!/^sirocash_app(?:\.[a-z0-9]+)?$/.test(decodeURIComponent(url.username)))throw Error('NOTIFICATION_UNSAFE_ROLE');
 if(url.port==='6543'){
  if(!url.hostname.endsWith('.pooler.supabase.com'))throw Error('NOTIFICATION_SESSION_CONNECTION_REQUIRED');
  url.port='5432';
 }
 return url.toString();
}
const globalHub=globalThis as unknown as {accountNotificationEvents?:ReturnType<typeof createFinancialChangeHub>};
export function accountNotificationEvents(){
 return globalHub.accountNotificationEvents??(globalHub.accountNotificationEvents=createFinancialChangeHub(async(notify,lost)=>{
  const c=new Client({...databaseOptions(notificationEventConnection(process.env.DATABASE_URL),true,process.env.DATABASE_SSL_CA),keepAlive:true});
  let closed=false;const close=async()=>{if(closed)return;closed=true;await c.end()};
  c.on('error',()=>{if(!closed)lost()});c.on('end',()=>{if(!closed)lost()});
  c.on('notification',m=>{if(m.channel==='siro_account_notifications'&&m.payload)notify(m.payload)});
  try{
   await c.connect();
   const {rows:[role]}=await c.query(`SELECT current_user='sirocash_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AS safe FROM pg_roles WHERE rolname=current_user`);
   if(!role?.safe)throw Error('NOTIFICATION_UNSAFE_ROLE');
   await c.query('LISTEN siro_account_notifications');return close;
  }catch(e){await close().catch(()=>{});throw e}
 }));
}
