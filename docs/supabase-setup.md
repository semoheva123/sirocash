# Dedicated SiroCash database

## Applied on 2026-10-30

Target: `pqzvkhwxarwwcsquhrea`, eu-west-1. The old OPX database was not modified.

The eight application tables are installed: `User`, `LedgerAccount`, `Transaction`, `LedgerEntry`, `DepositAddress`, `AuthSession`, `EmailChallenge`, `EmailRateLimit`.

All eight tables (and the Prisma migration registry) have RLS enabled. PUBLIC, `anon`, and `authenticated` cannot read the application tables. Authentication is implemented by the server, not by direct browser access to Supabase/PostgREST. Do not give browsers a service-role key or add permissive public policies.

A dedicated `sirocash_app` role was initially provisioned **NOLOGIN**. After the user supplied the actual Session Pooler endpoint, LOGIN was enabled with a fresh random password and a 12-connection role limit. The credential is installed as a sensitive, production-only Vercel variable. It cannot bypass RLS, create databases/roles, or post to the financial journal. Explicit backend-only policies and column/table grants permit the existing email/password/session queries, not direct balance updates, user deletion, or PIN-hash reads. Never use the administrator connection as the application's runtime credential.

### Migration bookkeeping

The connector applied equivalent ordered SQL in five atomic Supabase migrations:

| Version | Name |
| --- | --- |
| 20261030173017 | sirocash_ledger_invariants |
| 20261030173032 | sirocash_payment_and_crypto_types |
| 20261030173043 | sirocash_email_auth_and_asset_metadata |
| 20261030173139 | sirocash_backend_access_controls |
| 20261030173317 | sirocash_prisma_baseline |

The enum additions were committed before constraints referenced the new values. The first three application groups include restrictive RLS/grants in the same transactions as table creation. `_prisma_migrations` records the SHA-256 baselines of the eight repository migration files (through `20261030070000_database_access`), so subsequent administrator-run Prisma migrations must not replay the original schema. Do not modify those applied files. Runtime `sirocash_app` intentionally cannot read or write the migration registry; migrations require a separate administrator connection.

### Verified

- Hosted PostgreSQL: balanced journal posting, user balance projection, rejection of unbalanced entries, journal edits, direct balance edits, and finalized transaction metadata edits.
- Hosted test fixtures were rolled back; no starting balances or demonstration accounts were retained.
- Hosted catalog: all nine public tables have RLS; `anon` and `authenticated` have no SELECT access.
- Local PostgreSQL-compatible tests: every migration, actual restricted-role auth SQL, rejected financial access, public-role isolation, and role attributes.

## Connection activation

- The user confirmed Session Pooler host `aws-0-eu-west-1.pooler.supabase.com`, port `5432`, database `postgres` on 2026-10-30. The direct database hostname resolves to IPv6 only; no pooler hostname was guessed.
- Runtime username: `sirocash_app.pqzvkhwxarwwcsquhrea`, **not** `postgres.pqzvkhwxarwwcsquhrea`.
- The restricted role has LOGIN enabled with a fresh random password and a 12-connection role limit. Administrator credentials were neither requested nor copied.
- `DATABASE_URL` and random `AUTH_SECRET` are sensitive **production-only** Vercel variables. `DATABASE_SSL_CA` supplies the authentic public Supabase certificate. `WEBAUTHN_ORIGIN` is the fixed production HTTPS origin. No secrets are in Git.
- The credentialed Vercel build preflight passed at 2026-10-30 17:47:50 UTC for deployment `dpl_EPUtkXqnFBbNWZBvv6rZRajZCcWK`, source `e85fd0b872cc0f688dcd7c50e1717bc26dc0436f`: verified TLS, correct restricted runtime role, and auth-schema permissions. After promotion, the live `https://sirocash.vercel.app/api/health/database` endpoint returned `{"database":"ready"}` (cache-busted request on 2026-10-30 at approximately 17:49 UTC), verifying connectivity and auth-schema permissions in the running serverless function as well as the build.
- Session mode is used as supplied. Any later switch to transaction mode requires a separate compatibility check.

### Trial email setup

On 2026-10-30 the user chose Resend's trial sender. A production-only sensitive `RESEND_API_KEY` was already present in SiroCash's Vercel settings; its value was not retrieved or copied. `RESEND_FROM_EMAIL` is now `SiroCash <onboarding@resend.dev>`. Redeployment is required for settings changes to reach the running application.

This sender is for testing with the email address belonging to the Resend account, not unrestricted customer signup. The account owner must complete signup → email OTP → login → logout and confirm actual receipt. No delivery or end-to-end auth success is claimed solely from environment configuration. If a key was disclosed in chat, revoke it and replace it directly in Vercel; do not send its replacement in chat.

General registration still requires a verified sending domain and an appropriate sender address. Database readiness does not verify email delivery or WebAuthn hardware behavior.

Financial operations remain simulated and passkey state remains process-local. Provisioning and connecting the database does not make the financial prototype production-ready.

### TLS activation diagnostics

The first credentialed production connection failed certificate verification. The deployment preflight correctly blocked promotion with `TLS_CERTIFICATE` and did not print raw errors or credentials. The public Supabase Root 2021 CA was retrieved from the HTTPS URL used by the official Supabase dashboard, its X.509 fingerprint and self-signature checked, and installed as production `DATABASE_SSL_CA`. See [certificate provenance](../certificates/README.md). Verification remains enabled. After installing the CA, the subsequent Vercel build preflight and the live production readiness endpoint both passed.

`npm run db:verify` performs a zero-record auth-schema query with the same connection options as runtime and rejects a superuser, RLS-bypassing role, or a role other than `sirocash_app`. Builds run this preflight when `DATABASE_URL` exists; unconfigured previews skip it. The per-instance pool is capped at one connection with finite connection/query timeouts.


## Financial foundation installation — 2026-10-31
The later financial migrations through 20261031190000 are now applied and recorded: 31 Prisma migrations total and 20 new protected tables. See `financial-database-installation.md` for exact Supabase versions, hosted rollback drills, permissions, and remaining launch blockers. Earlier statements here about process-local passkeys or absent finance schema are historical, not the current schema state. Do not replay the baseline or the installed finance batches.
