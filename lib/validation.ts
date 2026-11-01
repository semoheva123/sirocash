import {z} from 'zod';
import {cryptoAssets,networkIds,supportsAsset} from './crypto-assets';
export const transferSchema=z.object({recipient:z.string().trim().refine(v=>/^SC-[a-zA-Z0-9]{4,32}$/.test(v)||/^\+?[1-9]\d{7,14}$/.test(v),'Enter a valid phone number (no spaces) or wallet ID, e.g. SC-1234.').refine(v=>v!=='SC-8901','You cannot send to your own wallet.'),amount:z.number().finite().positive().max(100000).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001,'Use at most two decimal places.'),pin:z.string().regex(/^\d{6}$/,'Enter a 6-digit PIN.')});
const gatewayFields={asset:z.enum(cryptoAssets).default('USDT'),chain:z.enum(networkIds)};
export const chainSchema=z.object(gatewayFields).superRefine((v,ctx)=>{if(!supportsAsset(v.asset,v.chain))ctx.addIssue({code:'custom',message:'الشبكة المحدّدة غير متاحة لهذه العملة.',path:['chain']})});
export const withdrawalSchema=transferSchema.omit({recipient:true}).extend({...gatewayFields,recipient:z.string().trim()}).superRefine((v,ctx)=>{
 if(!supportsAsset(v.asset,v.chain))ctx.addIssue({code:'custom',message:'الشبكة المحدّدة غير متاحة لهذه العملة.',path:['chain']});
 const valid=v.chain==='TRC20'?/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v.recipient):/^0x[a-fA-F0-9]{40}$/.test(v.recipient);
 if(!valid)ctx.addIssue({code:'custom',message:'عنوان المحفظة لا يتوافق مع صيغة الشبكة المحدّدة.',path:['recipient']});
});

// Syrian mobile format only. Do not infer operator from prefixes (number portability).
export function normalizeSyrianMobile(value:string){
 const digits=value.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[\s()-]/g,'');
 if(/^09\d{8}$/.test(digits))return '+963'+digits.slice(1);
 if(/^009639\d{8}$/.test(digits))return '+'+digits.slice(2);
 return digits;
}
export const shamCashSchema=transferSchema.omit({recipient:true}).extend({
 recipient:z.string().trim().min(6,'أدخل معرّف حساب شام كاش. يجب أن يتكوّن من 6 إلى 64 خانة.').max(64).regex(/^[a-zA-Z0-9+_-]+$/,'معرّف حساب شام كاش غير صالح. استخدم أحرفاً لاتينية أو أرقاماً دون مسافات.'),
});
export const topupSchema=transferSchema.omit({recipient:true}).extend({
 operator:z.enum(['SYRIATEL','MTN']),
 phone:z.string().transform(normalizeSyrianMobile).refine(v=>/^\+9639\d{8}$/.test(v),'أدخل رقماً سورياً صحيحاً مثل 09XXXXXXXX أو +9639XXXXXXXX.'),
 amount:z.number().refine(v=>[1,3,5,10,20].includes(v),'اختر إحدى قيم الشحن التجريبية المتاحة.'),
});
