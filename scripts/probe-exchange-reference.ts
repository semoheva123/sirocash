/** Production-only, read-only upstream recovery for the FIRST failed bootstrap.
 * At most ONE additional diagnostic attempt/month: SQL requires attempts=1,
 * snapshot=null, not blocked, and increments the existing 93-attempt budget.
 * Redeploys never reset a budget or trigger repeated recovery probes. */
import {database} from '../lib/database';
import {loadExchangeReference} from '../lib/exchange-reference-store';
async function main(){
 if(process.env.VERCEL_ENV!=='production'||!process.env.SP_TODAY_API_KEY||!process.env.DATABASE_URL){console.log('Exchange reference: production recovery probe skipped');return}
 const db=database();
 await loadExchangeReference({db,key:process.env.SP_TODAY_API_KEY,fetch,now:()=>new Date(),diagnostic:true});
 const {rows}=await db.query(`SELECT "lastOutcome","lastHttpStatus","lastIssues",snapshot IS NOT NULL AS "hasSnapshot",attempts FROM "ExchangeReference" WHERE id='sp-today'`);
 console.log('Exchange reference sanitized diagnostic:',JSON.stringify(rows));
 await db.end();
}
main().catch(()=>{console.log('Exchange reference: diagnostics unavailable (no sensitive details logged)');process.exitCode=1});
