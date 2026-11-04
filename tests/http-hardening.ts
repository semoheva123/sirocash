import {STATIC_EXCHANGE_URL} from '../lib/static-exchange-location';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {readJson} from '../lib/request-body';
import {proxy} from '../proxy';
async function main(){
 assert.deepEqual(await readJson(new Request('http://test',{method:'POST',body:'{"ok":true}'})),{ok:true});
 await assert.rejects(()=>readJson(new Request('http://test',{method:'POST',body:'x'.repeat(17000)})),SyntaxError);
 await assert.rejects(()=>readJson(new Request('http://test',{method:'POST',body:'{}',headers:{'content-length':'20000'}})),SyntaxError);
 const streaming=new Request('http://test',{method:'POST',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(9000));c.enqueue(new Uint8Array(9000));c.close()}}),duplex:'half'} as RequestInit);
 await assert.rejects(()=>readJson(streaming),SyntaxError);
 const stalled=new Request('http://test',{method:'POST',body:new ReadableStream(),duplex:'half'} as RequestInit);
 await assert.rejects(()=>readJson(stalled,16384,10),SyntaxError);
 for(const body of ['{','{"x":','null bad'])await assert.rejects(()=>readJson(new Request('http://test',{method:'POST',body})),SyntaxError);
 const old=process.env.VERCEL_ENV;
 try{
  process.env.VERCEL_ENV='production';
  const response=proxy(new NextRequest('https://wallet.example/auth'));
  const csp=response.headers.get('content-security-policy')!;
  assert.equal(csp.split('; ').find(part=>part.startsWith('connect-src ')),`connect-src 'self' ${STATIC_EXCHANGE_URL}`);
  assert(!csp.includes('*.github.io'));assert(!csp.includes('connect-src *'));
  assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/object-src 'none'/);assert.match(csp,/script-src .*'nonce-/);
  assert.equal(response.headers.get('x-frame-options'),'DENY');assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000');
  assert.equal(response.headers.get('x-middleware-request-content-security-policy'),csp);
  assert.notEqual(proxy(new NextRequest('https://wallet.example/auth')).headers.get('content-security-policy'),csp);
  process.env.VERCEL_ENV='preview';const preview=proxy(new NextRequest('https://preview.example/auth'));
  assert.equal(preview.headers.get('x-frame-options'),null);assert.ok(!preview.headers.get('content-security-policy')!.includes('frame-ancestors'));
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old}
 console.log('HTTP hardening: bounded/chunked/timed JSON, production frame/HSTS policy, per-request CSP nonce forwarding and embeddable preview passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
