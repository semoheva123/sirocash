import {createECDH} from 'node:crypto';
import {database} from '../lib/database';
async function main(){
 if(process.env.WEB_PUSH_ENABLED!=='true'){console.log('Web Push preflight: disabled.');return}
 const publicKey=process.env.WEB_PUSH_PUBLIC_KEY,privateKey=process.env.WEB_PUSH_PRIVATE_KEY,secret=process.env.WEB_PUSH_WORKER_SECRET;
 if(!publicKey||!privateKey||!secret||secret.length<32)throw Error();
 const key=createECDH('prime256v1');key.setPrivateKey(Buffer.from(privateKey,'base64url'));if(key.getPublicKey().toString('base64url')!==publicKey)throw Error();
 const {rows:[row]}=await database().query(`SELECT current_user='sirocash_app' AS role,(SELECT count(*)=3 FROM pg_class WHERE oid IN ('public."WebPushSubscription"'::regclass,'public."WebPushDelivery"'::regclass,'public."WebPushWake"'::regclass) AND relrowsecurity) AS rls,NOT has_function_privilege('sirocash_app','public.dispatch_web_push()','EXECUTE') AND NOT has_table_privilege('sirocash_financial_worker','public."WebPushSubscription"','SELECT') AND NOT has_table_privilege('anon','public."WebPushSubscription"','SELECT') AND NOT has_table_privilege('authenticated','public."WebPushSubscription"','SELECT') AS private`);
 if(!row?.role||!row.rls||!row.private)throw Error();
 await database().query('SELECT id,"sessionHash",endpoint,p256dh,auth,language FROM "WebPushSubscription" WHERE false');
 console.log('Web Push preflight: valid paired keys, restricted role and private schema. No push/provider/financial requests. Not device receipt proof.');
}
main().catch(()=>{console.error('Web Push preflight failed (configuration or private schema; details redacted).');process.exitCode=1}).finally(async()=>{if(process.env.WEB_PUSH_ENABLED==='true')await database().end()});
