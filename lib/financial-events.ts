import 'server-only';
import {Client} from 'pg';
import {databaseOptions} from './database-options';
import {financialEventConnection} from './financial-event-connection';
import {createFinancialChangeHub} from './financial-change-hub';
const globalHub=globalThis as unknown as {siroFinancialEvents?:ReturnType<typeof createFinancialChangeHub>};
export function financialEvents(){
 return globalHub.siroFinancialEvents??(globalHub.siroFinancialEvents=createFinancialChangeHub(async(notify,lost)=>{
  const c=new Client({...databaseOptions(financialEventConnection(process.env),true,process.env.DATABASE_SSL_CA),keepAlive:true,keepAliveInitialDelayMillis:10000});
  let closed=false;
  const close=async()=>{if(closed)return;closed=true;await c.end()};
  c.on('error',()=>{if(!closed)lost()});c.on('end',()=>{if(!closed)lost()});
  c.on('notification',m=>{if(m.channel==='siro_financial_changes'&&m.payload)notify(m.payload)});
  try{
   await c.connect();
   const {rows:[role]}=await c.query(`SELECT current_user='sirocash_financial_worker' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT pg_has_role(current_user,'sirocash_app','MEMBER') AND NOT has_table_privilege(current_user,'"AuthSession"','SELECT') AS safe FROM pg_roles WHERE rolname=current_user`);
   if(!role?.safe)throw Error('FINANCIAL_EVENTS_UNSAFE_ROLE');
   const {rows:[schema]}=await c.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('financial_balance_event','financial_operation_event','financial_transaction_event','financial_session_event') AND tgenabled='O'");
   if(schema?.n!==4)throw Error('FINANCIAL_EVENTS_MIGRATION_REQUIRED');
   await c.query('LISTEN siro_financial_changes');
   return close;
  }catch(e){await close().catch(()=>{});throw e}
 }));
}
