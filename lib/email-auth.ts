import {readSessionWithRecovery} from './database-resilience';
import {readJson} from './request-body';
import 'server-only';
import {recordSecurityEvent} from './security-events';
import {deviceLabel} from './account-security';
import {flushSecurityMail} from './security-mail';
import {createHash,randomBytes,randomInt,createHmac,timingSafeEqual} from 'node:crypto';
import {Resend} from 'resend';
import {verificationEmail} from './verification-email';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {sameOrigin,apiError,PublicApiError} from './api';
import {database as pool,databaseTransaction as transaction} from './database';
import {passwordSchema,hashPassword,verifyPassword} from './password';
const COOKIE='siro-auth';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function otpHash(id:string,code:string){const secret=process.env.AUTH_SECRET;if(!secret||secret.length<32)throw new PublicApiError('خدمة الحسابات غير متاحة حالياً. يرجى المحاولة لاحقاً.');return createHmac('sha256',secret).update(id+':'+code).digest('hex')}
function cookieToken(request:Request){return request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)}
export function sessionTokenHash(request:Request){const token=cookieToken(request);return token?hash(token):null}
export async function currentUser(request:Request){const token=cookieToken(request);if(!token)return null;const {rows}=await readSessionWithRecovery(()=>pool().query('SELECT u.id,u.email,u."emailVerifiedAt" FROM "AuthSession" s JOIN "User" u ON u.id=s."userId" WHERE s."tokenHash"=$1 AND s."expiresAt">NOW()',[hash(token)]));return rows[0] as {id:string;email:string;emailVerifiedAt:string}|undefined??null}
export async function requireUser(request:Request){let user;try{user=await currentUser(request)}catch{throw new PublicApiError('خدمة الحسابات غير متاحة مؤقتاً.')}if(!user)throw new PublicApiError('يتطلّب هذا الإجراء تسجيل الدخول والتحقق من البريد الإلكتروني.');return user}
const emailRequestServices={pool,transaction,sendEmail:async(to:string,code:string,mode:'signup'|'login')=>{
 const {error}=await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.RESEND_FROM_EMAIL!,to,...verificationEmail(code,mode)});
 if(error)throw Error('delivery');
}};
export async function requestCode(request:Request,services=emailRequestServices){
 const {pool,transaction,sendEmail}=services;
 sameOrigin(request);
 const {email,password,mode}=z.object({email:z.string().trim().email('أدخل بريداً إلكترونياً صحيحاً.').max(254).transform(v=>v.toLowerCase()),password:passwordSchema,mode:z.enum(['signup','login'])}).parse(await readJson(request));
 if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)throw new PublicApiError('خدمة إرسال البريد غير متاحة حالياً. يرجى المحاولة لاحقاً.');
 const id=randomBytes(24).toString('hex'),code=String(randomInt(100000,1000000)),codeHash=otpHash(id,code);
 // Durable per-email cooldown and hourly quota. Infrastructure must also enforce IP/global quotas.
 const reserved=await transaction(async c=>{
  // Global bucket is locked first to bound spend from random-address spraying.
  const globalLimit=Number(process.env.AUTH_MAX_EMAILS_PER_HOUR||100);
  for(const [bucket,limit,cooldown] of [['global',Number.isFinite(globalLimit)?Math.max(1,globalLimit):100,0],[hash(email),5,60000]] as const){
   await c.query('INSERT INTO "EmailRateLimit" (id) VALUES ($1) ON CONFLICT DO NOTHING',[bucket]);
   const {rows:[r]}=await c.query('SELECT * FROM "EmailRateLimit" WHERE id=$1 FOR UPDATE',[bucket]);
   const now=Date.now();if(cooldown&&now-new Date(r.lastSentAt).getTime()<cooldown)return false;
   const count=now-new Date(r.windowStart).getTime()<3600000?r.count:0;if(count>=limit)return false;
  }
  for(const bucket of ['global',hash(email)])await c.query('UPDATE "EmailRateLimit" SET "lastSentAt"=NOW(),count=CASE WHEN "windowStart"<NOW()-INTERVAL \'1 hour\' THEN 1 ELSE count+1 END,"windowStart"=CASE WHEN "windowStart"<NOW()-INTERVAL \'1 hour\' THEN NOW() ELSE "windowStart" END WHERE id=$1',[bucket]);
  return true;
 });
 if(!reserved)return NextResponse.json({error:'تم بلوغ أحد حدود طلبات التحقق. يُرجى الانتظار دقيقة واحدة على الأقل بين الطلبات، مع الالتزام بالحد المسموح: 5 طلبات في الساعة لكل بريد إلكتروني.'},{status:429,headers:{'Retry-After':'60'}});
 const {rows:[existing]}=await pool().query('SELECT id,"passwordHash" FROM "User" WHERE email=$1',[email]);
 let passwordHash:string;
 if(mode==='signup'){
  // Equal password work and response shape whether or not an account exists.
  passwordHash=await hashPassword(password);
 }else{
  // Perform a real scrypt even for unknown/legacy accounts to reduce timing disclosure.
  const fallback='scrypt$00000000000000000000000000000000$'+'00'.repeat(64);
  const valid=await verifyPassword(password,existing?.passwordHash||fallback);
  if(!valid||!existing?.passwordHash)return NextResponse.json({error:'البريد الإلكتروني أو كلمة المرور غير صحيحة.'},{status:400});
  passwordHash=existing.passwordHash;
 }
 // Existing signup receives the same delivery and opaque response, but no usable challenge.
 if(!(mode==='signup'&&existing)) await transaction(async c=>{
  await c.query('DELETE FROM "EmailChallenge" WHERE email=$1 OR "expiresAt"<NOW()',[email]);
  await c.query('INSERT INTO "EmailChallenge" (id,email,"codeHash","expiresAt","passwordHash",purpose) VALUES ($1,$2,$3,NOW()+INTERVAL \'10 minutes\',$4,$5)',[id,email,codeHash,passwordHash,mode]);
 });
 try{
  await sendEmail(email,code,mode);
 }catch{await pool().query('DELETE FROM "EmailChallenge" WHERE id=$1',[id]);throw new PublicApiError('تعذّر إرسال رمز التحقق. يرجى المحاولة لاحقاً.');}
 return NextResponse.json({challengeId:id,expiresIn:600,resendAfter:60},{headers:{'Cache-Control':'no-store'}});
}
export async function verifyCode(request:Request){
 sameOrigin(request);const {challengeId,code}=z.object({challengeId:z.string().regex(/^[a-f0-9]{48}$/),code:z.string().regex(/^\d{6}$/)}).parse(await readJson(request));
 const token=randomBytes(32).toString('hex');
 const user=await transaction(async c=>{
  const {rows:[challenge]}=await c.query('SELECT * FROM "EmailChallenge" WHERE id=$1 FOR UPDATE',[challengeId]);
  if(!challenge||new Date(challenge.expiresAt).getTime()<Date.now()||challenge.attempts>=5)return null;
  await c.query('UPDATE "EmailChallenge" SET attempts=attempts+1 WHERE id=$1',[challengeId]);
  if(!timingSafeEqual(Buffer.from(challenge.codeHash,'hex'),Buffer.from(otpHash(challengeId,code),'hex')))return null;
  await c.query('DELETE FROM "EmailChallenge" WHERE id=$1',[challengeId]);
  if(!challenge.passwordHash||!['signup','login'].includes(challenge.purpose))return null;
  let u;
  if(challenge.purpose==='signup'){
   const result=await c.query('INSERT INTO "User" (id,email,"emailVerifiedAt","passwordHash") VALUES (gen_random_uuid(),$1,NOW(),$2) ON CONFLICT (email) DO NOTHING RETURNING id,email',[challenge.email,challenge.passwordHash]);u=result.rows[0];
  }else{
   const result=await c.query('SELECT id,email FROM "User" WHERE email=$1 AND "passwordHash"=$2 AND "emailVerifiedAt" IS NOT NULL FOR UPDATE',[challenge.email,challenge.passwordHash]);u=result.rows[0];
  }
  if(!u)return null;
  await c.query('DELETE FROM "AuthSession" WHERE "expiresAt"<NOW()');
  await c.query('INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt","createdAt","deviceLabel") VALUES ($1,$2,NOW()+INTERVAL \'1 day\',NOW(),$3)',[hash(token),u.id,deviceLabel(request.headers.get('user-agent'))]);
  await recordSecurityEvent(c,u.id,'sign_in',u.email);return u;
 });
 if(!user)return NextResponse.json({error:'تعذّر اعتماد رمز التحقق. قد يكون الرمز غير صحيح أو منتهي الصلاحية، أو تم بلوغ الحد الأقصى للمحاولات. يُرجى طلب رمز جديد عند الحاجة.'},{status:400});
 await flushSecurityMail().catch(()=>{});
 const response=NextResponse.json({user},{headers:{'Cache-Control':'no-store'}});
 response.cookies.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:86400});
 // Drop demo passkey state when changing email account.
 response.cookies.set('siro-passkey-session','',{httpOnly:true,path:'/',maxAge:0});return response;
}
export async function logout(request:Request){sameOrigin(request);const token=cookieToken(request);if(token)await pool().query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1',[hash(token)]);const response=NextResponse.json({ok:true});for(const name of [COOKIE,'siro-passkey-session'])response.cookies.set(name,'',{httpOnly:true,path:'/',maxAge:0});return response}

export function emailAuthError(error:unknown){
 if(error instanceof z.ZodError||error instanceof SyntaxError)return apiError(error);
 const message=error instanceof PublicApiError?error.message:'خدمة الحسابات غير متاحة مؤقتاً. يُرجى المحاولة لاحقاً.';
 return NextResponse.json({error:message},{status:503,headers:{'Cache-Control':'no-store'}});
}
