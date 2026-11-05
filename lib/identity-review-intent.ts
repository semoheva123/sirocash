import {createHash} from 'node:crypto';
import {z} from 'zod';
const reason=z.enum(['unreadable','incomplete','unsupported','details_mismatch']);
export const identityReviewCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('list')}).strict(),
 z.object({action:z.literal('document'),id:z.string().uuid(),side:z.enum(['front','back'])}).strict(),
 z.object({action:z.literal('decision'),id:z.string().uuid(),status:z.enum(['approved','resubmit']),reason:reason.optional(),confirmed:z.literal(true)}).strict().refine(c=>c.status==='resubmit'?!!c.reason:!c.reason),
]);
/** Separate domain, bound to the exact review action. Password/document bytes are never hashed. */
export function identityReviewDigest(value:unknown){const command=identityReviewCommand.parse(value);return createHash('sha256').update(JSON.stringify(['/api/identity/review',...['action','id','side','status','reason','confirmed'].map(key=>[key,(command as Record<string,unknown>)[key]??null])])).digest('hex')}
