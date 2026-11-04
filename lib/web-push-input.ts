import {z} from 'zod';
export function pushEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(
  u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname)
 )}catch{return false}
}
const key=(bytes:number)=>z.string().regex(/^[A-Za-z0-9_-]+$/).refine(v=>Buffer.from(v,'base64url').length===bytes);
export const pushSubscriptionInput=z.object({endpoint:z.string().max(2048).refine(pushEndpoint),keys:z.object({p256dh:key(65).refine(v=>Buffer.from(v,'base64url')[0]===4),auth:key(16)}).strict(),language:z.enum(['ar','en'])}).strict();
