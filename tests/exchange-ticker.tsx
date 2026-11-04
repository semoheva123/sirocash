import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ExchangeTickerView} from '../components/exchange-ticker';
import {parseExchangeOverview,exchangeSnapshotSchema} from '../lib/exchange-reference';
 const now=new Date(),at=now.toISOString();
 const raw={ok:true,data:{cities:[],rates:[{code:'USD',cities:{damascus:{buy:145,sell:146,change:0.35}},updated_at:at}],global_fx:[{pair:'EUR/USD',rate:1.0856},{pair:'USD/TRY',rate:34.52}],updated_at:at}};
 const snapshot=parseExchangeOverview(raw,now);
 for(const ar of [true,false]){
  const html=renderToStaticMarkup(<ExchangeTickerView ar={ar} snapshot={snapshot} now={now.getTime()}/>);
  assert(html.includes(ar?'ل.س الجديدة':'New SYP'));
  assert(html.includes('aria-hidden="true"'));assert(!html.includes('<article'));
  for(const removed of ['<button','<dialog','exchange-ticker-dialog','aria-pressed','data-paused','— details','— التفاصيل'])assert(!html.includes(removed),removed);
  assert(html.includes('exchange-ticker-track'));assert(html.includes('USD / SYP'));
  assert(!html.includes('YOUR_API_KEY'));assert(!html.includes('14500'));
  const stale=renderToStaticMarkup(<ExchangeTickerView ar={ar} snapshot={snapshot} now={now.getTime()+17*3600000}/>);
  assert(stale.includes(ar?'بيانات قديمة':'Stale'));
  const expired=renderToStaticMarkup(<ExchangeTickerView ar={ar} snapshot={snapshot} now={now.getTime()+8*86400000}/>);
  assert(expired.includes(ar?'تعذّر تحميل الأسعار':'Rates could not be loaded'));assert(!expired.includes('<button'));assert(!expired.includes('<dialog'));assert(!expired.includes('34.52'));
  const empty=renderToStaticMarkup(<ExchangeTickerView ar={ar} snapshot={null} now={now.getTime()}/>);
  assert(!empty.includes('<button'));assert(!empty.includes('<dialog'));assert(!empty.includes('145'));assert(!empty.includes('<time'));assert(!empty.includes('exchange-ticker-group'));assert(empty.includes(ar?'تعذّر تحميل الأسعار':'Rates could not be loaded'));
 }
console.log('Exchange ticker AR/EN strip-only, no controls/dialog, static/stale/expired/unavailable presentation PASS');

// Public SSR has no per-quote source timestamp: retrieval age is explicit and no
// API-derived 100x value is substituted. Source values remain literal new SYP.
for(const ar of [true,false]){
 const publicPage=exchangeSnapshotSchema.parse({source:'sp-today',city:'syria-general',unit:'SYP_NEW',observation:'public-page',market:{buy:144,sell:144.5},fx:[{pair:'USD/TRY',rate:50.0213},{pair:'EUR/USD',rate:1.1246}],fetchedAt:at});
 const html=renderToStaticMarkup(<ExchangeTickerView ar={ar} snapshot={publicPage} now={now.getTime()}/>);
 assert(html.includes(ar?'ل.س الجديدة':'New SYP'));assert(html.includes('USD / TRY'));assert(!html.includes('NaN'));assert(!html.includes(ar?'بيانات قديمة':'Stale'));
}
const client=readFileSync('components/exchange-ticker.tsx','utf8');
assert(client.includes("createStaticExchangeReader"));assert(!client.includes("EventSource"));assert(!client.includes("/api/"));
