/** Test only. Real production proxy CSP + real reader, isolated synthetic JSON. */
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ExchangeTickerView} from '../../components/exchange-ticker';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {NextRequest} from 'next/server';
import {proxy} from '../../proxy';
import {STATIC_EXCHANGE_URL} from '../../lib/static-exchange-location';
async function main(){
 const bundle=await build({entryPoints:['tests/csp/entry.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
 const tickerCSS=await readFile('app/exchange-ticker.css','utf8');
 const server=createServer((request,response)=>{
  if(request.url==='/ticker.css'){response.writeHead(200,{'Content-Type':'text/css'});response.end(tickerCSS);return}
  if(request.url?.startsWith('/motion')){const now=Date.now(),ar=request.url.includes('rtl');const ticker=renderToStaticMarkup(React.createElement(ExchangeTickerView,{ar,now,snapshot:{source:'sp-today',city:'syria-general',unit:'SYP_NEW',observation:'public-page',market:{buy:144,sell:144.5},fx:[{pair:'EUR/USD',rate:1.12}],fetchedAt:new Date(now).toISOString()}}));response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':proxy(new NextRequest('https://www.sirocash.online/wallet')).headers.get('content-security-policy')!});response.end(`<!doctype html><html dir="${ar?'rtl':'ltr'}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ticker.css"></head><body><p>SYNTHETIC MOTION FIXTURE ONLY</p>${ticker}</body></html>`);return}
  if(request.url==='/reader.js'){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(bundle.outputFiles[0].text);return}
  if(request.url==='/health'){response.writeHead(200,{'Content-Type':'application/json'});response.end('{"ok":true}');return}
  const headers=proxy(new NextRequest('https://www.sirocash.online/wallet')).headers;
  let policy=headers.get('content-security-policy')!;
  if(request.url==='/before')policy=policy.replace(`connect-src 'self' ${STATIC_EXCHANGE_URL}`,"connect-src 'self'");
  const nonce=policy.match(/'nonce-([^']+)'/)![1];
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':policy,'Cache-Control':'no-store'});
  response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Local CSP fixture only</title></head><body><p>ISOLATED TEST DATA ONLY</p><output id="status">loading</output><button id="control">Local control</button><output id="result"></output><script type="module" nonce="${nonce}" src="/reader.js"></script></body></html>`);
 });
 server.listen(0,'0.0.0.0',()=>{const address=server.address();if(address&&typeof address!=='string')console.log(`CSP_TEST_PORT=${address.port}`)});
}
void main();
