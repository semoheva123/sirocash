/** Build-only direct API test. The existing key never leaves Vercel except for
 * its documented provider header. No key on argv, pip environment or in logs. */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
export async function runExchangeApiTls(key:string):Promise<unknown>{
 const target=resolve('.cache/exchange-api-tls-client');
 // Minimal child environment: neither database/signing keys nor proxy variables.
 const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV,PATH:process.env.PATH,HOME:'/tmp',LANG:'C.UTF-8',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'};
 const setup=spawnSync('python3',['-m','pip','install','--disable-pip-version-check','--no-input','--only-binary=:all:','--require-hashes','--target',target,'-r','scripts/exchange-inspection-requirements.txt'],
 {env,timeout:120_000,maxBuffer:1024*1024,stdio:'pipe'});
 // Never log arbitrary pip output, exception or command environment.
 if(setup.status!==0||setup.error)return {result:'CLIENT_SETUP_UNAVAILABLE'};
 const run=spawnSync('python3',['scripts/inspect-exchange-api-tls.py'],{env:{...env,PYTHONPATH:target,SP_TODAY_API_KEY:key},timeout:45_000,maxBuffer:8192,stdio:'pipe'});
 if(run.status!==0||run.error)return {result:'CLIENT_RESULT_INVALID'};
 try{return JSON.parse(run.stdout.toString('utf8'))}catch{return {result:'CLIENT_RESULT_INVALID'}}
}
