import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import sharp from 'sharp';
import {iosStartupDevices,iosStartupImages,startupImageFile,startupImageMedia} from '../lib/ios-startup-images';
/** Every declared iOS launch screen exists at the exact pixel size its media query promises; the root layout declares them. */
async function main(){
 const layout=await readFile('app/layout.tsx','utf8');assert(layout.includes('startupImage:iosStartupImages()'),'root metadata must declare the launch screens');
 assert(layout.includes('<meta name="apple-mobile-web-app-capable" content="yes"/>'),'iOS ignores apple-touch-startup-image unless the Apple-prefixed capable tag is present; Next only emits mobile-web-app-capable (vercel/next.js#74524)');
 const entries=iosStartupImages();assert.equal(entries.length,iosStartupDevices.length*2,'portrait and landscape per device class');
 assert.equal(new Set(entries.map(e=>e.media)).size,entries.length,'media queries must be unique or iOS picks the wrong screen');
 for(const d of iosStartupDevices)for(const o of ['portrait','landscape'] as const){
  const file=startupImageFile(d,o),media=startupImageMedia(d,o);
  assert.match(media,/^\(device-width: \d+px\) and \(device-height: \d+px\) and \(-webkit-device-pixel-ratio: [23]\) and \(orientation: (portrait|landscape)\)$/);
  const meta=await sharp('public'+file).metadata();
  const w=(o==='portrait'?d.width:d.height)*d.ratio,h=(o==='portrait'?d.height:d.width)*d.ratio;
  assert.equal(meta.width,w,file);assert.equal(meta.height,h,file);assert.equal(meta.format,'png');
  assert((await stat('public'+file)).size<200*1024,file+' must stay small for the first paint');
 }
 const source=await readFile('scripts/generate-ios-startup-images.ts','utf8');
 assert(source.includes('#007A3D')&&source.includes('#CE1126')&&source.includes('[0.27,0.5,0.73]'),'Syrian flag: green/white/black with three red stars');
 assert(!source.includes('fetch('),'generator is offline');
 console.log(`iOS launch screens PASS: ${entries.length} declared screens, unique exact-match media queries, every PNG present at the promised pixel size and under 200 KB, flag composition, offline generator.`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
