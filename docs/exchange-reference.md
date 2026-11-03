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

## Access repair investigation (2026-11-03)

The live first-bootstrap diagnostic returned HTTP 403 without a snapshot. That is
an upstream refusal, not proof of a bad key. Normal requests now identify the actual
application using its verified canonical Origin/Referer (server configuration only,
strictly restricted to HTTPS sirocash.online / www.sirocash.online), and trim accidental
outer whitespace from the server key. No alternate host/proxy/redirect or browser
impersonation is introduced. Domain binding being the root cause is a hypothesis to
be verified, not a claimed success.

HTTP failures now retain only an allowlisted constant provider error code, categorical
content type, and challenge boolean; never provider messages, arbitrary codes, raw
bodies, keys or secret values. Diagnostics stay backend-only.

The explicit access-repair build probe can atomically reserve attempt 3 only when
attempts=2, no snapshot exists, lastHttpStatus=403 and the provider is not blocked.
This is one additional spacing exception for the user-requested repair, not a reset
or a repeated deployment retry. It consumes the SAME <=93/month allowance and cannot
repeat once attempts advances. Normal collection still follows its eight-hour cooldown.
A real successful response and saved snapshot, not a successful build, establishes
that provider access is working. If refusal persists, report the exact safe provider
code rather than claiming that prices were fixed.

## User-authorized currencies-path experiment (2026-11-03)

The owner supplied `/currencies?lang=en` documentation with `data.currencies` and
explicitly asked to try it after the overview-path Cloudflare challenge. This is one
ordinary authenticated request to a documented endpoint, NOT a challenge solver,
proxy/host fallback, browser impersonation or recurring retry.

`probeExchangeCurrenciesOnce` atomically reserves attempt 4 only from the observed
November 2026 state: attempts=3, snapshot absent, last HTTP 403 + challenge=true,
and blockedUntil=infinity (the deliberate challenge pause). The same 93-attempt
budget is incremented before I/O. It does NOT clear the pause, change cooldowns,
reset counters, overwrite a snapshot or re-arm in a later month. Redeploys cannot
repeat once attempts becomes 4. The previous access-repair probe is not called.

Only status, content category, challenge flag, allowlisted error code, and validated
currency-list count/USD presence are retained. Raw bodies/values/messages/keys are
not logged or stored. Even HTTP 200 does not resume the overview collector or claim
that the ticker is integrated with a new response shape. Production result must be
reported separately from offline tests and deployment readiness.

## User-authorized direct method comparisons (2026-11-03)

Owner asked for further API checks without being concerned about the request quota;
this is NOT permission to share the key with intermediaries or to run unlimited
requests. One fixed November batch is authorized from the verified attempts=4,
CURRENCIES_HTTP/403/challenge + infinite-pause state. No recurring re-arming.

1. GET documented `/currency/usd?lang=en`, key in X-API-Key, minimal JSON Accept;
   no Origin/Referer, invented auth schemes, query-string key or fake browser.
2. Same URL from the same production environment WITHOUT any key: a deliberate
   control to distinguish credential-specific rejection from hosting/edge rejection.
   No follow-up after explicit 429/remaining=0 on the first check.
3. Only if the authenticated USD request succeeds with ok=true and neither comparison
   is challenged/exhausted, GET `/currencies?lang=en` with the documented minimal headers.

Each actual request is reserved in the existing counter BEFORE I/O, <=93/month.
There are at most three calls, no per-case retry and no proxy/challenge solver.
A detected challenge stops further authenticated probes; the single credential-free
control is diagnostic, not an attempt to obtain protected data. Existing snapshot,
normal collection pause, financial execution and fees remain unchanged.

Only fixed case/path, UTC time, HTTP/content/challenge/quota flags, allowlisted provider
code and format-validated Cloudflare Ray ID are stored (support reference, not a secret).
No raw bodies, rates, key, request headers, arbitrary messages or cookies are logged.
The old currencies experiment is not re-invoked by builds. A finished batch is evidence
of those specific responses, not evidence that prices or API-key validity are resolved.

## Requested public-page schedule — BLOCKED, not activated (2026-11-03)

Owner approved three shared daily public-website observations at 10:00, 14:00 and
18:00 Asia/Damascus, without an API key or per-visitor requests. Between observations,
retain the last valid snapshot and label retrieval time separately from any source
update timestamp. Official Syrian rates and execution/fees remain separate.

Before implementing/activating a recurring job, a credential-free source inspection
was run from the intended GitHub scheduler environment. The public homepage
`https://sp-today.com/` returned 403, `text/html; charset=UTF-8`, and
`cf-mitigated: challenge` at 2026-11-03T20:14:15.808Z.
Evidence: Actions run 41710669306, check/job 126177574242, annotation
"Public source inspection". This was the PUBLIC homepage, not an API endpoint.
The earlier successful interactive fetch-tool read is NOT proof of automated access
from GitHub or Vercel. No production public-site Vercel test has been performed here.

`robots.txt` currently allows `/` and disallows `/api/`; that does not remove the
observed edge challenge or by itself establish republication rights. No challenge
solver, proxy, browser impersonation, cookies or secrets were used/forwarded.

Only the inspection workflow/scripts are staged in draft PR 19. NO scheduled refresh
or parser/ingestion has been activated, no API pause/counters were changed, no static
example prices were installed and no claim is made that the user request is complete.
Keep this PR unmerged until a permitted automated source is reachable and actual HTML
can be validated, then implement/test the three-slot idempotent shared scheduler.
Do not repeatedly redeploy/probe the same challenged page or enable knowingly failing
recurring fetches in place of a working schedule.

## User-requested TLS-client comparison (2026-11-03)

The owner proposed a Chrome/Firefox-style TLS fingerprint rather than the ordinary
HTTP client. A single diagnostic is prepared using hash-locked curl_cffi 0.17.0
with its Chrome profile. It is confined to `https://sp-today.com/` (public HTML),
not an authenticated API route. No key, proxy, clearance cookie, solver, rotating
identity or retry is supplied; TLS certificate verification stays enabled, redirects
are rejected and the decoded body is capped at 1 MiB. Environment proxies are ignored.
If the same challenge is returned, record its status/category/Ray ID and STOP without
reading/solving the challenge or trying other fingerprints.

This diagnostic does not by itself activate the three-times-daily schedule or establish
that Chrome emulation will succeed. Five offline fixture tests verify bounds/stop paths.
The PR inspection workflow runs the one source request; Node's previously failed source
inspection is NOT invoked as an automatic fallback. No production or financial changes,
no third-party service subscription and no source API key access are involved.
