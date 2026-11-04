import 'server-only';
import {observeDatabasePool,createOwnerSnapshotReader} from './database-resilience';
import {readFinancialSnapshot} from './financial-status';
import {internalTransfersEnabled} from './internal-transfer-mode';
import {financialReadTransactions} from './financial-read-transactions';
import {financialConnectionString} from './financial-connection';
import {Pool} from 'pg';
import {databaseOptions} from './database-options';
import type {WalletDb} from './wallet-engine';
const cache=globalThis as unknown as {siroFinancialPool?:Pool};
/** Separate credential only. Never SET ROLE from the public authentication connection. */
export function financialDatabase(scope:'outbox'|'internal-transfer'='outbox'):WalletDb{
 const connection=financialConnectionString(process.env);
 if(process.env.VERCEL_ENV!=='production'||(scope==='internal-transfer'?!internalTransfersEnabled():process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true')||!connection)throw new Error('FINANCIAL_DATABASE_DISABLED');
 const pool=cache.siroFinancialPool??(cache.siroFinancialPool=observeDatabasePool(new Pool({...databaseOptions(connection,true,process.env.DATABASE_SSL_CA),options:'-c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000 -c timezone=UTC'}),'financial-write'));
 return {transaction:async run=>{
  const c=await pool.connect();
  try{
   const {rows:[r]}=await c.query(`SELECT current_user='sirocash_financial_worker' AS correct,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,pg_has_role(current_user,'sirocash_app','MEMBER') AS app_member,has_column_privilege(current_user,'"User"','passwordHash','SELECT') AS password_access,has_table_privilege(current_user,'"AuthSession"','SELECT') AS auth_access FROM pg_roles WHERE rolname=current_user`);
   if(!r||r.correct!==true||r.rolsuper||r.rolbypassrls||r.rolcreaterole||r.rolcreatedb||r.app_member||r.password_access||r.auth_access)throw new Error('FINANCIAL_DATABASE_UNSAFE_ROLE');
   await c.query('BEGIN');try{const result=await run(c);await c.query('COMMIT');return result}catch(error){await c.query('ROLLBACK');throw error}
  }finally{c.release()}
 }};
}

/** Balance/history reads never enable the outbox, signer, withdrawals or customer commands. */
export function financialReadDatabase():WalletDb{
 const connection=financialConnectionString(process.env);
 if(process.env.VERCEL_ENV!=='production'||!connection)throw Error('FINANCIAL_READ_DATABASE_DISABLED');
 const readCache=globalThis as unknown as {siroFinancialReadPool?:Pool};
 const pool=readCache.siroFinancialReadPool??(readCache.siroFinancialReadPool=observeDatabasePool(new Pool({...databaseOptions(connection,true,process.env.DATABASE_SSL_CA),options:'-c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000 -c timezone=UTC'}),'financial-read'));
 return financialReadTransactions(pool);
}

const sharedRead=createOwnerSnapshotReader((owner:string)=>financialReadDatabase().transaction(tx=>readFinancialSnapshot(tx,owner)));
export const sharedFinancialSnapshot=sharedRead;
