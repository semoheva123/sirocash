import 'server-only';
import {createHmac} from 'node:crypto';
import {after} from 'next/server';
import {database} from './database';
let nextLocalCheck=0;
/** An authenticated viewer can wake one globally due read when scheduler is late.
 * Never forwards a user cookie, source key or caller-controlled URL. */
export async function wakePublicExchange(){
 const secret=process.env.AUTH_SECRET;
 if(process.env.VERCEL_ENV!=='production'||!secret||secret.length<32)return;
 // Shared per-process check bound; the database remains the cross-instance gate.
 const now=Date.now();if(now<nextLocalCheck)return;nextLocalCheck=now+30000;
 const {rows}=await database().query(`UPDATE "ExchangeReference" SET "publicNextWakeAt"=now()+interval '5 minutes' WHERE id='sp-today' AND "publicEnabled" AND "publicBlockedUntil"<=now() AND "publicNextAttemptAt"<=now() AND "publicNextWakeAt"<=now() RETURNING id`);
 if(!rows.length)return;
 // Start immediately, including inside an open SSE response. Registering only
 // a callback would defer the wake until the 270-second stream closes.
 const work=(async()=>{
  const at=Math.floor(Date.now()/1000).toString();
  const mac=createHmac('sha256',secret).update('public-exchange:POST:/api/exchange_collect:'+at).digest('hex');
  try{await fetch('https://www.sirocash.online/api/exchange_collect',{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:`PublicFeed ${at}.${mac}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'})}catch{/* Global durable claim/backoff bounds retries; no secrets or raw errors logged. */}
 })();
 after(()=>work);
}
