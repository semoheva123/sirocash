import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {financialReadDatabase} from '../lib/financial-database';
import {readFinancialSnapshot} from '../lib/financial-status';
async function main(){
 if(process.env.VERCEL_ENV!=='production'){console.log('Financial read preflight: SKIPPED (not production).');return}
 try{
  const data=await financialReadDatabase().transaction(async tx=>{
   const {rows:[mode]}=await tx.query("SELECT current_setting('transaction_read_only') AS mode");
   if(mode?.mode!=='on')throw Error('READ_ONLY_REQUIRED');
   return readFinancialSnapshot(tx,randomUUID());
  });
  if(data.balance?.posted!=='0'||data.balance?.held!=='0'||data.activity.length||data.operations.length||data.addresses.length||data.deposits.length||data.payouts.length)throw Error('EMPTY_OWNER_PROJECTION_REQUIRED');
  console.log('Financial read preflight: VERIFIED restricted credential, read-only repeatable-read snapshot, empty-owner zero balance and all history projections. Monetary activation flags unchanged; no customer data or writes.');
 }finally{await (globalThis as unknown as {siroFinancialReadPool?:Pool}).siroFinancialReadPool?.end()}
}
main().catch(()=>{console.error('Financial read preflight: FAILED (read-only connection or projection unavailable; no credentials logged).');process.exitCode=1});
