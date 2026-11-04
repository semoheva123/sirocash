# Web Push, installation and public search — 2026-11-05

## Authorized scope
User explicitly approved limited device subscription/delivery tables and server Web Push keys. No financial activation, signing keys, balances, historical notification backfill or paid vendor. Existing Supabase pg_net, pg_cron and Vault are used; no extension or additional hosting is installed.

## Installation
`/manifest.webmanifest` provides standalone Android/iOS installation, local 192/512/maskable and Apple icons. `/install` and Settings → App & notifications expose installation. Android uses its install prompt when supported; iPhone uses Safari → Share → Add to Home Screen. This is a PWA, not an App Store/Google Play listing. No fetch handler, account/balance caching or offline financial actions. `/sw.js` is revalidated with no-store and handles generic push and same-origin notification navigation only.

## Consent, privacy and delivery
- Explicit click only, no automatic notification permission. iOS/iPadOS 16.4+ requires a Home Screen app and system permission; focus modes/connectivity can suppress delivery.
- Authenticated same-origin size-bounded subscription endpoints; known HTTPS push services only; key validation; at most five devices per owner. An endpoint cannot be moved to another live owner. Registration is idempotent and bound to an active AuthSession, not just a browser permission bit.
- AccountNotification insert creates owner-only queue rows. No history backfill or staff-broadcast fanout. Optional wake/enqueue errors cannot roll back financial work. pg_net makes the HTTP wake only after COMMIT, using an independent Vault authorization secret. Coalesced 15-second wakes; one-minute pg_cron recovery/retention job configured operationally after deployment.
- Dispatcher commits SKIP LOCKED claims before network I/O, max 50 per call/five concurrent sends, five-second provider timeout. No automatic replay of uncertain sends. 404/410 deletes obsolete subscriptions; old claims fail closed. Provider acceptance is **not device receipt**. Generic copy contains no balance, amount, email, UID, operation reference or credentials.
- Revoked sessions cascade-delete subscriptions and jobs; expired sessions are excluded and rechecked before send. An already accepted alert cannot be recalled. Optional metadata cleanup removes expired subscriptions and delivery rows older than seven days. No endpoints or keys are logged.
- Production build verifies paired VAPID keys, runtime role and private schema. Private key and worker authorization are sensitive server-only variables. Preview remains disabled.

## Public discovery
Canonical origin: https://www.sirocash.online. Public Arabic landing/features/install and a real English `/en` page have canonical/OG/social metadata and appropriate language alternatives. Structured WebSite data uses the request CSP nonce. Sitemap includes only public pages; robots and X-Robots-Tag exclude APIs and account/auth/transaction paths. No fake ratings, licenses, country availability, regional doorway pages, country keyword stuffing or invented update dates.

Search Console/Bing ownership submission and actual indexing/rank are not established by these changes. Good technical SEO cannot guarantee any position or inclusion in every search engine. Arabic-language reach does not establish legal financial availability in any Arab country.

## Verification and limits
Complete offline regression suite and production build passed locally; new PGlite tests cover full migrated schema, scoped registration, SSRF/key rejection, queue rollback/failure isolation, expiry/revocation, no replay and grants. Client tests cover explicit opt-in/out and install cancellation; VM tests cover same-origin push-click target and no cache handler. Local HTTP smoke verified public pages, English root language, manifest, SW, sitemap/robots and unauthenticated push refusal. No physical Android/iPhone receipt or search-engine indexing is claimed. See release PR for CI and production promotion evidence.
