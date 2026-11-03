# Account data continuity

## Behavior

The authenticated account layout obtains a request-local, owner-bound initial
financial snapshot and receiving profile in parallel. The first server render can
therefore show real account data instead of an empty client shell. Reads fail
independently; a failed bootstrap falls back to the existing live stream/profile
request, never invented zero balances. The snapshot projection is validated and
serialized (including dates) before passing it to the client.

The layout retains one financial stream and one receiving-profile source across
client route transitions. Profile revalidation and save/reload do not clear the
last successful profile. There is no global customer cache, localStorage financial
cache, new polling, or change to ledger/fees/transaction execution. Sources are
keyed by authenticated owner. Session-ended/owner-mismatch events clear financial
and receiving data from the displayed context.

Server data is **not** a live authorization: the financial sync state starts as
`syncing`, and existing execution gates require current data. A compact routine
sync does not insert a large banner when data is already available; retry/offline/
session failures remain visible. Bootstrap failure can still produce a genuine
loading state. Initial navigation waits for real server reads; this is not a promise
of zero network latency.

Account language is shared across route transitions and saved in a non-sensitive
SameSite=Lax cookie for the next server render. Existing localStorage preferences
migrate once when the cookie is absent (that first migration may still change the
initial language). No personal/financial data is stored in that cookie.

## Verification and limits

- `npm test` (existing full suite), followed by targeted final financial-stream,
  settings, routing, and continuity tests.
- `npm run test:account-continuity`: SSR data, owner isolation, seed not live,
  language and synchronization-message behavior.
- `npx next build --webpack`: application compilation, not production readiness
  probes or live provider verification.
- `node tests/visual/navigation-review.mjs`: synthetic delayed SSE/profile failure,
  persistent layout across child remounts, single stream/profile read, live update,
  language retention and session-ended clearing at 360/1440 px.
- `node tests/visual/uid-review.mjs`: bilingual wallet/profile flows at five widths.

The browser fixture is **not** an authenticated production Next router test, load
benchmark or proof of million-user capacity. No production transfers, database
migration, provider changes or production deployment are part of this patch.
