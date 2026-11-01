# SiroCash · سيرو كاش

A responsive bilingual FinTech wallet prototype with a dark glass UI, animated wallet preview, QR payments, and a PostgreSQL double-entry ledger foundation.

## Run locally

Requires Node.js 20.9+ (Node 22 recommended).

```sh
npm ci
npm run dev
# http://localhost:3000
```

```sh
npm run build
npm start
npm test                 # TypeScript + embedded PostgreSQL ledger tests
npm run test:api         # Requires a running app; mutates the demo balance
npm audit
```

The server binds to `0.0.0.0` for hosted preview access. Client API requests use relative URLs. No remote fonts or imagery are required.

## Routes and working interactions

| Route | Contents |
|---|---|
| `/` | Landing, animated interactive wallet, feature cards, QR payment simulator, security section |
| `/dashboard` | Balance, validated P2P transfer, static/dynamic receive QR, transaction history and type filters |
| `/deposit` | Network selection, copyable **intentionally invalid demo** address and QR, wallet integration explanation |
| `/withdraw` | Network-specific destination validation, daily limit, PIN-confirmed demo request |

The header language toggle persists Arabic/English preference locally and sets `lang`/`dir`. Layouts support mobile, tablet, desktop and reduced motion. Receive QR codes encode a `sirocash:pay:` URI; remove the requested amount to generate a static QR. This is a prototype URI, not a registered wallet protocol.

**Demo PIN: `123456`. Never enter real credentials or send real funds.**

## API contracts

All mutations accept JSON; invalid bodies return HTTP 400 with `{error}`.

- `GET /api/transactions` → `{transactions, balance, demo: true}` (uncached).
- `POST /api/wallet/transfer` → body `{recipient: "SC-1234", amount: 10.50, pin: "123456"}`. Recipient accepts a wallet ID or a phone number without spaces. Returns `{transaction, balance, demo: true}`. Validates positivity, decimal precision, self-transfer, PIN and available funds. Internal fee is zero.
- `POST /api/deposit/generate-address` → body `{chain: "TRC20" | "BEP20"}`. Returns `{chain, address, demo: true, warning}`. Uses deliberately invalid placeholders; no HD derivation or custody keys exist here.
- `POST /api/wallet/withdraw` → body `{chain, recipient, amount, pin}`. Checks the network address shape, PIN, funds and cumulative UTC daily limit ($1,000). Reserves the demo balance and records a PENDING transaction; does not broadcast a blockchain transaction. Address checks are syntactic, not chain checksums or ownership verification.

### Demo boundaries

The APIs are unauthenticated demo adapters using one shared, process-local wallet. Data resets on process restart, is not shared reliably across server instances, and is **not suitable for real funds or personal data**. Seed activity is illustrative; it is not a reconciled persisted journal. Successful new requests create matching signed demo ledger deltas. The dashboard refreshes data on load and updates after its own mutations; there is no WebSocket subscription or cross-tab real-time sync yet. PIN comparison is timing-safe for the public demo PIN only, not production password storage.

Next.js Route Handlers provide the backend for this delivery rather than running a redundant Express server. Contracts and domain boundaries in `lib/` can be moved to an Express service later. WalletConnect is deliberately not represented as working: the connect action explains the missing configuration and never prompts a signature.

## Database and ledger invariants

`prisma/schema.prisma` defines users, accounts, transactions, deposit addresses and **signed ledger entries**. `Decimal(20,6)` preserves USDT precision; UI transfer amounts currently support USD cents.

Prisma alone cannot enforce cross-row balanced journals. The checked-in PostgreSQL migration adds:

- Append-only entries and immutable finalized transactions; corrections require reversing transactions.
- Deferred constraint triggers: at least two postings, zero sum, positive-side sum equal to the declared transaction amount.
- Completed transactions must have postings; failed transactions cannot retain posted funds.
- Posting triggers update account and user balance caches atomically. Direct cache edits and nonzero initial caches are rejected.
- Nonnegative customer balances; a master pool may have a negative signed balance to offset issued credits.
- Unique idempotency keys, chain transaction IDs, derivation indices and per-user chain addresses.

