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

The direct database hostname returned only an IPv6 address during inspection. Do not guess a pooler hostname, assume Vercel IPv6 egress, or deploy an untested direct connection.

1. Open the **new** Supabase project's **Connect → Session pooler**. Supply the **host, port, and username pattern only**, or a screenshot with the password hidden. These are configuration metadata, not passwords. Confirm the actual endpoint assigned by Supabase; do not substitute an endpoint inferred from region names.
2. Enable LOGIN for the existing least-privilege role and issue a cryptographically random password through the approved administration/secret-manager flow. Keep the resulting server connection string in SiroCash's Vercel `DATABASE_URL` only. The pooler username must follow Supabase's displayed convention for a custom role.
3. Use certificate-verified TLS. If the authentic provider CA is needed, install its PEM as `DATABASE_SSL_CA`. In production the shared pool enforces certificate verification; URL SSL flags cannot disable it. Session pooling is the initial choice; switching to transaction pooling needs its own compatibility check.
4. Install random `AUTH_SECRET`, `RESEND_API_KEY`, and a verified-domain `RESEND_FROM_EMAIL` through Vercel settings or an approved secret-management flow, never chat/Git. The fixed production `WEBAUTHN_ORIGIN` has been set on SiroCash only.
5. Explicitly redeploy **SiroCash**, then check `/api/health/database`: 200 `ready` means the actual server connection can resolve the auth schema with its runtime privileges. 503 `not_configured` or `unavailable` is a failure, not a successful integration. This endpoint never returns records, credentials, connection URLs, or raw database errors.
6. Complete a real signup → email OTP → login → logout test. Database readiness alone does not verify email delivery or WebAuthn hardware behavior.

The actual user-supplied Session Pooler is `aws-0-eu-west-1.pooler.supabase.com:5432`, database `postgres`. Runtime uses the custom-role username `sirocash_app.pqzvkhwxarwwcsquhrea`, **not** the administrator username. Production-only `DATABASE_URL` and a freshly generated `AUTH_SECRET` are installed as sensitive variables on SiroCash only. The connection deployment has been requested; successful runtime readiness still requires verification. No email-provider key has been installed yet. Financial operations remain simulated and passkey state remains process-local; database provisioning does not change those limitations.
