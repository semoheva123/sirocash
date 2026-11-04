import {createStaticExchangeReader} from '../../lib/static-exchange-client';
const status=document.getElementById('status')!;
const reader=createStaticExchangeReader({active:()=>true,data:snapshot=>{status.textContent=`ready:${snapshot.market.buy}`},unavailable:()=>{status.textContent='unavailable'}});
reader.wake();
window.addEventListener('pagehide',()=>reader.stop(),{once:true});
document.getElementById('control')!.addEventListener('click',()=>{document.getElementById('result')!.textContent='responsive'});
