import 'server-only';
import {Resend} from 'resend';
import {database} from './database';
import {deliverSecurityNotifications} from './security-events';
export async function flushSecurityMail(){
 if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return {processed:0,delivered:0};
 const resend=new Resend(process.env.RESEND_API_KEY);
 return deliverSecurityNotifications(database(),async(to,message,id)=>{
  const {error}=await resend.emails.send({from:process.env.RESEND_FROM_EMAIL!,to,...message},{idempotencyKey:'security-event-'+id});
  if(error)throw Error('Security notification delivery unavailable');
 });
}
