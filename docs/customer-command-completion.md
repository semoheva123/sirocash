> Production update 2026-11-01: migrations 37–41 are now applied and verified (41 total, 28 protected tables). See [production database evidence](production-database-2026-11-01.md). Earlier staged-only statements below are historical. Financial activation is unchanged.

# Customer command integration and real database acceptance — 2026-10-31

## Implemented, not merely an activation flag

- Authenticated `/payments` account page and `/api/financial/{status,prepare,transfer,withdraw}`.
  This is separate from the deliberately unreachable legacy demo-debit endpoints. No demo PIN,
  browser-provided owner, exchange rate, settlement account, fee override, finality or receipt.
- Review server-generated exact transfer/withdrawal economics before a digest-bound device
  approval. Atomic approval consumption and transfer posting / quoted withdrawal reservation.
  Unknown HTTP outcomes retain the exact command or quote for retry; a reserve response is
  never displayed as an on-chain confirmation. Account history is filtered by authenticated owner.
- Fixed read-only Coinbase USDT/USD spot adapter, bounded timeout/body, redirects refused,
  strict asset/currency/decimal checks and integer floor to USD micros. No assumed dollar peg.
  Operator must explicitly approve `SIRO_PRICING_PROVIDER=coinbase-spot-v1`; production source
  availability/accuracy has not been independently accepted. Immutable observed-rate evidence
  is persisted with a DB-checked freshness window before quote creation.
- Automatic `DEPOSIT_VALUE` fair-worker jobs compose already verified final inbox evidence,
  immutable price observation, valuation and ledger credit in one transaction. Replay does not
  reprice or recredit. This consumes the trusted inbox; it is not a new whole-chain scanner.
- Narrow SECURITY DEFINER session/approval bridges with fixed search paths and public execution
  revoked. Custody cannot read AuthSession, passwords or credential storage. Approval consumption
  checks owner/session/RP/digest/expiry and rolls back with a failed financial command.

## Real PostgreSQL defect found and fixed

Independent sessions exposed FK/index/row-lock upgrade deadlocks hidden by serialized PGlite
fixtures. Owner locks now precede account creation; owner/account locks use FOR NO KEY UPDATE
rather than conflicting with prior FK KEY SHARE locks. Quote-owner locking follows the same rule.

The previous worker grants also lacked actual journal RLS policies and locking privileges.
Migration 37 supplies SELECT/INSERT policies, lock-only UPDATE(id) privileges with false write
checks, status-only transaction updates and narrowly privileged balance-cache trigger execution.
Direct cache writes, password/session reads and user mutation remain denied.

## Tests actually executed

- PostgreSQL 17.9: 16 independent backend sessions, concurrent deposit replay, transfer overspend,
  same-command hold/settlement replay, cross-owner platform daily cap race, real lease exclusion,
  customer-session/approval bridges, quote reservation and approval rollback on insufficient funds,
  automatic valuation with 12 concurrent retries and single credit, immutable prices, application
  RLS probes and balanced-journal/cache invariants.
- PostgreSQL 16.2: same independent-session tests plus actual pg_dump / pg_restore into a second
  database. Every public table's complete row digest, account-cache sums, journal balance,
  application isolation and immutable ledger trigger survive restoration. Fixture dump removed.
- CI matrix now runs PostgreSQL 16 and 17 with matching dump/restore binaries from the isolated
  service container, without a production secret or production database connection.
- Price/input/HTTP-disabled boundaries and UI approval-binding checks are in the default suite.

## Deployment distinction

Migrations 37–40 are new staged source changes, not applied to production in this software-only
follow-up. Database production remains at 36. New schema preflight expects 28 protected tables,
so code must not be promoted against the old schema. No paid request, broadcast, production key
loading, monetary policy activation or financial login provisioning occurred.

Private configuration for the new command path: SIRO_CUSTOMER_FINANCE_ENABLED,
SIRO_DURABLE_PASSKEY_ENABLED, SIRO_OUTBOX_WORKER_ENABLED, FINANCIAL_DATABASE_URL,
SIRO_SETTLEMENT_ACCOUNT_ID, SIRO_FEE_ACCOUNT_ID, SIRO_PRICING_PROVIDER; deposit valuation has
its own SIRO_DEPOSIT_VALUATION_ENABLED gate. None is enabled by this patch. USDC withdrawal
pricing/fees are not invented; the new quote path explicitly supports the agreed USDT tariffs.

This work closes specific code/permission/test gaps. It does not certify full-platform launch:
The deposit-discovery and customer-allocation software gaps were subsequently closed; see
`deposit-discovery-completion.md`. Real-device acceptance, live provider acceptance,
credentials/liquidity and funded acceptance must not be represented as completed by these tests.
