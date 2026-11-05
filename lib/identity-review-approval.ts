import 'server-only';
import {sessionTokenHash} from './email-auth';
import {databaseTransaction} from './database';
import {consumeDurableApproval} from './durable-passkey';
import {identityReviewDigest} from './identity-review-intent';
/** Consume once before crossing into D1. A failed/uncertain D1 call never reuses this approval. */
export async function requireIdentityReviewApproval(request:Request,userId:string,command:unknown){
 const sessionHash=sessionTokenHash(request),origin=process.env.WEBAUTHN_ORIGIN;
 if(process.env.SIRO_DURABLE_PASSKEY_ENABLED!=='true'||!sessionHash||!origin||request.headers.get('origin')!==origin)throw Error('IDENTITY_REVIEW_APPROVAL_REQUIRED');
 const token=request.headers.get('x-siro-approval')??'',digest=identityReviewDigest(command);
 await databaseTransaction(tx=>consumeDurableApproval({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows})},{userId,sessionHash,origin,rpID:new URL(origin).hostname},token,digest));
}
