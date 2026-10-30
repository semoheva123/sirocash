import assert from 'node:assert/strict';
import {verificationEmail} from '../lib/verification-email';
for(const purpose of ['signup','login'] as const){
 const message=verificationEmail('012345',purpose);
 assert.ok(message.html.startsWith('<!doctype html>'));
 assert.ok(message.html.includes('dir="rtl"'));
 assert.ok(message.html.includes('lang="en" dir="ltr"'));
 assert.ok(message.html.includes('>012345</p>'));
 assert.ok(message.text.includes('012345'));
 assert.ok(message.html.includes('10 دقائق'));
 assert.ok(message.text.includes('10 minutes'));
 assert.ok(message.html.includes('لا تشارك هذا الرمز'));
 assert.ok(message.subject.includes(purpose==='signup'?'تأكيد بريدك الإلكتروني':'تأكيد تسجيل الدخول'));
 assert.ok(!/resend|<script|<img|<form|<link|https?:\/\//i.test(message.html));
 assert.ok(!message.subject.includes('012345'));
 assert.ok(!message.html.includes('backdrop-filter'));
}
for(const input of ['<script>','12345','1234567','١٢٣٤٥٦','123456\n'])assert.throws(()=>verificationEmail(input,'signup'));
console.log('Verification email: bilingual, email-safe HTML and plain text, six-digit validation, purpose-specific copy and no tracking or provider branding passed.');
