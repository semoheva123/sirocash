/** Renders the iOS launch screens (public/splash/ios/*.png) from one vector composition:
 *  obsidian background, the SiroCash transfer glyph in a rounded tile, the wordmark and the Syrian flag.
 *  Run once after changing the composition or the device table: `npx tsx scripts/generate-ios-startup-images.ts`.
 *  Outputs are committed; nothing here runs at build or request time. */
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {iosStartupDevices,startupImageFile} from '../lib/ios-startup-images';

const star=(cx:number,cy:number,r:number)=>{const inner=r*0.382,pts:string[]=[];for(let i=0;i<10;i++){const rad=i%2?inner:r,a=-Math.PI/2+i*Math.PI/5;pts.push((cx+rad*Math.cos(a)).toFixed(2)+','+(cy+rad*Math.sin(a)).toFixed(2))}return pts.join(' ')};

export function launchScreenSvg(w:number,h:number){
 const L=Math.min(w,h);                         // composition scales with the short edge, so portrait and landscape match
 const tile=Math.round(L*0.27),tileR=Math.round(tile*0.24),stroke=Math.max(2,tile*0.085);
 const cx=w/2,cy=h*0.44;
 const tileX=cx-tile/2,tileY=cy-tile*0.78;
 // Transfer glyph (two opposing arrows), matching /icons/icon-512.png.
 const gx=tileX+tile*0.27,gw=tile*0.46,y1=tileY+tile*0.38,y2=tileY+tile*0.62,head=tile*0.11;
 const glyph=`<g fill="none" stroke="#FFFFFF" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
  <path d="M${gx} ${y1}H${gx+gw}M${gx+gw-head} ${y1-head}L${gx+gw} ${y1}L${gx+gw-head} ${y1+head}"/>
  <path d="M${gx+gw} ${y2}H${gx}M${gx+head} ${y2-head}L${gx} ${y2}L${gx+head} ${y2+head}"/></g>`;
 const wordSize=Math.round(L*0.085),wordY=tileY+tile+L*0.1;
 const flagW=Math.round(L*0.15),flagH=Math.round(flagW*2/3),flagX=cx-flagW/2,flagY=wordY+L*0.055,flagR=Math.round(flagW*0.09),band=flagH/3,sr=band*0.27;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
 <defs>
  <radialGradient id="glow" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#1b1c25"/><stop offset="1" stop-color="#0B0B0F"/></radialGradient>
  <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1c24"/><stop offset="1" stop-color="#101014"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
  <clipPath id="flag"><rect x="${flagX}" y="${flagY}" width="${flagW}" height="${flagH}" rx="${flagR}"/></clipPath>
 </defs>
 <rect width="${w}" height="${h}" fill="url(#glow)"/>
 <rect x="${tileX}" y="${tileY}" width="${tile}" height="${tile}" rx="${tileR}" fill="url(#tile)" stroke="#FFFFFF" stroke-opacity=".12" stroke-width="${Math.max(1,L*0.003)}"/>
 ${glyph}
 <text x="${cx}" y="${wordY}" text-anchor="middle" font-family="Manrope, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-weight="700" font-size="${wordSize}" fill="#F4F4F5" letter-spacing="${wordSize*0.01}"><tspan fill="#A5F3FC">Siro</tspan>Cash</text>
 <g clip-path="url(#flag)">
  <rect x="${flagX}" y="${flagY}" width="${flagW}" height="${band+0.5}" fill="#007A3D"/>
  <rect x="${flagX}" y="${flagY+band}" width="${flagW}" height="${band+0.5}" fill="#FFFFFF"/>
  <rect x="${flagX}" y="${flagY+2*band}" width="${flagW}" height="${band+0.5}" fill="#000000"/>
  ${[0.27,0.5,0.73].map(f=>`<polygon fill="#CE1126" points="${star(flagX+flagW*f,flagY+band*1.5,sr)}"/>`).join('')}
  <rect x="${flagX}" y="${flagY}" width="${flagW}" height="${flagH}" fill="url(#sheen)"/>
 </g>
 <rect x="${flagX+0.5}" y="${flagY+0.5}" width="${flagW-1}" height="${flagH-1}" rx="${flagR}" fill="none" stroke="#FFFFFF" stroke-opacity=".16"/>
</svg>`;
}

async function main(){
 await mkdir('public/splash/ios',{recursive:true});
 const sizes=new Map<string,[number,number]>();
 for(const d of iosStartupDevices)for(const o of ['portrait','landscape'] as const){const w=(o==='portrait'?d.width:d.height)*d.ratio,h=(o==='portrait'?d.height:d.width)*d.ratio;sizes.set(startupImageFile(d,o),[w,h])}
 for(const [file,[w,h]] of sizes){
  const png=await sharp(Buffer.from(launchScreenSvg(w,h)),{density:72}).png({compressionLevel:9,palette:true,quality:90}).toBuffer();
  await writeFile('public'+file,png);console.log(file,w+'x'+h,(png.length/1024).toFixed(0)+' KB');
 }
 console.log(sizes.size,'launch screens written');
}
if(process.argv[1]&&/generate-ios-startup-images/.test(process.argv[1]))main().catch(e=>{console.error(e);process.exitCode=1});
