import {database} from '../lib/database';
async function main(){
 if(process.env.VERCEL_ENV!=='production'){console.log('Passkey session bridge: production-only check skipped.');return}
 if(process.env.SIRO_DURABLE_PASSKEY_ENABLED!=='true'){console.log('Passkey session bridge: feature disabled.');return}
 const db=database();try{
  const {rows:[r]}=await db.query(`SELECT current_user='sirocash_app' AS app,
   has_any_column_privilege(current_user,'public."AuthSession"','UPDATE') AS session_mutation,
   EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='passkey_assert_session'
    AND p.oid=to_regprocedure('public.passkey_assert_session(uuid,text)')
    AND p.prosecdef AND p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
    AND has_function_privilege(current_user,p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('sirocash_financial_worker',p.oid,'EXECUTE')) AS private_bridge`);
  if(!r?.app||r.session_mutation||!r.private_bridge)throw Error('PASSKEY_SESSION_BRIDGE_NOT_READY');
  console.log('Passkey session bridge VERIFIED: private lock-only bridge; web role still cannot mutate sessions. No user session or financial operation tested.');
 }finally{await db.end()}
}
main().catch(()=>{console.error('Passkey session bridge NOT READY; no session/credential details logged.');process.exitCode=1});
