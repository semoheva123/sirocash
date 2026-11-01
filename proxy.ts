import {NextResponse,type NextRequest} from 'next/server';
/** Request-scoped nonce: Next reads the forwarded CSP to nonce its own scripts. */
export function proxy(request:NextRequest){
 const nonce=btoa(crypto.randomUUID());
 const production=process.env.VERCEL_ENV==='production';
 const policy=["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV==='development'?" 'unsafe-eval'":''}`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self'","connect-src 'self'", "worker-src 'self' blob:","object-src 'none'","base-uri 'none'","form-action 'self'",...(production?["frame-ancestors 'none'","upgrade-insecure-requests"]:[])].join('; ');
 const headers=new Headers(request.headers);headers.set('Content-Security-Policy',policy);
 const response=NextResponse.next({request:{headers}});
 response.headers.set('Content-Security-Policy',policy);
 response.headers.set('Cache-Control','private, no-store');
 if(production){response.headers.set('X-Frame-Options','DENY');response.headers.set('Strict-Transport-Security','max-age=31536000')}
 return response;
}
export const config={matcher:['/((?!api|_next/static|_next/image|favicon.ico).*)']};
