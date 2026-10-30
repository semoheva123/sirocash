import {Client} from 'pg';
import {databaseOptions,databaseReadinessQuery,databaseFailureCategory} from '../lib/database-options';
async function main(){
 if(!process.env.DATABASE_URL){console.log('Database preflight: skipped (not configured).');return}
 const client=new Client(databaseOptions(process.env.DATABASE_URL,true,process.env.DATABASE_SSL_CA));
 try{
  await client.connect();
  await client.query(databaseReadinessQuery);
  const {rows:[role]}=await client.query("SELECT current_user='sirocash_app' AS correct_role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
  if(!role?.correct_role||role.rolsuper||role.rolbypassrls){console.error('Database preflight: UNSAFE_RUNTIME_ROLE');process.exitCode=1;return}
  console.log('Database preflight: ready (verified TLS, restricted runtime role, auth schema permissions).');
 }catch(error){
  // Never print raw errors, URLs, passwords, query parameters, or records into build logs.
  console.error('Database preflight: '+databaseFailureCategory(error));process.exitCode=1;
 }finally{await client.end()}
}
main().catch(()=>{console.error('Database preflight: CONFIGURATION');process.exitCode=1});
