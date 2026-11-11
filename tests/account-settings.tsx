import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {AccountSettings} from '../components/account-settings';
const html=renderToStaticMarkup(<AccountSettings user={{id:'settings-test-account',email:'owner@example.test',emailVerifiedAt:'2026-10-30'}}/>);
for(const text of ['إعدادات الحساب','بيانات الحساب','owner@example.test','settings-test-account','تم التحقق','تفضيلات العرض','أمان الحساب','تسجيل الخروج','غير متاح حالياً','هذا الجهاز فقط'])assert.ok(html.includes(text),text);
assert.ok(html.includes('href="/dashboard"'));
assert.ok(!html.includes('href="/"'));
assert.ok(!/passwordHash|tokenHash|AUTH_SECRET|RESEND_API_KEY|SC-8901/.test(html));
assert.ok(html.includes('aria-pressed="true"'));
for(const id of ['current-password','new-password','confirm-password'])assert.ok(html.includes(`id="${id}"`));
assert.ok(html.includes('autoComplete="current-password"')||html.includes('autocomplete="current-password"'));
assert.ok(html.includes('إرسال رمز التحقق'));
assert.ok(html.includes('لن تتغيّر كلمة المرور إلا بعد تأكيد الرمز'));
const unverified=renderToStaticMarkup(<AccountSettings user={{id:'other-account',email:'other@example.test',emailVerifiedAt:''}}/>);
assert.ok(unverified.includes('لم يتم التحقق'));
console.log('Account settings: own identity, verification state, private navigation, actual controls, honest unsupported features and no secrets in HTML passed.');
// Drill-down contract: a tapped row opens a screen whose first content is what was tapped, at the top of the page.
assert.ok(html.indexOf('id="password-change"')<html.indexOf('آلية تسجيل الدخول'),'password form before sign-in facts');
assert.ok(html.indexOf('class="settings-security-panels"')<html.indexOf('id="current-session"'),'sessions panels before the sign-out card');
{const menu=new JSDOM(html).window.document.querySelector('.mobile-settings-menu')!;const rows=Array.from(menu.querySelectorAll(':scope>a'));assert.ok(rows.length>=7);for(const row of rows)assert.ok(row.querySelector('.settings-row-chevron'),'every settings row shows a destination chevron: '+row.textContent);}
{const source=readFileSync('components/account-settings.tsx','utf8');assert.ok(source.includes("window.scrollTo({top:0,left:0,behavior:'auto'})")&&source.includes("focus({preventScroll:true})"),'view changes scroll to the top and move focus to the opened screen');assert.ok(/if\(!firstView\.current\)openedView\(\)/.test(source),'initial deep link keeps the browser position');assert.ok(source.includes("replaceState(null,'','/settings');openedView()"),'back to menu also resets');
 const css=readFileSync('app/mobile-wallet.css','utf8');assert.ok(css.includes('settings-view-enter')&&css.includes('.settings-main .settings-grid,.settings-main>.app-preferences{animation:none!important}'),'short enter transition, disabled under reduced motion');}
console.log('Settings drill-down PASS: tapped item is the first content of its screen, rows carry chevrons, view changes reset scroll and focus, reduced-motion safe.');

const reviewer=new JSDOM(renderToStaticMarkup(<AccountSettings user={{id:'reviewer',email:'reviewer@example.test',emailVerifiedAt:'2026-10-30'}} canReviewIdentity/>)).window.document;
const reviewMenu=reviewer.querySelector('.mobile-settings-menu a[href="/identity-review"]');assert(reviewMenu,'Authorized reviewer gets an entry in the visible settings menu');assert.equal(reviewMenu.closest('.settings-grid'),null,'Review entry must not live in the CSS-hidden grid');
const customer=new JSDOM(html).window.document;assert.equal(customer.querySelector('a[href="/identity-review"]'),null,'Ordinary account must not see review navigation');
console.log('Identity review navigation PASS: authorized entry is outside the hidden settings grid and absent for ordinary accounts.');
