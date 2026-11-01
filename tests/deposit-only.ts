import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {depositOnlyMode,depositOnlyConfiguration,assertDepositOnlyIsolation,depositOnlyForbiddenFlags} from '../lib/deposit-only-mode';
import {customerFinanceEnabled,customerWithdrawalsEnabled,customerDepositsEnabled,customerFinancialHttp} from '../lib/customer-financial-http';
async function main(){
 const env:Record<string,string>={SIRO_DEPOSIT_ONLY_ENABLED:'true',VERCEL_ENV:'production',SIRO_PRICING_PROVIDER:'coinbase-spot-v1',SIRO_TRON_GENESIS_ID:'0'.repeat(16)+'1'.repeat(48)};
 for(const key of ['SIRO_CUSTOMER_DEPOSITS_ENABLED','SIRO_DEPOSIT_DISCOVERY_ENABLED','SIRO_DEPOSIT_VALUATION_ENABLED','SIRO_RPC_READ_ENABLED','SIRO_OUTBOX_WORKER_ENABLED'])env[key]='true';
 for(const network of ['TRC20','BEP20']){env[`SIRO_${network}_DEPOSIT_VAULT_ID`]='11111111-2222-4333-8444-555555555555';env[`SIRO_${network}_MAX_TOKEN_BASE_UNITS`]='1000000'}
 assert.equal(depositOnlyMode({}),false);assert.equal(depositOnlyConfiguration(env).configurationReady,true);
 for(const key of depositOnlyForbiddenFlags){assert.throws(()=>assertDepositOnlyIsolation({...env,[key]:'true'}),/ISOLATION/);assert.equal(depositOnlyConfiguration({...env,[key]:'true'}).configurationReady,false)}
 for(const key of Object.keys(env))assert.equal(depositOnlyConfiguration({...env,[key]:undefined}).configurationReady,false,key);
 const original={...process.env};
 try{
  Object.assign(process.env,env);for(const key of depositOnlyForbiddenFlags)delete process.env[key];
  process.env.SIRO_CUSTOMER_FINANCE_ENABLED='true';process.env.SIRO_DURABLE_PASSKEY_ENABLED='true';
  assert.equal(customerDepositsEnabled(),true);assert.equal(customerFinanceEnabled(),false);assert.equal(customerWithdrawalsEnabled(),false);
  for(const action of ['PREPARE','TRANSFER','WITHDRAWAL'] as const){const r=await customerFinancialHttp(new Request('https://sirocash.vercel.app/api/financial/transfer',{method:'POST',headers:{origin:'https://sirocash.vercel.app','content-type':'application/json'},body:'{}'}),action);assert.equal(r.status,503)}
 }finally{for(const k of Object.keys(process.env))if(!(k in original))delete process.env[k];Object.assign(process.env,original)}
 const runtime=await readFile('lib/deposit-only-runtime.ts','utf8');
 for(const forbidden of ['productionChainBroadcaster','createFinancialPreparation','catFee','signSweep','createNativeGasWorker'])assert(!runtime.includes(forbidden));
 assert(runtime.includes('depositOnly:true'));assert(runtime.includes("createNetworkDepositScanner"));assert(runtime.includes("job.kind!=='DEPOSIT_VALUE'"));
 const full=await readFile('lib/outbox-network-runtime.ts','utf8');assert(full.indexOf('if(depositOnlyMode())')<full.indexOf('const dispatchEnabled='));
 console.log('Deposit-only PASS: independent readiness, unsafe flags denied, all customer debits blocked, scanner/valuation composition only; no I/O, keys, payments or activation.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
