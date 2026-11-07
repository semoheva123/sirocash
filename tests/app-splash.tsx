import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
/** Installed-app launch screen: first-paint markup, standalone-only, time-bounded, decorative, reduced-motion safe. */
async function main(){
 const css=await readFile('app/splash.css','utf8'),layout=await readFile('app/layout.tsx','utf8'),source=await readFile('components/app-splash.tsx','utf8');
 assert(layout.indexOf('<AppSplash/>')<layout.indexOf('{children}'),'launch screen must be part of the very first paint, before the route tree');
 assert(layout.includes("import './splash.css'"));
 assert(css.includes('.siro-splash { display: none; }')&&css.includes('@media (display-mode: standalone)'),'hidden in browser tabs, shown only for the installed app');
 assert(css.includes('siro-splash-expire')&&css.includes('prefers-reduced-motion: reduce'),'CSS-only expiry and reduced-motion rules are mandatory');
 assert(!source.includes('fetch(')&&!source.includes('requestAnimationFrame')&&!source.includes('localStorage'),'decorative only: no network, no frame loop, no storage');
 assert(source.includes('#007A3D')&&source.includes('#CE1126')&&source.includes('[26,48,70]'),'green/white/black bands with three red stars');
 const {renderToStaticMarkup}=await import('react-dom/server'),{AppSplash}=await import('../components/app-splash');
 const html=renderToStaticMarkup(<AppSplash/>);
 assert(html.includes('class="siro-splash"')&&html.includes('data-phase="visible"')&&html.includes('Siro</span>Cash')&&html.includes('سيرو كاش'),'server markup carries the brand, not account data');
 assert.equal((html.match(/<polygon/g)||[]).length,3,'exactly three stars');
 const run=async(standalone:boolean)=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.test/dashboard',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,self:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  dom.window.matchMedia=((query:string)=>({matches:standalone&&query.includes('display-mode'),media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},onchange:null,dispatchEvent:()=>false})) as typeof window.matchMedia;
  const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);
  await act(async()=>root.render(<AppSplash/>));
  const present=()=>document.querySelector('.siro-splash')!==null;
  if(!standalone){assert.equal(present(),false,'browser tab: removed immediately after hydration');await act(async()=>root.unmount());return}
  assert(present(),'standalone: visible right after hydration');
  await act(async()=>{await new Promise(r=>setTimeout(r,250))});assert(present(),'stays for the minimum brand moment');
  await act(async()=>{await new Promise(r=>setTimeout(r,650))});assert.equal(document.querySelector('.siro-splash')?.getAttribute('data-phase'),'leaving','fades once loaded and the minimum time elapsed');
  await act(async()=>{await new Promise(r=>setTimeout(r,500))});assert.equal(present(),false,'removed from the DOM after the fade');
  await act(async()=>root.unmount());
 };
 await run(false);await run(true);
 console.log('App launch screen PASS: first-paint markup before the route tree, standalone-only, three-star flag, minimum then bounded visibility, removed from DOM, no network/frame loop/storage, reduced-motion and CSS-only expiry rules.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
