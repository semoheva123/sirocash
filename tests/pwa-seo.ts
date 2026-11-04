import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import vm from 'node:vm';
import manifest from '../app/manifest';
import robots from '../app/robots';
import sitemap from '../app/sitemap';
async function main(){
const m=manifest();assert.equal(m.display,'standalone');assert.equal(m.start_url,'/dashboard');assert.equal(m.scope,'/');assert(m.icons?.some(i=>i.purpose==='maskable'));
for(const icon of m.icons??[])assert((await stat('public'+icon.src)).size>100);
const entries=sitemap();assert(entries.some(e=>e.url==='https://www.sirocash.online/en'));assert(!entries.some(e=>/dashboard|wallet|transactions|api\/|auth|settings/.test(e.url)));
const rules=robots().rules as {disallow:string[]}[];assert(rules[0].disallow.includes('/api/'));assert(rules[0].disallow.includes('/transactions/'));
const script=await readFile('public/sw.js','utf8'),handlers:Record<string,Function>={},shown:{title:string;data:any}[]=[],opened:string[]=[];
const self={addEventListener:(name:string,fn:Function)=>handlers[name]=fn,skipWaiting:()=>{},location:{origin:'https://www.sirocash.online'},registration:{showNotification:async(title:string,data:unknown)=>shown.push({title,data})},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async(url:string)=>opened.push(url)}};
vm.runInNewContext(script,{self,URL});assert(!handlers.fetch,'No account/offline caching');
let pending:Promise<unknown>=Promise.resolve();handlers.push({data:{json:()=>({body:'Generic fixture',url:'https://evil.test/',tag:'fixture'})},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;assert.equal(shown[0].data.data.url,'/notifications');
handlers.notificationclick({notification:{close:()=>{},data:{url:'https://evil.test/'}},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;assert.equal(opened[0],'https://www.sirocash.online/notifications');
const proxy=await readFile('proxy.ts','utf8');assert(proxy.includes('X-Robots-Tag'));assert(proxy.includes('x-siro-pathname'));assert((await readFile('app/layout.tsx','utf8')).includes('application/ld+json'));
console.log('PWA/SEO PASS: install manifest/icons, no account cache, safe push click target, public-only sitemap, private crawler exclusions and nonce-ready structured data. No indexing/ranking or physical-device delivery claims.');

}
main().catch(e=>{console.error(e);process.exitCode=1});
