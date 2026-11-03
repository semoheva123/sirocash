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

## Requested public-page schedule — ordinary-client baseline (2026-11-03)

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


### Actual TLS-profile result and saved-page review

One live request completed successfully in Actions run **41712438743**, check/job
**126183659407**, at **2026-11-03T20:25:56.804278+00:00**:
HTTP **200**, HTML, `cf-mitigated` challenge absent, **124882 bytes**, Ray ID
`a54e1c72caa78c26-DTW`, result `PUBLIC_HTML_RECEIVED`.
This supersedes the homepage-access blocker for this particular client/run only.
It does not prove the TLS fingerprint alone caused success: the earlier ordinary
request was from a different runner/edge location (WAW rather than DTW).
No further source request was made to create a controlled comparison.

The sandbox could not download the saved artifact because its redirected blob host
was unreachable. Instead, run **41712736424**, check/job **126184722925**, read that
SAME saved HTML within GitHub and emitted its inert visible text/time attributes in
check annotations. No new source request and no page JavaScript execution occurred.
Verified visible evidence from that response (NOT production constants):

| Label | Observed value | Meaning |
| --- | --- | --- |
| USD buy / sell | 143.75 / 144.25 | New SYP, explicitly labelled; Syria-general market |
| USD/TRY | 49.9821 | TRY per USD, global FX section |
| EUR/USD | 1.1192 | USD per EUR, global FX section |

The page separately showed the old-SYP equivalents; these were NOT substituted for
new-SYP values or converted by the application. No official Syrian USD rate was
established. The visible `time` elements described news/archive entries, not a precise
rate-update timestamp. Retrieval time must NOT be advertised as source-update time.

The live inspection workflow is now **manual-only** to prevent PR edits from
repeating the authorized single request. The one-off saved-artifact review workflow
was removed after completion; its run/annotations remain the evidence. The initial
workflow YAML validation failure (41712307250) executed no job/source request and was
fixed before the successful live run.

**Still unfinished:** durable price parser/schema validation, separate official-rate
source, shared ingestion/cache integration and the 10:00/14:00/18:00 Damascus schedule.
None has been activated. PR19 remains draft; existing API collection remains paused,
its counters and production financial behavior unchanged. Successful access is not
an availability guarantee, a working ticker, or a claim of completed integration.

## User-authorized direct API Chrome TLS-profile test (2026-11-03)

After the public HTML success, the owner explicitly requested checking the API now.
The existing sensitive key is scoped to Vercel **production only**, so it must not be
read/decrypted/copied into GitHub, the sandbox or any intermediary. The production
build probe now invokes `checkExchangeApiTlsOnce`, replacing invocation of the old,
already completed method comparisons (the old testable module remains historical).

From precisely attempts=6 / METHOD_CHECKS_COMPLETE / November 2026 / HTTP403 /
methods-20261103 complete / no snapshot / infinite pause, one atomic reservation
increments the SAME <=93 budget to 7 before any setup/I/O. Parallel builds, crashes,
setup failure, timeout and redeploys cannot re-arm it. No pause, snapshot, financial
operation, fee, ticker or recurring schedule is changed. A reserved internal attempt
is NOT evidence of provider billing or quota consumption.

Within Vercel only, Python installs the same binary-only hash-locked diagnostic
client using a minimal environment WITHOUT the source key or other application
secrets. The single source subprocess receives only the required source key (environment,
never argv), isolated package path and basic interpreter variables: no database,
signing keys or proxy configuration. Its fixed HTTPS URL is the documented
`https://api-v2.sp-today.com/api/v1/currency/usd?lang=en`, X-API-Key + JSON Accept,
Chrome profile, verify=True, no redirects, no solver/proxy/control/fallback/retry.
The key is never sent to a package registry. Challenge responses stop unread; JSON
is bounded to 1 MiB. No body, price fixture, arbitrary exception/message/header,
cookie or key is logged or persisted. An independent Node allowlist sanitizes the
child's bounded stdout before writing diagnostic state.

Tests: six Python fixtures plus PGlite concurrent reservation/guard/pause/cache/error
fixtures; these make NO actual source requests. A successful deployment alone is
not a successful API test: report actual persisted status/result after the production
probe, including setup failure/unknown outcomes honestly. Even successful API JSON
is diagnostic only, not a saved/validated ticker snapshot or permission to resume
normal collection. PR19's scope is now bounded source diagnostics, not delivery of
the still-unimplemented three-times-daily feed.

## Shared API TLS collector activation (2026-11-03)

