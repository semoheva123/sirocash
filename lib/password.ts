import {randomBytes,scrypt as nodeScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {z} from 'zod';
const scrypt=promisify(nodeScrypt);
export const passwordSchema=z.string().min(12,'يجب ألا تقل كلمة المرور عن 12 خانة.').max(128,'يجب ألا تتجاوز كلمة المرور 128 خانة.');
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return `scrypt$${salt}$${key.toString('hex')}`}
export async function verifyPassword(password:string,encoded:string){const [scheme,salt,key]=encoded.split('$');if(scheme!=='scrypt'||!salt||!key||key.length!==128)return false;const derived=await scrypt(password,salt,64) as Buffer;return timingSafeEqual(derived,Buffer.from(key,'hex'))}
