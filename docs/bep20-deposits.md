# BEP20 deposit intake — prepared, not activated

`verifyBep20UsdtDeposit` accepts normalized evidence from a **private trusted observer**, never from an HTTP request supplied by a customer. It does not fetch RPC data or establish RPC authenticity.

Checks: chain 56 on receipt/block; successful execution; matching canonical block height/hash; inclusion at or below the observer's finalized height; finalized height no higher than head; explicit positive minimum-confirmation policy; exact BSC USDT contract `0x55d398326f99059fF775485246999027B3197955`; three-topic Transfer event; canonical padded addresses; assigned beneficiary; no self-transfer; positive bounded uint256 amount. USDT on this contract uses 18 decimals, not TRON's 6.

EVM log indices are **block-global**, not offsets in the receipt array. Duplicate indices, removed logs, malformed evidence and insufficient confirmations fail closed. Transaction/block hashes normalize to lowercase without `0x` for the existing database encoding. Event identities are `bsc:56:usdt:<txHash>:<globalLogIndex>`.

`stageBep20Deposit` resolves ownership from durable BEP20 address assignment, locks that assignment, and persists in `AWAITING_VALUATION`. Exact replay returns the existing record; changed amount/block evidence conflicts and rolls back. It does not post USD, assume a peg, approve sweeps or broadcast.

Migration `20261031080000_bep20_deposit_inbox` is prepared only. Existing inbox rows backfill as TRC20; no historical identities are rewritten. Network-scoped transaction/log uniqueness prevents cross-chain collisions. A composite foreign key prevents linking an inbox row to an assignment on another network. Existing RLS and revoked runtime grants remain intact.

Tests: `npm run test:bep20-deposits` uses synthetic evidence and PGlite. Full `npm test` and `npm run build` pass. These do not establish real PostgreSQL multi-session concurrency or mainnet observer reliability. Standalone `prisma validate` could not run because its engine download host is unavailable in this sandbox; do not describe it as passed.

Still required before live intake: authenticated RPC normalization, receipt-to-block transaction/log binding, trusted finalized/head observations, checkpoint/replay and reorg response; approved valuation/journal posting, narrow runtime grants, production migration review and controlled funded drills. Do not add a public evidence-submission route or enable deposit UI on the strength of these tests.