These invariants are tested against embedded PostgreSQL (PGlite). For deployment, run integration tests against the target PostgreSQL version as well, including concurrent transfers, lock ordering and restricted database roles. System administrators can bypass triggers; use least-privilege application roles, deny TRUNCATE and DDL, prevent direct account ownership changes and reserve ledger posting to an audited service.

```sh
cp .env.example .env
# Set DATABASE_URL for your PostgreSQL instance.
npm run db:generate
npx prisma migrate deploy
```

The UI build intentionally does not require Prisma generation or an active database because it runs against demo adapters. Prisma binary downloads were blocked by this sandbox's network allowlist; generation/deploy must run in an environment that can access Prisma's engine distribution. Schema/migration logic was tested with embedded PostgreSQL, not a remote database.

### Production integration checklist

1. Replace the demo adapter with authenticated, authorized, persistent per-user services; add secure session cookies, CSRF protection, rate limits, audit trails, structured errors and observability.
2. Use Argon2id PIN hashes with secret pepper, attempt throttling and account lockout. Add MFA, KYC/AML and regional compliance controls.
3. Resolve recipients securely, enforce ownership and currency consistency, and bind both posting accounts to the transaction parties.
4. Transfer inside a serializable database transaction: lock accounts in stable order, check spendable funds and limits, create idempotent transaction, insert signed postings, finalize status, commit. Retry serialization failures safely.
5. Generate derived addresses in an isolated custody service with unique atomic indices, HSM/MPC-protected signing, hot/cold policies, key rotation and backups. Never store private keys in browser or public environment variables.
6. Add chain watchers, confirmations/reorg handling, replay-safe webhooks, USDT token-contract validation, reconciliation, withdrawal reservations and broadcast/reversal workers. Network gas costs are distinct from zero-fee internal transfers.
7. Add a verified WalletConnect project, approved origins, explicit chain/token checks, transaction simulation and audited signing flows. A WalletConnect ID alone does not implement USDT settlement.
8. Add pagination, server-side transaction filters, realtime updates, production security headers and comprehensive accessibility/end-to-end tests.

## Structure

```text
app/                     App Router screens, layout, global design utilities
app/api/                 Validated demo HTTP adapters
components/siro-app.tsx  Bilingual presentation and interactive wallet flows
lib/                     Demo ledger, schemas, API helpers
prisma/                  PostgreSQL models and invariant-enforcing migration
tests/                   API smoke tests and embedded PostgreSQL tests
```

## Version decision

The requested Next.js 14 dependency reported critical/high advisories in the package audit. This implementation uses **Next.js 16.4.3 / React 19**, retaining the same TypeScript App Router structure, alongside Tailwind CSS 3, Lucide, Framer Motion, Zod and Prisma 5. The installed dependency tree reported zero known vulnerabilities at implementation time. Lockfile is committed for reproducibility.

## Sham Cash and mobile top-up services

- `/sham-cash`: recipient identifier, USD demo amount, review screen, demo PIN, simulated receipt.
- `/mobile-topup`: dedicated Syriatel/MTN tab, Syrian mobile normalization (local `09…`, international `+9639…`, and Arabic digits), demo debit choices, review and receipt.
- Both services appear in dashboard transaction history and can be filtered by `SHAM_CASH` or `MOBILE_TOPUP`.
- `POST /api/wallet/sham-cash`: `{recipient, amount, pin}`.
- `POST /api/mobile/topup`: `{operator: "SYRIATEL" | "MTN", phone, amount: 1 | 3 | 5 | 10 | 20, pin}`.
- Successful responses include `{transaction, balance, demo: true, providerConnected: false}`. Transactions use `SIMULATED` status in the demo adapter; no provider request is made. Amounts are USD demo debits, not carrier packages, real fees, SYP airtime denominations, or exchange-rate quotations.
- Provider IDs, live pricing and fees, real carrier packages, account ownership validation, and FX require official provider APIs. Do not infer carrier from phone prefixes or assume these demo choices are commercial offerings.
- Two incremental PostgreSQL migrations add the service transaction types and require a sender while preserving the existing ledger constraints. Real provider operations should remain `PENDING` until verified settlement; `SIMULATED` is deliberately not a production database status.

## Per-payment passkey / biometric step-up

