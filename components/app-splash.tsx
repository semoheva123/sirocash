'use client';
import {useEffect,useState} from 'react';
/** Shortest time the launch screen stays visible once painted, so it reads as a deliberate brand moment rather than a flicker. */
const minimumVisibleMs=700;
/** Hard upper bound: if the window never reports `load` (slow network), the screen still gets out of the way. */
const maximumVisibleMs=3200;
/** Launch screen shown on every cold load — browser tabs and the installed app alike (see `app/splash.css`).
 *  Server-rendered so it is part of the very first paint; a client effect removes it once the document has loaded.
 *  Decorative only: no account data, no network, no frame loop; a CSS-only expiry hides it even if hydration never happens. */
export function AppSplash(){
 const [phase,setPhase]=useState<'visible'|'leaving'|'gone'>('visible');
 useEffect(()=>{
  const shown=performance.now();let leave:ReturnType<typeof setTimeout>|undefined,remove:ReturnType<typeof setTimeout>|undefined;
  const dismiss=()=>{const wait=Math.max(0,minimumVisibleMs-(performance.now()-shown));leave=setTimeout(()=>{setPhase('leaving');remove=setTimeout(()=>setPhase('gone'),window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:420)},wait)};
  const cap=setTimeout(dismiss,maximumVisibleMs);
  if(document.readyState==='complete')dismiss();else window.addEventListener('load',dismiss,{once:true});
  return()=>{window.removeEventListener('load',dismiss);clearTimeout(cap);if(leave)clearTimeout(leave);if(remove)clearTimeout(remove)};
 },[]);
 if(phase==='gone')return null;
 return <div className="siro-splash" data-phase={phase} role="status" aria-live="polite" aria-label="SiroCash">
  <div className="siro-splash-stage">
   <svg className="siro-splash-flag" viewBox="0 0 96 64" aria-hidden="true" focusable="false">
    <defs>
     <clipPath id="siro-splash-flag-clip"><rect width="96" height="64" rx="9"/></clipPath>
     <linearGradient id="siro-splash-flag-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22"/><stop offset=".45" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".18"/></linearGradient>
    </defs>
    <g clipPath="url(#siro-splash-flag-clip)">
     {/* Flag of Syria: green, white and black bands with three red five-pointed stars in the white band. */}
     <rect width="96" height="21.34" fill="#007A3D"/><rect y="21.33" width="96" height="21.34" fill="#FFFFFF"/><rect y="42.66" width="96" height="21.34" fill="#000000"/>
     {[26,48,70].map(cx=><polygon key={cx} fill="#CE1126" points={star(cx,32,5.8)}/>)}
     <rect width="96" height="64" fill="url(#siro-splash-flag-sheen)"/>
    </g>
    <rect width="95" height="63" x=".5" y=".5" rx="8.5" fill="none" stroke="#ffffff" strokeOpacity=".16"/>
   </svg>
   <p className="siro-splash-wordmark" dir="ltr"><span>Siro</span>Cash</p>
   <p className="siro-splash-arabic" dir="rtl" lang="ar">سيرو كاش</p>
   <div className="siro-splash-line" aria-hidden="true"><i/></div>
  </div>
  <p className="siro-splash-foot" dir="rtl" lang="ar">محفظة رقمية · Digital wallet</p>
 </div>;
}
function star(cx:number,cy:number,r:number){
 const inner=r*0.382,points:string[]=[];
 for(let i=0;i<10;i++){const radius=i%2?inner:r,angle=-Math.PI/2+i*Math.PI/5;points.push((cx+radius*Math.cos(angle)).toFixed(2)+','+(cy+radius*Math.sin(angle)).toFixed(2))}
 return points.join(' ');
}
