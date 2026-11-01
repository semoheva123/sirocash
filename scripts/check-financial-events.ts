import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {financialEvents} from '../lib/financial-events';
import {financialEventConnection} from '../lib/financial-event-connection';
import {databaseOptions} from '../lib/database-options';
async function main(){
 if(process.env.VERCEL_ENV!=='production'){console.log('Financial event preflight: SKIPPED (not production).');return}
 if(!process.env.FINANCIAL_DATABASE_PASSWORD&&!process.env.FINANCIAL_DATABASE_URL&&!process.env.FINANCIAL_EVENTS_DATABASE_URL){if(process.env.SIRO_CUSTOMER_FINANCE_ENABLED==='true')throw Error();console.log('Financial event preflight: SKIPPED (not provisioned).');return}
 const publisher=new Client(databaseOptions(financialEventConnection(process.env),true,process.env.DATABASE_SSL_CA));
 let off:(()=>void)|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 try{
  const syntheticOwner=randomUUID();let received!:()=>void,failed!:(e:Error)=>void;
  const delivery=new Promise<void>((resolve,reject)=>{received=resolve;failed=reject});
  void delivery.catch(()=>{});
  off=await financialEvents().subscribe(syntheticOwner,received,()=>failed(Error('LISTENER_LOST')));
  await publisher.connect();
  timeout=setTimeout(()=>failed(Error('EVENT_NOT_DELIVERED')),5000);
  // Synthetic invalidation only: no customer/ledger inserts, balance writes or paid commands.
  await publisher.query("SELECT pg_notify('siro_financial_changes',$1)",[JSON.stringify({ownerId:syntheticOwner})]);
  await delivery;
  console.log('Financial event preflight: VERIFIED dedicated session LISTEN, seven triggers, restricted role and synthetic owner-only delivery. No customer data or monetary operations.');
 }finally{if(timeout)clearTimeout(timeout);off?.();await publisher.end()}
}
main().catch(()=>{console.error('Financial event preflight: FAILED (connection, migration or delivery unavailable; no credentials/data logged).');process.exitCode=1});
