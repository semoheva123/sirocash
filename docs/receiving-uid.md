# Receiving UID and recipient confirmation

## Shipped in this branch (not deployed)

A receiving UID has nine cryptographically random digits (nonzero prefix) and a
Luhn check digit: ten numeric characters, displayed `1234 5678 97` for readability.
That example is synthetic. It is a public routing identifier, not an authentication
secret. Luhn detects all single-digit errors, but not every transposition and does
not prevent fraud. The namespace has 900 million possible identifiers.

`ReceivingIdentity` is separate from User.id, ledger accounts, addresses and payment
operations. Database uniqueness plus bounded collision retry is authoritative.
The UID/user binding and creation date cannot change; identities cannot be deleted
or reassigned. Existing accounts are backfilled, and an AFTER INSERT trigger assigns
new accounts in the same transaction. No sequence, email-derived name or fabricated
recipient identity is used.

Owners set a display name (required for the new recipient-review flow) and optional
unique lowercase username in Settings → Account information. A username becomes
permanent once chosen. Display names are self-declared, explicitly not verified
legal names. No email/phone/document is disclosed in recipient review. Unnamed
legacy accounts must complete their profile; do not invent names for backfill.

## Flow and bindings

- Wallet/settings show the UID, copy, share and `sirocash:pay:<uid>` QR. The label
  explicitly distinguishes internal receiving IDs from cryptocurrency addresses.
- Input accepts spaces and Arabic/Persian digits. Existing UUID links remain
  accepted for compatibility, but resolve to the same public recipient profile.
- Authenticated PREPARE consumes a committed, database-backed per-owner lookup
  budget (10/minute fixed windows), including malformed/unknown/unnamed/self
  recipients. No prefix search, directory or unauthenticated lookup is exposed.
- A durable session is checked before budget consumption and again before lookup.
  Missing, self, unnamed or invalid recipients fail generically; lookup does not
  create a ledger entry, hold or transfer.
- The server resolves UID to the immutable User.id. Review shows the recipient's
  display name, optional username, UID, and actual `User.kycStatus === VERIFIED`.
  Email verification is never presented as identity verification. Identity document
  collection and AI remain disabled; this feature does not reactivate them.
- Existing device approval covers the canonical User.id, exact amount, request key,
  fee and total via the existing payment digest. Submit uses these prepared values,
  not the editable UID input. The fee remains sender-added 1%, and exact-command
  retries/unknown-outcome guards remain unchanged. Review cannot authorize a
  transfer if recipient metadata is absent.
- Profile updates are authenticated, same-origin, body-bounded, schema-validated
  and budgeted independently (5/minute). Owners cannot set UID or verification.

## Database/deployment boundary

Migration: `prisma/migrations/20261103010000_receiving_uid/migration.sql`.

Apply it with the existing approved migration-owner process before publishing this
application revision. Application and financial-worker credentials cannot perform
DDL. The migration creates identity/budget tables, backfills UIDs, installs permanent
binding/provisioning triggers, enables RLS, revokes public/anon/authenticated access,
and gives only required private-backend grants. Security-definer functions use a
fixed pg_catalog search path and qualified table references. There is no public
UID allocation or direct budget-table access.

`npm run receiving:readiness` is part of production builds. It fails closed when
schema/backfill, public access, immutable/provisioning triggers, unique UID guard,
function isolation or restricted-role grants are missing. It prints no names or
identifiers. Nonproduction builds skip the deployment DB check.

No production migration, deployment, provider write or real transfer was performed
by this implementation task. There is no irreversible publication hidden in the UI
work. Production/device acceptance remains separate from local fixture review.

## Validation

- Full npm test (existing offline regressions plus UID/identity tests): PASS.
- Prisma schema generation and Next webpack production compilation: PASS locally
  (engine-free Prisma generation; not a production database readiness assertion).
- Full isolated PostgreSQL integration: PASS on PostgreSQL 18.6, including migration
  of preexisting users, registration under sirocash_app, permanent unique UID and
  username constraints, correct KYC metadata, canonical review digest/1% fee,
  failed-lookup budget persistence, fixed-window reset, and a 24-session budget race
  with exactly ten accepted calls. Existing financial concurrency/RLS tests pass.
  The same integration test remains in the repository's PostgreSQL 16/17 CI matrix.
- Chromium base suite: 72 bilingual renders at four widths, including Arabic-digit
  UID entry and recipient review. No overflow/runtime exceptions; no device approval.
- Additional UID suite: 10 bilingual wallet/profile flows at five widths plus a
  foreign-owner denial case; exact full UID copy, QR, immutable username, owner-bound
  profile writes without client owner/UID fields, and no horizontal overflow.
- All browser data is visibly labelled synthetic; no production identity is used.

Reproduce the browser suite with the optional tools in `tests/visual/README.md`,
then run `node tests/visual/uid-review.mjs`. Native PostgreSQL acceptance uses the
existing `SIRO_ALLOW_ISOLATED_POSTGRES_TESTS` / `SIRO_TEST_POSTGRES_URL` harness,
which rejects non-local URLs. Generated database/browser files stay in `.cache/`.