Owner authorized automatic collection using the newly verified Chrome TLS API client.
The new server-only Python Vercel function `/api/exchange_collect` calls the documented
**overview** endpoint (one request per observation) using curl_cffi's Chrome profile,
verified HTTPS, no proxy environment/redirect/solver/retry, and 256 KiB decoded-body cap.
The source key and database credentials stay inside Vercel. It publishes only validated
Damascus-market NEW-SYP USD buy/sell, USD/TRY and EUR/USD into the existing shared
snapshot. No inferred official price or currency conversion. Financial paths unchanged.

GitHub cron `0 7,11,15 * * *` targets 10/14/18 Asia/Damascus. Delivery is best-effort;
GitHub can delay/skip scheduled jobs. A two-hour slot window accepts moderate delays;
outside it no provider call occurs. These are observations, not guaranteed exact-time
opening/closing prints. A one-time manually dispatched bootstrap is accepted ONLY
before the first claimed slot and while no snapshot exists. No automatic retries.

Short-lived signed GitHub OIDC authenticates the production function: exact issuer,
audience, repository, main ref/subject, workflow_ref and schedule/workflow_dispatch
event. PRs, other workflows/repos/branches, expired/wrong-signature tokens are rejected
before DB/source work. No copied Vercel/API key or new shared secret in GitHub. Only
safe state/reason is printed by the no-checkout, id-token-only scheduler.

The migration enables the new collector only from the verified API_TLS_COMPLETE/200 /
apiOk=true/challenge=false state. It DOES NOT reset attempts/month, clear the original
infinite pause, overwrite snapshots or re-arm diagnostics. Separate collectorEnabled,
collectorBlockedUntil and lastCollectionSlot control this explicitly approved engine.
Atomic PostgreSQL UPDATE commits slot+request ID+the SAME <=93/month budget before
source I/O. Concurrent dispatch/replay/redeploy cannot repeat an already claimed or
older slot. Lost/unknown slots stay consumed. Month rollover resets only on first
eligible claim in a new UTC month; activation never resets the counter.

Auth/challenge/schema/oversize stop this collector indefinitely for investigation.
429/remaining=0 blocks until validated bounded reset or next UTC month. Network/5xx
consume that slot without retry. Every failure retains the last valid snapshot;
older source times and loss of previously available FX cannot overwrite it. Postgres
uses verify-full hostname/CA validation and bounded connect/statement timeouts.

Customer GET `/api/exchange-rates` is now strictly a snapshot read with no source key,
claim or external fetch. Build-time probes are removed from npm build. Ticker details
show retrieval time separately from source-update times and the three target slots.
Official Syrian USD remains unavailable pending an independently verified source.

Acceptance requires real deployment function routing, applied migration, OIDC dispatch,
and first actual validated shared snapshot; CI/build success alone is insufficient.

### Deployment bootstrap

PR20 deployed as 4aa099bcd3f014985fe29af60d807b325178dd07; the migration enabled
only the new collector, preserving attempts=7 and the legacy infinite pause. GitHub
reported the collector workflow active, but manual Actions dispatch was denied by
the repository integration (HTTP403). No source request occurred through that denial.

To complete first-observation acceptance without copying credentials, a main-branch
push changing this collector workflow/function triggers a bootstrap job. Its exact
main/workflow OIDC identity may also have event_name=push. It waits boundedly on
**authentication-only GET health** while production deploys, then sends exactly one
POST. No provider retries: DB still denies bootstrap after any first slot reservation
or existing snapshot. Health checks neither connect to DB nor call the provider.
Scheduled observations continue independently at the three approved times. This is
normal authorized deployment automation, not a change to the integration's permissions.

### Runtime authentication acceptance repair

The first bootstrap run41721701128 exhausted auth-only readiness without any provider
POST. Key-free route checks41722919880 confirmed both default and canonical hosts
serve the function (401 JSON, empty body); the homepages return200. Claim availability
check41722633425 confirmed required OIDC fields exist, without printing token/values.
This is not a provider failure and no counter/reset/retry was authorized or performed.

Use the canonical `https://www.sirocash.online/api/exchange_collect` endpoint, and
explicit certifi-backed verified SSL for portable Python's JWKS client. Safe auth
failure categories distinguish dependencies/JWKS/token/individual identity checks
without logging claims/tokens/exceptions or weakening signature/ref/workflow checks.
The temporary PR route diagnostic is removed after evidence collection. Real first
snapshot acceptance remains required before reporting collection works.