All four debit APIs now **require server-verified WebAuthn approval in addition to the demo PIN**. This supersedes the earlier PIN-only API examples: direct POSTs without approval are rejected. The UI registers a platform passkey on first use, requests device user verification for each payment, then submits a single-use 60-second approval bound to the endpoint, recipient, amount, operator and network. Challenges expire after two minutes and are consumed on verification. The server verifies the signature, challenge, origin, RP ID, user-verification flag and authenticator counter using SimpleWebAuthn; no biometric image/template is collected.

Browsers cannot guarantee fingerprint-only authentication. Depending on device policy, verification may use Touch ID, Android biometrics, Face ID, Windows Hello, or device PIN. There is no application-level PIN-only bypass if WebAuthn is unsupported, denied or cancelled. HTTPS is required (localhost is allowed for development). If an embedded preview restricts WebAuthn, open the preview URL in its own browser tab. Browser/device policies and cross-origin iframe permissions may still prevent access.

This is **demo-session-scoped enrollment**, not production account security: credentials, counters, challenges and approvals are in process memory, expire with a 24-hour HttpOnly SameSite=Strict session cookie, and reset on server restart. The underlying wallet is still the shared unauthenticated demo wallet. Production must authenticate the account BEFORE enrollment, protect credential additions with existing MFA, persist credentials/counters to that account, use a transactional single-use approval store, add rate limits and recovery/revocation, and enforce step-up for all backend workers and payout paths. Set `WEBAUTHN_ORIGIN` to a fixed trusted HTTPS origin and deploy with trusted proxy configuration. Do not treat this prototype as securing real funds.

`npm run test:api` now checks rejection of unverified/forged approvals across all four endpoints, malformed proofs, cross-origin requests and unchanged balances. A real successful biometric ceremony has not been tested on physical hardware in this sandbox; test supported phones/desktops and cancellation/replay scenarios before production.

## Email-first accounts with Resend

**This section supersedes the previous unauthenticated passkey-enrollment description.** `/auth` now provides bilingual email-first signup/sign-in. Existing and new email addresses receive the same one-time-code flow; an account is created only after successful verification. Phone is optional. Existing ledger seed users can retain a null email; new email users start with zero database balance and no PIN hash. The old `123456` PIN and visible wallet balances remain demo-only, not the new account's funds.

### Configure before sending

1. Provide a PostgreSQL `DATABASE_URL` and apply **all** checked-in migrations (`npx prisma migrate deploy`). Prisma engine downloads require an environment with access to its distribution hosts.
2. Create a Resend API key and put it in server-only `RESEND_API_KEY`. Do not paste API keys in chat, source files or `NEXT_PUBLIC_*` variables.
3. Verify a sending domain in Resend, apply the DNS records it provides, then set `RESEND_FROM_EMAIL`, for example `SiroCash <security@your-domain.example>`. Provider testing restrictions, quotas, pricing and deliverability apply; a free tier is not unlimited global delivery.
4. Generate a random `AUTH_SECRET` of at least 32 characters (command in `.env.example`). Set a fixed trusted `WEBAUTHN_ORIGIN` for production and serve over HTTPS.
5. Set `AUTH_MAX_EMAILS_PER_HOUR` to your budget (default 100 globally), restart the app and test sending to actual recipients. This sandbox cannot deliver through Resend's API because outbound access to that host is not allowed.

No live keys or database connection were supplied. Missing configuration fails closed with a helpful error: no fake code, development bypass or pretend successful delivery is provided.

### Auth API and controls

- `POST /api/auth/request` `{email}` → `{challengeId, expiresIn: 600, resendAfter: 60}` after Resend accepts the email. Acceptance is not a guarantee of inbox delivery; check spam and provider delivery events.
- `POST /api/auth/verify` `{challengeId, code}` → verified user and opaque `HttpOnly`, `SameSite=Strict` session cookie (`Secure` in production).
- `GET /api/auth/session` → current verified account or null.
- `POST /api/auth/logout` → server-side session revocation and cookie removal.

Six-digit codes use cryptographic randomness and HMAC-SHA256 with a server secret, are never logged/returned to clients, expire in ten minutes, permit at most five attempts, and are deleted on success. PostgreSQL row locks serialize consumption. Requests have a 60-second per-email cooldown, five-email hourly limit and a global spend ceiling; counters are durable and protected by row locks. Failed provider sends invalidate their challenge but retain quota usage. Sessions use random 256-bit tokens, persist only SHA-256 hashes, expire after one day and rotate after verification. No session tokens are stored in browser localStorage. SQL/provider error details are not exposed by auth routes.

