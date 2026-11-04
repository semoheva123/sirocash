import type {Pool} from 'pg';
import type {WalletDb} from './wallet-engine';
/** Independent of monetary activation. PostgreSQL itself rejects writes in this transaction. */
export function financialReadTransactions(pool:Pick<Pool,'connect'>):WalletDb{
 return {transaction:async run=>{
  const c=await pool.connect();
  let broken=false;
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows:[r]}=await c.query(`SELECT current_user='sirocash_financial_worker' AS correct,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,pg_has_role(current_user,'sirocash_app','MEMBER') AS app_member,has_column_privilege(current_user,'"User"','passwordHash','SELECT') AS password_access,has_table_privilege(current_user,'"AuthSession"','SELECT') AS auth_access,current_setting('transaction_read_only')='on' AS read_only FROM pg_roles WHERE rolname=current_user`);
    if(!r||r.correct!==true||r.read_only!==true||r.rolsuper||r.rolbypassrls||r.rolcreaterole||r.rolcreatedb||r.app_member||r.password_access||r.auth_access)throw Error('FINANCIAL_READ_UNSAFE_ROLE');
    const result=await run(c);await c.query('COMMIT');return result;
  }catch(error){try{await c.query('ROLLBACK')}catch{broken=true}throw error}
  finally{c.release(broken)}
 }};
}
