# Production database upgrade — 2026-11-01

Authorized scope: finish database installation for the implemented customer command and deposit
paths. Only SiroCash project `pqzvkhwxarwwcsquhrea` was changed. No wallet secret was retrieved,
no customer balance was changed and no financial operation was submitted.

## Applied and verified

- Before upgrade: 36 completed Prisma migrations; all 36 SHA-256 checksums matched repository
  files (canonical name/checksum-list digest `c4bf643af95bdc4cf879ba370b556895`).
- Applied migrations 37–40 (owner/journal locking authority, private session/approval bridges,
  immutable price observations, deposit valuation queue, address scan cursors and allocation).
  Each schema change and original Prisma checksum registration were in the same transaction.
- Hosted postflight revealed direct default EXECUTE grants to anon/authenticated on the two
  newly created SECURITY DEFINER bridges. PUBLIC revocation alone was insufficient. Applied
  **migration 41** `20261031290000_financial_bridge_isolation` immediately, revoking those
  direct grants too, without editing the already-applied migration 38.
- Final: **41 completed migrations**, manifest digest `f2f903a8e28fa9f121f88eb432a433e3`,
  matching all repository migration files. **28 protected tables, all RLS enabled**; zero
  anon/authenticated table-access or application-role isolation violations.
- Both bridges: fixed search path, SECURITY DEFINER, worker EXECUTE=true;
  anon/authenticated/application EXECUTE=false.
- Worker cannot SELECT passwords/sessions or UPDATE balance caches; its role remains NOLOGIN.
- Ledger operations and entries remained zero before/after; zero journal/cache discrepancies.
  Expense and energy purchase policies remained disabled. No cap approval was inferred.

Read-only production verification request: `9fc96910-b1f6-4bb4-a2e6-2479c7b4b721`.
Migration execution references (37→41): `eb4e686c-8036-4578-be7b-aa55bf169d80`,
`6c89cae3-b74e-4338-aa8c-f15e58b4b56d`, `ca549982-0784-4c95-8057-fb42ef3a5e38`,
`f453ffb1-31a4-4927-9015-13524a82d8b6`, `a45f0780-3f7d-4116-9633-794370563df9`.

The hosted-default-grant fixture now covers FUNCTIONS as well as TABLES. Build/schema preflight
checks both bridges and refuses deployment if anonymous, authenticated or application execution
is reintroduced. A deliberate regrant test verifies the diagnostic actually rejects it.

Database structure completion is not funded financial activation: dedicated worker login,
verified/enabled vault configuration, provider readiness, exact approved budgets and live/device
acceptance remain separate controls. This upgrade did not turn any of them on. It is not a
backup/restore of production customer data; restore drills use isolated fixture databases only.
