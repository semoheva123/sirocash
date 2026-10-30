import {createHash} from 'node:crypto';
const allowed=new Set(['/api/wallet/transfer','/api/wallet/withdraw','/api/wallet/sham-cash','/api/mobile/topup']);
export function paymentDigest(path:string,payload:unknown){
 if(!allowed.has(path)||!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('طلب غير صالح.');
 const p=payload as Record<string,unknown>;
 // Bind approval to exactly the financial operation; never retain the PIN.
 return createHash('sha256').update(JSON.stringify([path,...['recipient','phone','operator','amount','chain','asset'].map(k=>[k,p[k]??null])])).digest('hex');
}
