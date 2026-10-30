import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
export function apiError(error:unknown){return NextResponse.json({error:error instanceof ZodError?error.issues[0].message:error instanceof SyntaxError?'Invalid JSON body.':error instanceof Error?error.message:'Request failed.'},{status:400})}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host')&&new URL(origin).host!==request.headers.get('x-forwarded-host'))throw Error('Cross-origin requests are not allowed.')}
