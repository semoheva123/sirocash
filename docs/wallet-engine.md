# Unified wallet engine — prepared, not activated

`lib/wallet-engine.ts` is a private transactional domain service connecting confirmed deposits, P2P send/receive and withdrawal reservations. It is not currently wired to public payment routes. No production migration, runtime financial permission, provider callback, provider payout or live-money activation has been performed.

## Monetary contract

- Accounting currency is USD with exact six-decimal string inputs/BigInt arithmetic. No floating-point balances, assumed USDT/USDC peg or implicit FX conversion. The caller supplies a verified settled USD valuation.
- Posted balance is maintained only by existing append-only journal triggers. Available = posted minus RESERVED/SUBMITTED withdrawal operations; held is shown separately. Never display posted as spendable once reservations are enabled.
- Confirmed deposit: debit a configured, existing USD MASTER_POOL clearing account, credit the beneficiary, complete a balanced journal transaction. Provider evidence must first establish authenticity, finality, asset/network, beneficiary, amount and valuation; a customer assertion or a transaction hash alone is insufficient. Provider references must be namespaced and include the transfer/event/log index.
- Transfer: charge the sender an additional 1% fee (ceil to one USD micro-unit; no floating point), credit the recipient the full requested principal, and credit a dedicated platform revenue MASTER_POOL account with the fee. The revenue account must be trusted server configuration, not customer input or a customer-owned/clearing account. For $100 principal: sender -$101, recipient +$100, platform +$1 in a single balanced journal. WalletOperation.amount denotes principal; feeAmount is separate; Transaction.amount is total sender debit, matching the sum of positive postings. Both principal and fee must fit the available balance. Quote these values and bind them to persistent device approval before activation. Historical operations retain their original fee; do not silently reprice retries.
- Transfer posting: debit the authenticated sender and credit the verified recipient in one database transaction. Recipient IDs are internal, canonical UUIDs. No demo aliases, guessed phone ownership, self-transfer or implicit recipient creation.
- Withdrawal: reserve funds without posting a journal debit. This immediately reduces available balance for subsequent transfers/withdrawals. Mark SUBMITTED before an external attempt. Confirmed payout posts the debit once; definitive rejection releases the reservation with no invented refund/deposit journal entry.
- An ambiguous provider timeout/crash stays SUBMITTED and held. No time-based release, blind rebroadcast or success inference. A reconciler must obtain definitive provider evidence. Provider payout idempotency must use the immutable wallet operation ID. A non-idempotent provider needs a separately reviewed dispatch/reconciliation protocol.

## Transaction and concurrency contract

Use a fresh database transaction per command; the service explicitly selects READ COMMITTED before its first statement. Account row locks are acquired in UUID order; available-balance aggregates are read after the locks, so they see reservations committed while waiting. Every balance-consuming command must follow this lock protocol. Idempotency keys are scoped to the owner, with fingerprints covering normalized amount and exact operation details. A reused key with changed details conflicts; external references are globally unique. Failed posting rolls back the operation and all journal/cache changes together.

The engine assumes an authenticated/authorized caller and authenticated provider evidence. Types and function names are NOT cryptographic evidence. Do not expose these functions directly as public HTTP endpoints, trust body-supplied owner IDs/settlement accounts, accept customer-supplied confirmation booleans, or grant the ordinary auth role unrestricted financial DML.

## Remaining activation gates

1. Review/apply the new WalletOperation migration under the controlled migration role; provision and reconcile a real clearing account. Existing applied migrations must never be edited/replayed.
2. Design narrow audited financial database functions/role grants and RLS, preventing raw arbitrary journal postings, balance changes and operation tampering. Existing `sirocash_app` privileges remain unchanged.
3. Replace in-memory passkey challenges/approvals with persistent, single-use authorization bound to account, session, exact amount, beneficiary, network, fees/valuation and operation idempotency key; consume atomically with posting/reservation. Current demo passkeys deliberately reject financial mutations.
4. Implement verified recipient resolution and link authenticated receive details, available/held/posted balances, direction-aware history and statements to the UI. Never fall back to the shared demo wallet for real accounts.
5. Implement verified deposit ingestion, external payout dispatch/reconciliation, custody/key management, network/address validation, fees, finality and reversal/reorg handling. No provider is selected or connected by this change.
6. Run independent-connection PostgreSQL contention/deadlock/crash and restricted-role/RLS tests, restore/reconciliation drills and operator/compliance approval before financial enablement.

`npm run test:wallet` uses PGlite with actual PostgreSQL ledger triggers and the new migration. Tests cover confirmed deposit funding, atomic transfer, both account balances, exact decimals, duplicate/conflicting keys and provider events, withdrawal reservations preventing subsequent spending, confirmed settlement, definitive rejection release, rollback and journal/cache reconciliation. PGlite serializes transactions: these tests do not prove multi-connection PostgreSQL contention behavior or real provider/device readiness.