Add trusted-IP/edge rate limiting, CAPTCHA or risk checks, monitoring and provider webhook processing before public rollout; email-based/global quotas alone cannot stop distributed denial of service or all abuse. The global cap intentionally bounds cost at the expense of availability under attack. Schedule cleanup of old rate-limit rows.

### Scope and remaining security work

Passkey enrollment and debit approvals now require an email-authenticated session, and process-local passkey state is bound to that account ID. **The wallet is still a shared demo**: `/dashboard` and `/api/transactions` expose illustrative demo data, not private customer financial data. Do not fund or treat these as per-user production wallets.

Email signup is not KYC or a complete financial-account recovery system. Passkeys are still session/process-local and need persistent account-linked storage, controlled new-device enrollment, revocation and strong recovery. An email login must not allow silently replacing an established production passkey. Per-user PIN onboarding/hashing, private account routing, ledger account creation and authorization, and KYC remain production integration tasks.

Tests cover migrations, email uniqueness/normalization, optional phone/PIN, attempt constraints, session expiry/revocation, API input validation and rejection of unauthenticated passkey/payment requests. Actual Resend delivery, a full OTP round trip against hosted PostgreSQL, and successful physical-device WebAuthn ceremonies are not tested in this sandbox.

## Premium email + password signup (current flow)

This supersedes the passwordless flow above. `/auth` now has separate **Create account / Sign in** modes, password confirmation at signup, accessible visibility controls, a length/variety meter, email OTP verification, Arabic/English RTL/LTR layouts and a responsive premium wallet illustration. The email transport provider name is not shown in customer UI or configuration/delivery errors.

`POST /api/auth/request` now requires `{email, password, mode: "signup" | "login"}`. Both modes require a 12–128 character password and proceed through email OTP before a session is issued. Signup stores a salted scrypt hash on the pending challenge; the verified account receives that hash only if its email does not already exist. Login verifies the existing hash before sending OTP, then checks it is still current when the OTP is redeemed. Raw passwords never go to the email provider, database or browser storage; they remain in component memory until verification or switching modes (including resending). Use HTTPS. Existing sessions remain valid until expiry/logout.

Migration `20261030040000_password_auth` adds `User.passwordHash`, purpose-bound pending credentials and invalidates old passwordless challenges. Existing passwordless accounts are **not** silently given a password or allowed through email-only authentication. Recovery now exists for verified accounts with an existing password hash; legacy passwordless activation is still a separate release gate and is not silently enabled. The sign-in screen links to `/auth/recovery`. Recovery needs email approval, expires after ten minutes, limits guesses and revokes all sessions. See `docs/production-readiness.md`.

Passwords use Node's salted scrypt (64-byte derived key with Node default N/r/p). Tune and benchmark work factors for production, add breached-password screening and additional trusted-IP/device abuse controls. The visual strength meter is only a local length/variety aid, not proof that a password is uncompromised. The five-hourly-request quota and 60-second cooldown apply to authentication attempts as well as emails, so incorrect credentials also consume quota.

`npm test` includes password hashing/verification tests (requires Node 22.6+ for TypeScript stripping), schema tests and non-overwriting signup-collision checks. Production build and unauthenticated API checks pass. Real provider delivery and a full signup/login round trip against hosted PostgreSQL are still unverified in this sandbox.

## USDT + USDC gateway (current demo)

The deposit and withdrawal screens now offer an explicit asset picker and an asset-specific network allowlist:

| Asset | Networks offered in this prototype |
|---|---|
| USDT | TRON (`TRC20`), BNB Smart Chain (`BEP20`) |
| USDC | Ethereum (`ETHEREUM`), Polygon PoS (`POLYGON`), native USDC only |

The same allowlist in `lib/crypto-assets.ts` drives the client and validation. USDC on TRON, USDC.e/bridged variants and other combinations are intentionally unavailable. Reference for native USDC networks and contracts: https://developers.circle.com/stablecoins/usdc-contract-addresses. The integration does **not** connect to those contracts yet. Before enabling settlement, pin audited token contracts/chain IDs/decimals and monitor only exact token transfer events; an EVM address shape cannot identify the asset or prove the correct chain.

