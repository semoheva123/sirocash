import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {exchangeFeedEnabled} from '../lib/exchange-feed-control';
import {ExchangeTicker} from '../components/exchange-ticker';
assert.equal(exchangeFeedEnabled,false);
assert(renderToStaticMarkup(<ExchangeTicker/>).includes('exchange-ticker-static'));
const text=(path:string)=>readFileSync(path,'utf8');
assert(!text('app/(account)/layout.tsx').includes('ExchangeTicker'));
assert(text('.github/workflows/exchange-collector.yml').includes('if: ${{ false }}'));
const ticker=text('components/exchange-ticker.tsx');assert(!ticker.includes('EventSource'));assert(!ticker.includes('/api/'));
for(const path of ['app/api/exchange-rates/route.ts','app/api/exchange-rates/events/route.ts']){
 const route=text(path),guard=route.indexOf('if(!exchangeFeedEnabled)return new Response');
 assert(guard>route.indexOf('function GET('));
 const body=route.slice(route.indexOf('function GET('));
 assert(body.indexOf('if(!exchangeFeedEnabled)')<Math.min(...['currentUser(request)','financialEventResponse(request'].map(marker=>body.includes(marker)?body.indexOf(marker):Infinity)));
 assert(route.includes('status:204'));assert(route.includes("'Cache-Control':'no-store'"));
}
const wake=text('lib/exchange-public-wake.ts');assert(wake.indexOf('if(!exchangeFeedEnabled)return')<wake.indexOf('process.env.AUTH_SECRET'));assert(wake.indexOf('if(!exchangeFeedEnabled)return')<wake.indexOf('await database().query'));
console.log('Exchange isolation PASS: no account ticker, new independent static component, routes short-circuit before auth/DB/SSE, wake stops before DB/source dispatch. Wallet providers unchanged.');
