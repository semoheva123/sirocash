import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
export const securityHeaders={'Cache-Control':'no-store'};
export function securityFailure(message:string,status:number){return NextResponse.json({error:message},{status,headers:securityHeaders})}
export function securityError(error:unknown){
 if(error instanceof ZodError)return securityFailure(error.issues[0].message,400);
 if(error instanceof SyntaxError)return securityFailure('صيغة الطلب غير صالحة.',400);
 return securityFailure('الخدمة غير متاحة مؤقتاً. يُرجى المحاولة لاحقاً.',503);
}
export function clearAuthCookies(response:NextResponse){
 for(const name of ['siro-auth','siro-passkey-session'])response.cookies.set(name,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
 return response;
}
