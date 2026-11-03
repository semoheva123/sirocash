# Reference exchange ticker

Authenticated account layout only; Arabic RTL / English LTR. New SYP market buy/sell
for Damascus, USD/TRY (TRY per USD), EUR/USD (USD per EUR). Official SYP is explicitly
unavailable until a verified official source exists; exchange-company quotes are NOT
central-bank prices. SP Today is labeled an independent source. No hardcoded rates,
midpoints, inferred official rates, automatic SYP conversion, financial quote/fee or
balance/ledger integration.

## Provider decisions (owner confirmation, 2026-11-03)

The owner confirmed with the provider that the free API may be used on their platform
without display conditions, and that ALL API Syrian prices use the NEW pound. These
are owner-reported confirmations, not assertions inferred from sample price sizes.
Documented endpoint: `https://api-v2.sp-today.com/api/v1/overview?lang=en`, header
`X-API-Key`. `data.rates` contains USD's `cities.damascus.buy/sell`, `updated_at`;
`data.global_fx` contains `USD/TRY` and `EUR/USD` and uses `data.updated_at`.
The documentation examples supplied by the owner are fixtures, never live values.

`SP_TODAY_API_KEY` is a sensitive server-only production variable. Do NOT decrypt it,
paste it into scripts/chat, place it in URLs/client code, or log upstream errors.

## Bounded shared collection

Apply migration `20261103200000_exchange_reference` before deploying. New isolated
`ExchangeReference` singleton, no financial/user relationships. RLS denies browser
roles; backend can SELECT/INSERT/UPDATE, not DELETE. The backend must have the
existing `sirocash_app` grants. No public Supabase policy or client database access.

Each authenticated account layout mount makes one same-origin read. No browser
polling, scheduler, SSE subscription, per-customer provider key, or trade action.
Only one worker can atomically claim a collection attempt across instances/redeploys.
The claim is persisted BEFORE outbound I/O, and reserves at least eight hours and one
of at most 93 UTC-calendar-month attempts. The free tier is 100/month, leaving seven
requests of headroom **assuming no use outside this application**. Deployment doesn't
reset the budget. All failures and abandoned attempts consume quota/cooldown; zero
automatic retries. No account visits means no collection; this is a reference snapshot,
NOT a guarantee of three daily updates or a live market feed.

429 or remaining=0 blocks collection until the provider reset (validated/bounded),
falling back to next UTC month. Provider-side other usage may exhaust the account
sooner. Successful final allowed requests are still saved. An eight-second timeout,
256 KiB decoded body cap, no redirects, strict positive buy<=sell and timestamp
validation fail closed. Malformed data/errors/DB outages don't block the wallet.
Only normalized snapshots reach the browser; never keys/provider diagnostics/quotas.

Provider timestamps, NOT the fetch time, are displayed in Damascus timezone. Data
older than 16h is visibly stale; beyond 7 days numbers are hidden but source timestamp
remains visible. A local presentation clock ages open tabs without network requests.
No snapshot => unavailable, not zero or sample data. A missing FX pair stays unavailable.
Initial concurrent visitors can see unavailable while the first claim completes; reload
later displays the shared snapshot, without introducing automatic polling.

## Validation

`npm run test:exchange-reference`: parser, unchanged new units, no fabricated official
prices, AR/EN reference/stale/expired/unavailable presentation, unauthorized 401/no-store,
PGlite migration and privilege isolation, atomic shared claims, eight-hour cooldown,
93 cap/month rollover, provider failures/oversize/429/header exhaustion/stale retention.
`node tests/visual/exchange-review.mjs` with the local fixture server renders 24 synthetic
AR/EN mobile/desktop states. Optional Playwright/Chromium are no-save review tools only.
No authenticated financial operations are performed by these tests.

A live key/data-shape test and authenticated production rendering must be reported
separately from offline tests; presence of the environment variable isn't proof.

## Compact news-strip correction (2026-11-03)

Replaced the oversized card row with a single 40px animated news-style strip.
Source, per-pair timestamps and official-source caveat live in a native modal,
not expanding page copy. Only valid/non-expired quotes appear in the moving row;
missing official quotes are disclosed in the dialog instead of empty moving slots.
An entirely missing snapshot shows one compact failure message, never made-up rates.
Movement pauses on hover/focus, has a persistent play/pause control and stops under
prefers-reduced-motion (manual scrolling remains available). Duplicated visual loop
is aria-hidden. A local clock changes stale presentation, not network traffic.

Production investigation confirmed a reserved first attempt with no saved snapshot;
the original implementation swallowed errors and imposed an eight-hour cooldown.
That proves the collection did not complete, NOT its underlying failure reason.
Added backend-only sanitized lastOutcome/lastHttpStatus/lastIssues, never secrets,
raw provider bodies, error messages or URLs. No diagnostic data goes to the browser.

A production-only build recovery probe can reserve ONE additional attempt after the
first failed bootstrap (requires snapshot NULL, attempts exactly 1 in the current UTC
month, provider not blocked). It increments the SAME <=93 monthly budget, resets the
normal eight-hour next-attempt time and cannot run again after attempts becomes 2.
This explicit bootstrap diagnostic is the only exception to the normal eight-hour
spacing; it does not reset counters, bypass exhaustion or allow redeploy loops.
Its sanitized result can establish the actual cause without decrypting the API key.
Apply migration 20261103210000_exchange_diagnostics before deploying this correction.
