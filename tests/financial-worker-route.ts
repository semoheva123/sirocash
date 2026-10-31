import assert from 'node:assert/strict';
import {POST} from '../app/api/internal/financial-worker/route';
async function main(){
 const keys=['SIRO_FINANCIAL_WORKER_SECRET','SIRO_OUTBOX_WORKER_ENABLED','VERCEL_ENV','FINANCIAL_DATABASE_URL'] as const;
 const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  delete process.env.SIRO_FINANCIAL_WORKER_SECRET;
  assert.equal((await POST(new Request('https://sirocash.example/api/internal/financial-worker',{method:'POST'}))).status,401);
  process.env.SIRO_FINANCIAL_WORKER_SECRET='fixture-only-not-a-secret-'.repeat(2);
  for(const value of ['', 'Bearer invalid', 'Bearer '+process.env.SIRO_FINANCIAL_WORKER_SECRET+'x'])assert.equal((await POST(new Request('https://sirocash.example/api/internal/financial-worker',{method:'POST',headers:{authorization:value}}))).status,401);
  const invoke=()=>POST(new Request('https://sirocash.example/api/internal/financial-worker',{method:'POST',headers:{authorization:'Bearer '+process.env.SIRO_FINANCIAL_WORKER_SECRET}}));
  process.env.SIRO_OUTBOX_WORKER_ENABLED='false';process.env.VERCEL_ENV='production';
  const disabled=await invoke();assert.equal(disabled.status,503);assert.equal(disabled.headers.get('cache-control'),'no-store');
  process.env.SIRO_OUTBOX_WORKER_ENABLED='true';delete process.env.FINANCIAL_DATABASE_URL;
  assert.equal((await invoke()).status,503);
  console.log('Financial scheduler route: constant-time credential gate, disabled-production and missing dedicated DB fail closed; no DB access or effects.');
 }finally{for(const k of keys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k]}}
}
main().catch(error=>{console.error(error);process.exitCode=1});
