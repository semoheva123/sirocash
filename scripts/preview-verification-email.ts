import {mkdirSync,writeFileSync} from 'node:fs';
import {verificationEmail} from '../lib/verification-email';
const sample=verificationEmail('024681','signup');
const preview=sample.html.replace('</title>',' — معاينة توضيحية</title>').replace(/(<body[^>]*>)/,'$1<p dir="rtl" style="margin:0;padding:12px;text-align:center;background:#20362b;color:#c1edda;font:12px Tahoma,Arial,sans-serif;">معاينة تصميم فقط — الرمز توضيحي وغير صالح للتحقق</p>');
mkdirSync('docs/previews',{recursive:true});
writeFileSync('docs/previews/verification-email.html',preview);
console.log('Preview written to docs/previews/verification-email.html (sample code, not a real OTP).');
