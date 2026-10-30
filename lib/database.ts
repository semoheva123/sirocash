import 'server-only';
import {Pool,type PoolClient} from 'pg';
const globalDatabase=globalThis as unknown as {siroDatabasePool?:Pool};
export function databaseConfigured(){return Boolean(process.env.DATABASE_URL)}
export function database(){
 if(!process.env.DATABASE_URL)throw Error('خدمة الحسابات غير متاحة حالياً. يُرجى المحاولة لاحقاً.');
 if(globalDatabase.siroDatabasePool)return globalDatabase.siroDatabasePool;
 const url=new URL(process.env.DATABASE_URL);
 const tls=process.env.NODE_ENV==='production'||Boolean(process.env.DATABASE_SSL_CA);
 if(tls){
  // pg's connection-string SSL parameters otherwise replace the explicit TLS options.
  for(const key of ['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat'])url.searchParams.delete(key);
 }
 return globalDatabase.siroDatabasePool=new Pool({
  connectionString:url.toString(),
  max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:10000,
  // Optional PEM supplied through the secret manager. Never disable certificate verification.
  ...(tls?{ssl:{rejectUnauthorized:true,...(process.env.DATABASE_SSL_CA?{ca:process.env.DATABASE_SSL_CA.replace(/\\n/g,'\n')}: {})}}:{}),
 });
}
export async function databaseTransaction<T>(run:(c:PoolClient)=>Promise<T>){
 const c=await database().connect();
 try{await c.query('BEGIN');const result=await run(c);await c.query('COMMIT');return result}
 catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
