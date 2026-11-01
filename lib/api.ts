import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
/** Only explicitly authored public errors may cross the HTTP boundary. Never wrap provider/SQL text. */
export class PublicApiError extends Error {}
export function apiError(error:unknown){
 const message=error instanceof PublicApiError?error.message:error instanceof ZodError?'البيانات المدخلة غير صالحة. يرجى مراجعة الطلب.':error instanceof SyntaxError?'صيغة الطلب غير صالحة.':'تعذّر تنفيذ الطلب. يرجى المحاولة لاحقاً.';
 return NextResponse.json({error:message},{status:400,headers:{'Cache-Control':'no-store'}});
}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(!origin||request.headers.get('sec-fetch-site')==='cross-site')throw new PublicApiError('الطلب من نطاق غير موثوق.');
 try{
  const configured=process.env.WEBAUTHN_ORIGIN;
  // Production trusts only the configured canonical origin, never forwarded host headers.
  if(process.env.NODE_ENV==='production'&&!configured)throw new Error();
  const expected=new URL(configured??request.url),actual=new URL(origin);
  if(actual.origin!==origin||expected.origin!==(configured??expected.origin)||actual.origin!==expected.origin||actual.username||actual.password||!['https:','http:'].includes(actual.protocol))throw new Error();
 }catch{throw new PublicApiError('الطلب من نطاق غير موثوق.')}
}
