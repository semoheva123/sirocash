# Independent static prices and responsiveness audit

## Release/activation gates

GitHub Pages was initially blocked (GET404/create403 through the integration). The user enabled **Settings → Pages → Source: GitHub Actions**; the repository now reports build_type=workflow at https://semoheva123.github.io/sirocash/.

The first independent collection/publication **41898300158** succeeded at commit d3464b15c0b6903fa72c7e0afac91132e5a1aa04. No wallet database/key/source API key was supplied. The follow-up activation change mounts the independent static ticker only, and has an activation-only public-file/CORS proof for both platform origins. Merge requires that proof plus normal CI. Ordinary future wallet builds do **not** depend on source/CDN availability. Production release identifiers/status are recorded in the PR audit, not inferred from a successful Pages deployment.

Legacy wallet exchange routes, server wake and DB-backed collector remain disabled. Do not re-enable those paths to recover this feature. The initial preparatory implementation deliberately kept the ticker unmounted until separate publication succeeded.

## Isolation implemented

- `static-exchange.yml` fetches **only SP Today public HTML**, once per scheduled job (15-minute schedule, not an accuracy guarantee). The existing literal-new-SYP parser is reused; no guessed conversion or fabricated source timestamp.
- No wallet DB connection, authentication secret, source API key, private key or customer session is passed to the collector. No Vercel wallet endpoint wakes this job.
- Output is only validated `rates.json` and a generic index in the Pages artifact. Failed collection does not deploy or replace prior data. Source failure disables the workflow schedule for operator review rather than re-arming endless requests. `actions:write` is used solely for self-disable, not for financial infrastructure.
- Pinned official upload/deploy actions and hash-locked Python dependencies. Pages configuration is checked before source I/O.
- Browser reads one fixed independent public URL with `credentials:omit`, no referrer, no redirects, a 5s abort, 16KiB body cap, single-flight reads and 15-minute minimum interval. Hidden/offline pages pause. Resume retains the cooldown. Data older than 24h, future retrieval time, wrong units/observation/city, duplicate FX pairs, malformed/oversized data are rejected.
- No exchange SSE, wallet authentication, wallet API or wallet DB read. Price failure retains an earlier valid in-memory snapshot until its age limit, then prices disappear/unavailable. No synthetic values. No continuous ticker animation.

## Responsiveness findings and changes

1. **Proven duplicate:** receiving-identity provider immediately fetched profile data even with a verified bootstrap identity. It now skips that initial duplicate, while explicit reload still reads afresh, owner changes cannot reuse another owner's seed and revoked financial sessions hide the identity.
2. **Prefetch exposure, not a measured historical root cause:** private navigation and wallet links allowed Next automatic prefetching. These links now explicitly disable prefetch, so speculative navigation cannot start those server reads. Actual click navigation and authorization remain unchanged.
3. **Missing diagnostic distinction:** session vs financial/bootstrap failures were not separately timed. Static phase/duration/category diagnostics now identify slow (>1s) and failed reads, throttled per phase/event to 30s. They never log customer IDs, SQL, cookies, messages, URLs, stack traces or balance values. No query retry, session cache or fabricated balance added.
4. **Read-only production observation:** pg_stat_activity showed app **7 idle**, worker **6 idle**, **0 blocked**, no transaction ages at observation. This does not rule out historical connection queueing, network failure, frontend freezes or provider limits. No connection-limit increase or database mutation was made.
5. Financial/notification streams remain change-driven with existing bounded reconnect behavior. Pool max remains one; raising it without queue/capacity measurements would be unsafe. Financial snapshot SQL remains restricted/read-only; write, idempotency, unknown-result and passkey safeguards were not changed.

## Validation and limitations

Focused fixtures cover isolated source transport/unit parsing, failure-retained publication, real disabled wallet routes, static reader concurrency/cooldown/size/schema/teardown, safe diagnostic throttling, server routing and continuity. Browser fixtures exercise the actual wallet presentation in Arabic/English at 320/390/1440 with 4x CPU and intercepted independent-source success/failure; they do not authorize production transfers. Provider lifecycle fixtures test seeded identity, navigation, one shared financial stream, live update and session-end clearing.

Synthetic fixture timings are not production latency, real Next routing benchmarks, source availability, CORS proof or end-user-device acceptance. Exact cause of the reported persistent freeze is **not established**. To complete diagnosis, correlate deployed `ACCOUNT_READ_SLOW` / `ACCOUNT_READ_FAILED` phase measurements with a real occurrence. Check pool queueing/runtime logs and browser main-thread/network timing without exporting cookies, authorization headers or a raw credential-bearing HAR. Do not label an offline toast, idle DB connections or successful build as a proven root cause/fix.
