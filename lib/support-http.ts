import 'server-only';
import {NextResponse} from 'next/server';
import {currentUser} from './email-auth';
import {database,databaseTransaction} from './database';
import {sameOrigin,PublicApiError} from './api';
import {readJson} from './request-body';
import {securityFailure,securityHeaders} from './security-http';
import {supportAdmin,supportInput,writeSupport,SupportError} from './support-center';
import {z} from 'zod';
const uuid=z.string().uuid();
export type SupportDependencies={user:(request:Request)=>Promise<{id:string}|null>;db:()=>Pick<import('pg').PoolClient,'query'>;transaction:typeof databaseTransaction;admin:typeof supportAdmin};
const defaults:SupportDependencies={user:currentUser,db:database,transaction:databaseTransaction,admin:supportAdmin};
export async function supportGet(request:Request,id?:string,deps=defaults){
 try{
  const user=await deps.user(request);if(!user)return securityFailure('يتطلب تسجيل الدخول. / Sign in required.',401);
  const admin=new URL(request.url).searchParams.get('staff')==='1';
  if(admin&&!deps.admin(user.id))return securityFailure('غير متاح. / Unavailable.',403);
  const url=new URL(request.url),before=url.searchParams.get('before');
  const cursor=before?z.object({at:z.string().datetime({offset:true}),id:uuid}).parse(JSON.parse(before)):null;
  if(id){
   uuid.parse(id);
   const {rows:[ticket]}=await deps.db().query('SELECT id,subject,category,status,"createdAt","updatedAt" FROM "SupportTicket" WHERE id=$1 AND ($2::boolean OR "ownerId"=$3)',[id,admin,user.id]);
   if(!ticket)return securityFailure('الطلب غير متاح. / Request unavailable.',404);
   const {rows}=await deps.db().query('SELECT id,body,"fromSupport","createdAt" FROM "SupportMessage" WHERE "ticketId"=$1 AND ($2::timestamptz IS NULL OR ("createdAt",id)<($2::timestamptz,$3::uuid)) ORDER BY "createdAt" DESC,id DESC LIMIT 51',[id,cursor?.at??null,cursor?.id??null]);
   const more=rows.length>50,messages=rows.slice(0,50),last=messages.at(-1);
   return NextResponse.json({ticket,messages:messages.reverse(),next:more&&last?{at:last.createdAt,id:last.id}:null},{headers:securityHeaders});
  }
  const {rows}=await deps.db().query('SELECT id,subject,category,status,"createdAt","updatedAt" FROM "SupportTicket" WHERE ($1::boolean OR "ownerId"=$2) AND ($3::timestamptz IS NULL OR ("updatedAt",id)<($3::timestamptz,$4::uuid)) ORDER BY "updatedAt" DESC,id DESC LIMIT 31',[admin,user.id,cursor?.at??null,cursor?.id??null]);
  const tickets=rows.slice(0,30),last=tickets.at(-1);
  return NextResponse.json({tickets,next:rows.length>30&&last?{at:last.updatedAt,id:last.id}:null},{headers:securityHeaders});
 }catch(error){return securityFailure('تعذّر تحميل الدعم. / Could not load support.',error instanceof z.ZodError||error instanceof SyntaxError?400:503)}
}
export async function supportPost(request:Request,id?:string,deps=defaults){
 try{
  sameOrigin(request);
  const user=await deps.user(request);if(!user)return securityFailure('يتطلب تسجيل الدخول. / Sign in required.',401);
  const admin=new URL(request.url).searchParams.get('staff')==='1';
  if(admin&&!deps.admin(user.id))return securityFailure('غير متاح. / Unavailable.',403);
  if(id)uuid.parse(id);
  const input=supportInput.parse(await readJson(request,20000));
  if((id&&input.action==='create')||(!id&&input.action!=='create')||(admin&&input.action==='create'))return securityFailure('طلب غير صالح. / Invalid request.',400);
  const result=await deps.transaction(c=>writeSupport(c,user.id,admin,input,id));
  return NextResponse.json(result,{headers:securityHeaders});
 }catch(error){return securityFailure('تعذّر حفظ الطلب. راجع الاتصال أو حاول لاحقاً. / Could not save. Check your connection or retry later.',error instanceof SupportError?error.status:error instanceof z.ZodError||error instanceof SyntaxError||error instanceof PublicApiError?400:503)}
}
