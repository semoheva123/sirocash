import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
/** One accent system for the private app: champagne on charcoal, silver secondary. No cyan/violet remnants,
 *  the token layer loads last, reduced-motion/transparency fallbacks exist, and the launch assets share the mark colour. */
async function main(){
 const layout=await readFile('app/layout.tsx','utf8');
 const imports=[...layout.matchAll(/import '\.\/([\w-]+\.css)';/g)].map(m=>m[1]);
 assert.equal(imports.at(-1),'luxury-system.css','token layer must be the last stylesheet');
 const lux=await readFile('app/luxury-system.css','utf8');
 for(const token of ['--lux-accent:#D6C5A2','--lux-accent-ink:#171511','--lux-silver:#C7C9D1','--lux-canvas:#0B0B0F','prefers-reduced-motion:no-preference','prefers-reduced-transparency:reduce'])assert(lux.includes(token),token);
 assert(!/linear-gradient\([^)]*(#[0-9a-f]{6}[^)]*){3,}/i.test(lux),'no multi-stop loud gradients');
 for(const file of ['app/obsidian.css','app/deposit.css','app/mobile-wallet.css','app/wallet-premium.css','app/wallet-luxury.css','app/splash.css','app/luxury-system.css']){
  const css=await readFile(file,'utf8');
  assert(!/#(67e8f9|22d3ee|a5f3fc|8b5cf6|a78bfa|c4b5fd|06b6d4|0891b2)/i.test(css),file+': cyan/violet accents must not remain');
 }
 // Lists stay lists: no card-in-card on the home feed/ledger, and transfer parties are not boxed surfaces.
 assert(!/\.receipt-money-details,\.transfer-parties\)/.test(lux),'transfer parties must not be in the surface list');
 assert(lux.includes(':is(.mobile-recent,.wallet-feed-ledger) .wallet-transaction-card{background:transparent;border:0;box-shadow:none'),'home recent/ledger rows are flat');
 assert(lux.includes('.wallet-transaction-parties .transfer-parties{margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr'),'parties render as an aligned two-column line');
 const generator=await readFile('scripts/generate-ios-startup-images.ts','utf8');
 assert(generator.includes('#E6D9BE')&&!/#a5f3fc/i.test(generator),'launch screens use the champagne wordmark');
 assert((await readFile('app/splash.css','utf8')).includes('color: #E6D9BE'),'in-page splash wordmark matches');
 console.log('Luxury system PASS: last-loaded token layer, champagne/silver accents only, no cyan/violet remnants, no loud gradients, reduced-motion/transparency fallbacks, launch assets aligned.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
