import 'server-only';
import {Pool} from 'pg';
import {databaseOptions} from './database-options';
import type {WalletDb} from './wallet-engine';
const cache=globalThis as unknown as {siroFinancialPool?:Pool};
/** Separate credential only. Never SET ROLE from the public authentication connection. */
export function financialDatabase():WalletDb{
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true'||!process.env.FINANCIAL_DATABASE_URL)throw new Error('FINANCIAL_DATABASE_DISABLED');
 const pool=cache.siroFinancialPool??(cache.siroFinancialPool=new Pool({...databaseOptions(process.env.FINANCIAL_DATABASE_URL,true,process.env.DATABASE_SSL_CA),options:'-c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000'}));
 return {transaction:async run=>{
  const c=await pool.connect();
  try{
   const {rows:[r]}=await c.query(`SELECT current_user='sirocash_financial_worker' AS correct,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,pg_has_role(current_user,'sirocash_app','MEMBER') AS app_member,has_column_privilege(current_user,'"User"','passwordHash','SELECT') AS password_access,has_table_privilege(current_user,'"AuthSession"','SELECT') AS auth_access FROM pg_roles WHERE rolname=current_user`);
   if(!r||r.correct!==true||r.rolsuper||r.rolbypassrls||r.rolcreaterole||r.rolcreatedb||r.app_member||r.password_access||r.auth_access)throw new Error('FINANCIAL_DATABASE_UNSAFE_ROLE');
   await c.query('BEGIN');try{const result=await run(c);await c.query('COMMIT');return result}catch(error){await c.query('ROLLBACK');throw error}
  }finally{c.release()}
 }};
}
