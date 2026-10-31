import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observeUsdtUsdPrice} from '../lib/financial-price';
import {customerFinancialHttp} from '../lib/customer-financial-http';
async function main(){
 const price=await observeUsdtUsdPrice(async(url,options)=>{assert.equal(url,'https://api.coinbase.com/v2/prices/USDT-USD/spot');assert.equal(options?.redirect,'error');return new Response(JSON.stringify({data:{base:'USDT',currency:'USD',amount:'0.998123999'}}))});
 assert.equal(price.rate,998123n);assert.match(price.evidenceHash,/^[a-f0-9]{64}$/);
 for(const data of [{base:'USDC',currency:'USD',amount:'1'},{base:'USDT',currency:'EUR',amount:'1'},{base:'USDT',currency:'USD',amount:'1e0'},{base:'USDT',currency:'USD',amount:'0'},{base:'USDT',currency:'USD',amount:1}])await assert.rejects(()=>observeUsdtUsdPrice(async()=>new Response(JSON.stringify({data}))));
 await assert.rejects(()=>observeUsdtUsdPrice(async()=>new Response('x'.repeat(8193))),/TOO_LARGE/);
 await assert.rejects(()=>observeUsdtUsdPrice(async()=>new Response('',{status:302})),/UNAVAILABLE/);
 // Timeout must be real even when a custom transport ignores AbortSignal.
 let cancelled=false;const started=Date.now();
 await Promise.all([
  assert.rejects(()=>observeUsdtUsdPrice(async()=>new Promise<Response>(()=>{})),/TIMEOUT/),
  assert.rejects(()=>observeUsdtUsdPrice(async()=>new Response(new ReadableStream({cancel(){cancelled=true}}))),/TIMEOUT/),
 ]);
 assert(cancelled);assert(Date.now()-started<15000);
 // Public endpoints cannot reach authentication, pricing, ledger or custody while disabled.
 const old={NODE_ENV:process.env.NODE_ENV,WEBAUTHN_ORIGIN:process.env.WEBAUTHN_ORIGIN,SIRO_CUSTOMER_FINANCE_ENABLED:process.env.SIRO_CUSTOMER_FINANCE_ENABLED};
 try{
  Object.assign(process.env,{NODE_ENV:'production',WEBAUTHN_ORIGIN:'https://sirocash.example',SIRO_CUSTOMER_FINANCE_ENABLED:'false'});
  for(const action of ['PREPARE','TRANSFER','WITHDRAWAL'] as const){
   const response=await customerFinancialHttp(new Request('https://sirocash.example/api/financial/prepare',{method:'POST',headers:{origin:'https://sirocash.example'},body:JSON.stringify({ownerId:'attacker',amount:'999',rate:'1'})}),action);
   assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal((await customerFinancialHttp(new Request('https://sirocash.example/api/financial/prepare',{method:'POST',headers:{origin:'https://evil.example'}}),'PREPARE')).status,400);
 }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
 const ui=await readFile('components/customer-payments.tsx','utf8');
 assert(ui.includes('authorizePayment(prepared.path,prepared.payload)'));assert(ui.includes('quoteId:prepared.id'));
 assert(!ui.includes('verifyDemoPin'));assert(!ui.includes('123456'));assert(ui.includes('Preserve exact request/quote for retry'));assert(ui.includes('if(attempted&&!submitted)return'));assert(ui.includes('setAttempted(true)'));
 console.log('Customer finance boundaries PASS: fixed bounded non-peg price source, decimal floor, token/currency/size/redirect rejection, fail-closed HTTP gates, no demo PIN and quote-bound device approval UI.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
