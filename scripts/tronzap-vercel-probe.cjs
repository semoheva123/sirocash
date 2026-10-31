// One-shot READ-ONLY build probe. Always fails closed BEFORE deployment/promotion.
// No purchases, RPC signatures, broadcasts, DB access or unsanitized response logs.
const {createHash}=require('node:crypto');
let phase='CONFIGURATION';
const decimal=v=>{const s=String(v);if(!/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(s))throw Error('FORMAT');return s};
async function call(path,payload){
 if(!['/v1/balance','/v1/calculate'].includes(path))throw Error('FORMAT');
 const token=process.env.TRONZAP_API_TOKEN,secret=process.env.TRONZAP_API_SECRET;
 if(!token||!secret||/[\r\n]/.test(token)||/[\r\n]/.test(secret))throw Error('CONFIGURATION');
 const body=JSON.stringify(payload);
 const r=await fetch('https://api.tronzap.com'+path,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token,'X-Signature':createHash('sha256').update(body+secret).digest('hex'),'Content-Type':'application/json'},body});
 if(!r.ok)throw Error(r.status===401||r.status===403?'AUTHENTICATION':'HTTP_'+r.status);
 const reader=r.body.getReader();let text='',size=0;const d=new TextDecoder();
 while(true){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>65536){await reader.cancel();throw Error('FORMAT')}text+=d.decode(c.value,{stream:true})}text+=d.decode();
 let j;try{j=JSON.parse(text)}catch{throw Error('FORMAT')}
 if(j.code!==0)throw Error(j.code===1?'AUTHENTICATION':'PROVIDER');
 if(!j.result||typeof j.result!=='object')throw Error('FORMAT');return j.result;
}
(async()=>{
 try{
  phase='BALANCE';const b=await call('/v1/balance',{});
  console.log('TRONZAP_PROBE_AUTH_OK BALANCE_TRX='+decimal(b.balance));
  phase='COST';const address='TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL';
  const q=await call('/v1/calculate',{address,amount:65000,duration:1,type:'energy'});
  if(q.address!==address||q.amount!==65000||q.duration!==1||q.type!=='energy')throw Error('FORMAT');
  const price=decimal(q.price),activation=decimal(q.activation_fee),total=decimal(q.total);
  const sun=s=>{const [w,f='']=s.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'))};
  if(sun(price)+sun(activation)!==sun(total))throw Error('FORMAT');
  console.log('TRONZAP_PROBE_COST_OK ENERGY=65000 HOURS=1 PRICE_TRX='+price+' ACTIVATION_TRX='+activation+' TOTAL_TRX='+total);
  console.log('TRONZAP_PROBE_SUCCESS NO_PURCHASE NO_BROADCAST');
 }catch(e){
  const msg=e&&typeof e.message==='string'&&/^(CONFIGURATION|AUTHENTICATION|HTTP_[0-9]{3}|PROVIDER|FORMAT)$/.test(e.message)?e.message:'TRANSPORT_OR_INTERNAL';
  console.log('TRONZAP_PROBE_FAILED PHASE='+phase+' REASON='+msg);
 }finally{
  console.log('TRONZAP_PROBE_INTENTIONAL_STOP_NO_DEPLOYMENT');process.exitCode=1;
 }
})();
