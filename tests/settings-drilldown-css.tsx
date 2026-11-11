import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {renderToStaticMarkup} from 'react-dom/server';
import {AccountSettings} from '../components/account-settings';
/** Cascade check with the real stylesheets: an opened settings screen shows only its own section under the title.
 *  The menu, profile summary and sign-out row must compute to display:none (a themed menu rule once outranked the hide rule). */
const css=['app/globals.css','app/design-system.css','app/signature.css','app/mobile-wallet.css','app/wallet-premium.css'].map(f=>readFileSync(f,'utf8')).join('\n');
const markup=renderToStaticMarkup(<AccountSettings user={{id:'css-check',email:'css@example.test',emailVerifiedAt:'2026-11-12'}}/>);
const views:Record<string,{shown:string[];hidden:string[]}>={
 menu:{shown:['.mobile-settings-menu','.settings-profile-summary','.settings-menu-signout'],hidden:['.settings-grid']},
 profile:{shown:['#profile'],hidden:['.mobile-settings-menu','.settings-profile-summary','.settings-menu-signout','#preferences','#account-security','#current-session']},
 preferences:{shown:['#preferences'],hidden:['.mobile-settings-menu','.settings-menu-signout','#profile','#account-security']},
 'account-security':{shown:['#account-security','#password-change'],hidden:['.mobile-settings-menu','.settings-menu-signout','#profile','#preferences','#current-session']},
 sessions:{shown:['.settings-security-panels','#current-session'],hidden:['.mobile-settings-menu','.settings-menu-signout','#profile','#account-security']},
};
for(const [view,{shown,hidden}] of Object.entries(views)){
 const dom=new JSDOM(`<!doctype html><html lang="ar" dir="rtl" data-theme="obsidian"><head><style>${css}</style></head><body>${markup}</body></html>`);
 const w=dom.window,main=w.document.querySelector('main.settings-main')!;main.setAttribute('data-settings-view',view);
 const display=(sel:string)=>{const el=w.document.querySelector(sel);assert(el,`${view}: ${sel} must exist in markup`);return w.getComputedStyle(el).display};
 for(const sel of shown)assert.notEqual(display(sel),'none',`${view}: ${sel} must be visible`);
 for(const sel of hidden)assert.equal(display(sel),'none',`${view}: ${sel} must be hidden under the opened screen's title`);
}
console.log('Settings drill-down CSS PASS: with the real stylesheets, each opened screen hides the menu/profile summary/sign-out row and shows only its own section; the menu view hides the grid.');
