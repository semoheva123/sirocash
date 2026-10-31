import {useId} from 'react';

/** Original ornamental ribbon: not a market chart, payment card or financial proof. */
export function BrandSculpture({className=''}:{className?:string}){
 const id=useId().replace(/:/g,'');
 return <svg className={'brand-sculpture '+className} viewBox="0 0 600 600" fill="none" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id={id+'-edge'} x1="100" y1="70" x2="480" y2="530" gradientUnits="userSpaceOnUse"><stop stopColor="#fbfdff"/><stop offset=".24" stopColor="#b9c9ed"/><stop offset=".48" stopColor="#f5f9ff"/><stop offset=".69" stopColor="#5779c5"/><stop offset=".87" stopColor="#d3e2fb"/><stop offset="1" stopColor="#8ea9dc"/></linearGradient>
   <linearGradient id={id+'-face'} x1="150" y1="70" x2="400" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor="#fff"/><stop offset=".35" stopColor="#dfeaff"/><stop offset=".62" stopColor="#91afe8"/><stop offset="1" stopColor="#f0f5ff"/></linearGradient>
   <linearGradient id={id+'-inner'} x1="200" y1="150" x2="440" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#1c3b77"/><stop offset=".42" stopColor="#7b9ad9"/><stop offset="1" stopColor="#cadcf9"/></linearGradient>
  </defs>
  <path d="M160 95C237 31 373 35 443 117C512 197 478 282 405 337L272 437C213 481 192 519 207 560C134 532 101 465 124 404C144 351 196 319 252 276L358 196C406 160 380 117 336 117C296 117 269 141 237 168L160 230C111 197 113 137 160 95Z" fill={'url(#'+id+'-edge)'}/>
  <path d="M184 79C263 32 384 60 426 126C463 185 438 236 379 281L231 393C177 435 153 487 178 538C113 498 105 443 135 394C164 346 209 319 267 274L361 202C403 170 395 120 349 105C304 91 276 114 235 147L151 215C126 174 139 115 184 79Z" fill={'url(#'+id+'-face)'}/>
  <path d="M425 126C460 184 434 235 376 280L230 392C178 433 155 479 178 538C165 501 184 449 246 402L394 290C458 241 480 180 425 126Z" fill={'url(#'+id+'-inner)'}/>
  <path d="M160 95C237 31 373 35 443 117M151 215L235 147C276 114 304 91 349 105" stroke="#fff" strokeOpacity=".85" strokeWidth="1.5"/>
  <path d="M135 394C164 346 209 319 267 274L361 202" stroke="#fff" strokeOpacity=".55" strokeWidth="1.5"/>
 </svg>;
}
