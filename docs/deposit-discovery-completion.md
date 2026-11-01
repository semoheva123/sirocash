> Production update 2026-11-01: migrations 37–41 are now applied and verified (41 total, 28 protected tables). See [production database evidence](production-database-2026-11-01.md). Earlier staged-only statements below are historical. Financial activation is unchanged.

# Deposit discovery and customer allocation — software completion

## Customer path

`POST /api/deposit/generate-address` now allocates a real watch-only derived USDT address for
an authenticated durable session, on TRC20 or BEP20. Anonymous demo addresses were removed.
The owner is never taken from JSON. The server selects the approved vault; clients cannot send
vault IDs, keys, derivation indices, origins, starting blocks or chain evidence.

Allocation serializes the vault index and owner, inserts the assignment and initial scan cursor
atomically, and reuses the original address across retries. Worker privileges allow new assignments
and exactly one vault-index increment, not changes to xpub, network, enablement or verification.
The `/payments` page presents network-specific deposit-address requests alongside actual balances.
A paused or disabled assignment is not presented as an active receiving address.

New addresses start scanning at the observed final/solid height **before the address is displayed**.
Existing assignments without a cursor are never silently initialized at today's tip. A trusted
historical starting block is required, and the scheduler can bootstrap those assignments without
the customer reopening the page. The start must be at/before the first potentially received
transaction; it cannot be inferred reliably from an xpub or assignment time.

## Autonomous scheduler path

`DEPOSIT_SCAN` jobs are integrated into the existing durable, fair scheduler, alongside
`DEPOSIT_VALUE`. No second service or host is required.

- BEP20: fixed USDT contract, strict one-block recipient-filtered `eth_getLogs`, chain 56,
  finalized-tag and minimum-confirmation checks. Every candidate is revalidated against its
  successful receipt, block inclusion and canonical hash before trusted inbox insertion.
- TRC20: pinned genesis, solid node blocks and transaction receipts, fixed USDT Transfer logs,
  assigned beneficiary and successful transaction inclusion. No explorer pagination or
  latest-block fallback is used.
- `DepositScanCursor` persists block, within-block offset, current/previous canonical hashes,
  lease claim/expiry and review pause. Each tick processes at most three log/transaction entries.
  Verified inbox insert(s) and checkpoint advancement commit together. Failed RPC, abort,
  persistence error or lost lease cannot advance past an uncommitted event. Crash retries are
  protected by the existing immutable event identity/fingerprint and unique inbox keys.
- A changed current or previous finalized block pauses the cursor. It is not automatically
  rewound, credited again or refunded. A paused conflict prevents new customer financial commands
  and automatic network jobs, and prevents uncredited affected inbox entries being valued.
  Review requires trusted operator reconciliation; there is no customer resume/delete endpoint.

RPC data remains a trusted-provider assertion, not a cryptographic light-client proof. No code
can discover transfers deliberately omitted by a malicious provider. Oversized/malformed provider
responses or out-of-bound deposits fail closed without checkpoint advancement.

## Configuration and deployment

Migration 40: `20261031280000_deposit_discovery`. All 40 migrations are covered by isolated tests;
production migration application is a separate operation, not performed by this patch.
Schema verification now expects 28 protected financial/auth tables.

Existing private runtime configuration remains required: financial DB credential, worker gate,
read-only RPC gate/endpoints, pinned TRON genesis, BEP20 confirmations, independently verified
enabled watch-only vaults, settlement/fee accounts and approved pricing source.

New explicit flags (not enabled by source changes):
- `SIRO_DEPOSIT_DISCOVERY_ENABLED=true`
- `SIRO_CUSTOMER_DEPOSITS_ENABLED=true`
- Existing `SIRO_DEPOSIT_VALUATION_ENABLED=true`, approved `SIRO_PRICING_PROVIDER=coinbase-spot-v1`
  and customer/durable finance gates are required before displaying a new receiving address.
- `SIRO_TRC20_DEPOSIT_VAULT_ID`, `SIRO_BEP20_DEPOSIT_VAULT_ID`: trusted vault UUIDs.
- Optional for historical assignments only: `SIRO_TRC20_DEPOSIT_START_BLOCK`,
  `SIRO_BEP20_DEPOSIT_START_BLOCK`. Once a cursor exists these do not rewind it.
- Existing `SIRO_TRC20_MAX_TOKEN_BASE_UNITS`, `SIRO_BEP20_MAX_TOKEN_BASE_UNITS` bound receipt
  validation; this patch does not invent or activate financial spending limits.

Only the agreed USDT contract is ingested on these two networks. No USDC contract/fee is invented.
No reserve wallet is assigned or scanned. No paid resource purchase, native funding, signing or
transaction broadcast is performed by discovery or address allocation.

## Executed acceptance

`test:deposit-discovery` is part of `npm test`. The same acceptance function is executed by
`test:postgres-financial` with the actual restricted financial-worker role, not a superuser:

- Eight concurrent requests per network produce one address and one derivation-index increment.
- Client-supplied owner fields and non-unit vault index changes are rejected.
- Historical assignments require an explicit start and can bootstrap automatically.
- Partial blocks resume at the saved offset; RPC and checkpoint failures preserve prior progress.
- Concurrent scans respect the durable lease; replay preserves the existing inbox identity.
- Both networks reach authoritative non-peg valuation and balanced ledger credits.
- A changed canonical hash pauses scanning and blocks affected pending credits/address display.
- Discovery alone cannot post a ledger credit.

Real PostgreSQL 17 acceptance, PostgreSQL 16 acceptance plus actual dump/restore, full regression,
TypeScript and production build are run locally. CI runs the same PostgreSQL 16/17 matrix.
Live-provider accuracy/availability, real device and funded acceptance are deliberately not claimed.