- `POST /api/deposit/generate-address`: `{asset: "USDT" | "USDC", chain}`. Returns the selected asset/network and a deliberately invalid `DEMO` address. No usable custody addresses are generated. Omitting `asset` defaults to USDT for compatibility.
- `POST /api/wallet/withdraw`: accepts the same `asset` plus destination, amount and PIN. A verified single-use passkey approval is still required. Its intent digest now includes the asset as well as network, amount and recipient. Recorded demo withdrawal metadata contains both asset and chain.
- Asset/network changes clear the displayed address, copied state and destination; selections are disabled while address generation is pending. The selected pair is shown again in the withdrawal confirmation.
- Internal balances and ledger postings remain **USD**, not separate USDT/USDC custody balances. Amount input currently uses USD cents; six-decimal token settlement is not implemented. The demo assumes 1 token = 1 USD solely for illustrative debits. This is not a live FX/redemption quote, peg guarantee, gas estimate, or real payout. Withdrawal limits are shared across both assets.
- Apply migrations `20261030050000_crypto_types` then `20261030060000_crypto_assets`: they add the asset/network metadata, per-user asset-aware address uniqueness, compatibility constraints and immutable transaction asset/network fields. Legacy transaction metadata remains null rather than inferring an unknown chain. Existing balanced-journal and USD balance invariants are preserved.

`npm run test:crypto` covers the allowlist, destination formats, approval binding, migrations, invalid metadata rejection and immutability. `npm run test:api` covers generated demo payloads for all four allowed pairs and denial of unverified withdrawals. No real deposit/withdrawal was performed or tested.

### Hosted database status

The dedicated Supabase schema, RLS isolation, and restricted backend role are provisioned. Production server credentials are installed; certificate-verified connectivity passed both Vercel build preflight and the live production readiness check. Trial email settings are configured with `onboarding@resend.dev` for the Resend account email only; actual OTP delivery still needs user verification after deployment. General email signup requires a verified sending domain. See [Supabase setup and verification](docs/supabase-setup.md) and [isolated Vercel deployment](docs/vercel-deployment.md). `/api/health/database` returns 503 until runtime connectivity and auth-schema permissions succeed.

### Signed-in account versus demonstration wallet

The header and wallet overview resolve the actual email session. Signed-in balances come from that user's database row; the shared SC-8901 demonstration balance and activity are never used as an account fallback. New accounts start at their persisted zero balance. Account-specific transaction history, receiving wallets and financial services remain inactive; both UI controls and backend guards prevent registered accounts from posting to the shared demonstration wallet. See [account interface behavior](docs/account-interface.md).

## Account lifecycle and release readiness

- `/auth/recovery`: verified-email password recovery (generic request responses, hashed purpose-specific OTP, bounded attempts, all-session revocation).
- `/settings`: existing-password + email-code password changes, dual-email address changes, per-session/other/all revocation, recorded security events and notification status. Device labels are self-reported and older metadata may be absent.
- `/trust`, `/privacy`, `/terms`, `/support`: bilingual honest preview/status/help descriptions, **not final legal policies or a claim of licensing**. Support contact is shown only when explicitly configured.
- `/operations`: read-only aggregate telemetry, explicitly allowlisted existing admin UUIDs only, denied by default; no financial editing.
- Security events are append-only for the runtime. An atomic notification outbox retains failed attempts. Mail is attempted after security actions; the authenticated retry endpoint requires a provisioned `CRON_SECRET` and a separately configured scheduler. Neither provider acceptance nor queue status is proof of inbox delivery. Trial sender restrictions remain.
- `npm run ops:reconcile -- /secure/path/export.json`: offline normalized-export reconciliation; exact integer micros, no automatic financial writes.
- New tests: `npm run test:account-security`, `npm run test:reconciliation`.

**Real-money services remain disabled.** Domain/sender ownership, approved operator/legal policies/markets, contracted providers/custody, independent security review, actual backup/restore drills, production monitoring/on-call and capacity testing require external decisions and evidence. See [`docs/production-readiness.md`](docs/production-readiness.md) and [`docs/operations-runbook.md`](docs/operations-runbook.md). Do not mistake internal tests, runbooks or offline tools for completed operational certification.
