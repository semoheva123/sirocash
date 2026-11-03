import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {operationsAllowed} from './operations-policy';
import type {PoolClient} from 'pg';
export const supportAdmin=(id:string)=>operationsAllowed(id,process.env.SUPPORT_ADMIN_IDS??process.env.OPERATIONS_ADMIN_IDS);
const body=z.string().trim().min(2).max(4000);
export const supportInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),subject:z.string().trim().min(4).max(120),category:z.enum(['ACCOUNT','DEPOSIT','TRANSFER','OTHER']),body,requestKey:z.string().uuid()}).strict(),
 z.object({action:z.literal('reply'),body,requestKey:z.string().uuid()}).strict(),
 z.object({action:z.literal('close')}).strict(),
]);
export class SupportError extends Error{constructor(public status:number){super('SUPPORT_UNAVAILABLE')}}
/** Transaction-scoped lock serializes replay and quota checks across tabs/workers. */
export async function writeSupport(c:Pick<PoolClient,'query'>,actor:string,admin:boolean,input:z.infer<typeof supportInput>,ticketId?:string){
 await c.query('INSERT INTO "SupportBudget"("userId",minute,"minuteCount",day,"dayCount") VALUES($1,date_trunc(\'minute\',now()),0,date_trunc(\'day\',now()),0) ON CONFLICT DO NOTHING',[actor]);
 await c.query('SELECT "userId" FROM "SupportBudget" WHERE "userId"=$1 FOR UPDATE',[actor]);
 if(input.action!=='close'){
  const {rows:[existing]}=await c.query('SELECT m."ticketId",m.body,t.subject,t.category,m."fromSupport" FROM "SupportMessage" m JOIN "SupportTicket" t ON t.id=m."ticketId" WHERE m."authorId"=$1 AND m."requestKey"=$2',[actor,input.requestKey]);
  if(existing){
   if(existing.body!==input.body||existing.fromSupport!==(input.action==='create'?false:admin)||(input.action==='reply'&&existing.ticketId!==ticketId)||(input.action==='create'&&(existing.subject!==input.subject||existing.category!==input.category)))throw new SupportError(409);
   return {id:String(existing.ticketId)};
  }
 }
 const {rows:[budget]}=await c.query(`UPDATE "SupportBudget" SET minute=date_trunc('minute',now()),"minuteCount"=CASE WHEN minute=date_trunc('minute',now()) THEN "minuteCount"+1 ELSE 1 END,day=date_trunc('day',now()),"dayCount"=CASE WHEN day=date_trunc('day',now()) THEN "dayCount"+1 ELSE 1 END WHERE "userId"=$1 AND (minute<>date_trunc('minute',now()) OR "minuteCount"<$2) AND (day<>date_trunc('day',now()) OR "dayCount"<$3) RETURNING "userId"`,[actor,admin?30:5,admin?500:50]);
 if(!budget)throw new SupportError(429);
 if(input.action==='create'){
  const {rows:[count]}=await c.query('SELECT count(*)::int AS count FROM "SupportTicket" WHERE "ownerId"=$1 AND status<>\'CLOSED\'',[actor]);
  if(count.count>=10)throw new SupportError(429);
  const id=randomUUID();
  await c.query('INSERT INTO "SupportTicket"(id,"ownerId",subject,category) VALUES($1,$2,$3,$4)',[id,actor,input.subject,input.category]);
  await c.query('INSERT INTO "SupportMessage"(id,"ticketId","authorId","fromSupport",body,"requestKey") VALUES($1,$2,$3,false,$4,$5)',[randomUUID(),id,actor,input.body,input.requestKey]);
  return {id};
 }
 if(!ticketId)throw new SupportError(404);
 const {rows:[ticket]}=await c.query('SELECT id,status FROM "SupportTicket" WHERE id=$1 AND ($2::boolean OR "ownerId"=$3) FOR UPDATE',[ticketId,admin,actor]);
 if(!ticket)throw new SupportError(404);
 if(input.action==='close'){
  if(!admin)throw new SupportError(403);
  await c.query('UPDATE "SupportTicket" SET status=\'CLOSED\',"updatedAt"=now() WHERE id=$1',[ticketId]);
 }else{
  if(ticket.status==='CLOSED')throw new SupportError(409);
  await c.query('INSERT INTO "SupportMessage"(id,"ticketId","authorId","fromSupport",body,"requestKey") VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),ticketId,actor,admin,input.body,input.requestKey]);
  await c.query('UPDATE "SupportTicket" SET status=$2,"updatedAt"=now() WHERE id=$1',[ticketId,admin?'WAITING_CUSTOMER':'WAITING_SUPPORT']);
 }
 return {id:ticketId};
}
