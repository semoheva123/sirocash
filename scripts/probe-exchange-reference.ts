/** One user-authorized bounded direct-API comparison. Leaves normal collection paused.
 * No key decryption, raw provider body, price fixtures, redirects or retries. */
import {database} from '../lib/database';
import {checkExchangeApiTlsOnce} from '../lib/exchange-api-tls-check';
import {runExchangeApiTls} from './run-exchange-api-tls';
async function main(){
 if(process.env.VERCEL_ENV!=='production'||!process.env.SP_TODAY_API_KEY||!process.env.DATABASE_URL){console.log('Exchange reference: production recovery probe skipped');return}
 const db=database();
 await checkExchangeApiTlsOnce({db,key:process.env.SP_TODAY_API_KEY,run:runExchangeApiTls,now:()=>new Date()});
 const {rows}=await db.query(`SELECT "lastOutcome","lastHttpStatus","lastIssues",snapshot IS NOT NULL AS "hasSnapshot",attempts FROM "ExchangeReference" WHERE id='sp-today'`);
 console.log('Exchange reference sanitized diagnostic:',JSON.stringify(rows));
 await db.end();
}
main().catch(()=>{console.log('Exchange reference: diagnostics unavailable (no sensitive details logged)');process.exitCode=1});
