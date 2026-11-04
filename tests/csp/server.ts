/** Test only. Real production proxy CSP + real reader, isolated synthetic JSON. */
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WalletTransactionFeed} from '../../components/wallet-transaction-feed';
import {AccountNavigation} from '../../components/account-navigation';
import {ExchangeTickerView} from '../../components/exchange-ticker';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {NextRequest} from 'next/server';
import {proxy} from '../../proxy';
import {STATIC_EXCHANGE_URL} from '../../lib/static-exchange-location';
async function main(){
 const bundle=await build({entryPoints:['tests/csp/entry.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
 const tickerCSS=await readFile('app/exchange-ticker.css','utf8');
 const layoutSource=await readFile('app/layout.tsx','utf8');const styles=await Promise.all([...layoutSource.matchAll(/import '\.\/(.*?\.css)';/g)].map(match=>readFile('app/'+match[1],'utf8')));
 const server=createServer((request,response)=>{
  if(request.url==='/precision.css'){response.writeHead(200,{'Content-Type':'text/css'});response.end(styles.join('\n'));return}
  if(request.url?.startsWith('/precision-')){
   const ar=request.url.includes('rtl'),id=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
   const status={enabled:true,userId:'synthetic-owner',activity:[{id:id(1),type:'P2P',amount:'-100000.123456',status:'COMPLETED',createdAt:'2026-11-05T00:10:00Z',senderName:'TEST SENDER',senderUid:'1234567897',recipientName:'TEST RECIPIENT',recipientUid:'1234567897'},{id:id(2),type:'DEPOSIT',amount:'1.000001',status:'COMPLETED',network:'TRC20',createdAt:'2026-11-04T23:00:00Z'}]};
   const content=renderToStaticMarkup(React.createElement('div',{className:'site-shell account-workspace mobile-wallet wallet-view-activity'},React.createElement(AccountNavigation,{active:'/activity',ar}),React.createElement('main',{className:'mobile-wallet-main'},React.createElement('p',null,'ISOLATED SYNTHETIC UI FIXTURE — NOT A WALLET'),React.createElement(WalletTransactionFeed,{status,ar}))));
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(`<!doctype html><html dir="${ar?'rtl':'ltr'}" lang="${ar?'ar':'en'}" data-theme="obsidian"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/precision.css"></head><body>${content}</body></html>`);return;
  }
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
