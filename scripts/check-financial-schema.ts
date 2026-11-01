import {Client} from 'pg';
import {databaseOptions} from '../lib/database-options';
import {verifyFinancialSchema} from '../lib/financial-schema';
async function main(){
 if(process.env.VERCEL_ENV!=='production'&&process.env.SIRO_FINANCIAL_SCHEMA_CHECK!=='true'){console.log('Financial schema preflight: SKIPPED');return}
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_SIGNER_ENABLED!=='false'||!process.env.DATABASE_URL)throw new Error();
 const client=new Client(databaseOptions(process.env.DATABASE_URL,true,process.env.DATABASE_SSL_CA));
 try{
  await client.connect();await client.query('BEGIN READ ONLY');
  console.log('Financial schema preflight: '+JSON.stringify(await verifyFinancialSchema((sql,params)=>client.query(sql,params))));
  await client.query('ROLLBACK');
 }finally{await client.end()}
}
main().catch(()=>{console.error('Financial schema preflight: FAILED (no credentials or records printed).');process.exitCode=1});
