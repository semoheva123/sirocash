import assert from 'node:assert/strict';
import {depositMonitorFailureCode} from '../lib/deposit-monitor-diagnostics';
import {verifyDepositMonitorReadiness} from '../lib/deposit-monitor-readiness';
import type {WalletDb} from '../lib/wallet-engine';
import {POST} from '../app/api/internal/deposit-monitor/route';
import {depositOnlyForbiddenFlags} from '../lib/deposit-only-mode';
import {readFile} from 'node:fs/promises';
async function main(){
 assert.equal(depositMonitorFailureCode(new Error('RPC_TIMEOUT')),'RPC_TIMEOUT');
 for(const value of [new Error('https://provider.example/private-key'),new Error('RPC_TIMEOUT secret'),{message:'RPC_TIMEOUT'},'RPC_TIMEOUT'])assert.equal(depositMonitorFailureCode(value),'SCAN_FAILED');
 const keys=['SIRO_FINANCIAL_WORKER_SECRET','VERCEL_ENV','SIRO_OUTBOX_WORKER_ENABLED','SIRO_DEPOSIT_ONLY_ENABLED',...depositOnlyForbiddenFlags];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const k of keys)delete process.env[k];
  const call=(authorization='')=>POST(new Request('https://sirocash.example/api/internal/deposit-monitor',{method:'POST',headers:{authorization}}));
  assert.equal((await call()).status,401);
  process.env.SIRO_FINANCIAL_WORKER_SECRET='isolated-fixture-'.repeat(3);
  const token='Bearer '+process.env.SIRO_FINANCIAL_WORKER_SECRET;
  assert.equal((await call(token+'x')).status,401);assert.equal((await call(token)).status,503);
  process.env.VERCEL_ENV='production';process.env.SIRO_OUTBOX_WORKER_ENABLED='true';
  assert.equal((await call(token)).status,503);
  process.env.SIRO_DEPOSIT_ONLY_ENABLED='true';
  for(const flag of depositOnlyForbiddenFlags){process.env[flag]='true';const r=await call(token);assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');delete process.env[flag]}
  let opened=false;const db={transaction:async()=>{opened=true;throw Error('UNEXPECTED_DB')}} as unknown as WalletDb;
  await assert.rejects(()=>verifyDepositMonitorReadiness(db,{SIRO_DEPOSIT_ONLY_ENABLED:'true',SIRO_SIGNER_ENABLED:'true'}),/ISOLATION/);assert(!opened);
  await assert.rejects(()=>verifyDepositMonitorReadiness(db,{SIRO_DEPOSIT_ONLY_ENABLED:'true'}),/CONFIGURATION/);assert(!opened);
  const source=await readFile('app/api/internal/deposit-monitor/route.ts','utf8');
  assert(source.indexOf('assertDepositOnlyIsolation();')<source.indexOf('financialDatabase()).batch()'));
  assert(!source.includes('productionOutboxNetworkWorkers'));assert(!source.includes('request.json'));assert(!source.includes('GET('));
  const runtime=await readFile('lib/deposit-only-runtime.ts','utf8');assert(runtime.includes('bep20Window:Number(window)'));assert(runtime.includes('Number(window)>1000'));
  console.log('Deposit monitor route PASS: authenticated production gate, all external flags rejected before DB, dedicated deposit-only composition and bounded configured scan window. No live DB or financial effects.');
 }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
