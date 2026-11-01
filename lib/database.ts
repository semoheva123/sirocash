import 'server-only';
import {Pool,type PoolClient} from 'pg';
import {databaseOptions} from './database-options';
const globalDatabase=globalThis as unknown as {siroDatabasePool?:Pool};
export function databaseConfigured(){return Boolean(process.env.DATABASE_URL)}
export function database(){
 if(!process.env.DATABASE_URL)throw Error('خدمة الحسابات غير متاحة حالياً. يُرجى المحاولة لاحقاً.');
 if(globalDatabase.siroDatabasePool)return globalDatabase.siroDatabasePool;
 return globalDatabase.siroDatabasePool=new Pool(databaseOptions(process.env.DATABASE_URL,process.env.NODE_ENV==='production',process.env.DATABASE_SSL_CA));
}
export async function databaseTransaction<T>(run:(c:PoolClient)=>Promise<T>){
 const c=await database().connect();
 try{await c.query('BEGIN');const result=await run(c);await c.query('COMMIT');return result}
 catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
