# Quote-bound USDT withdrawal reservation and settlement

Private domain preparation only: no public financial route, provider purchase or chain broadcast has been enabled. Migration `20261031120000_quoted_usdt_withdrawals` remains prepared, not remotely applied. No normal-app financial grants are added.

## Exact economics, no implicit peg
`createUsdtWithdrawalQuote` is for a trusted server-side pricing adapter. Its approved rate/reference/expiry must NOT be accepted directly from customer JSON. No live pricing authority is configured. USDT tariffs are gross-deducted 5 TRC20 / 2 BEP20. Gross must exceed the fee. Network recipient is normalized/validated and zero/burn-format recipients rejected.

The immutable quote stores network/recipient, gross/fee/net tokens, explicit USD rate and source reference, gross/fee/net USD, accounting destinations, request key and expiry. SQL permits no economic edits or expiry refresh, only the initial operation attachment. Conflicting reuse of a request key is rejected; creating a fresh key is not a retry.

USD gross/fee are each floored to micros using the approved USD-micros-per-token rate; USD net is the difference so the journal balances exactly. Example: 100 USDT at 0.98 USD/token on TRON reserves 98 USD; 95 USDT is payable, valued at 93.10 USD, and 5 USDT tariff is valued at 4.90 USD. Customer tariff is not an additional gas charge. The returned approval payload names token amounts and their USD accounting values explicitly.

## Atomic authorization and reservation
`reserveQuotedUsdtWithdrawal` requires server-authenticated session/account/RP context, quote ID and bearer approval token. It locks the active auth session and owned quote; consumes the exact durable digest approval in the *same transaction* as wallet reservation, identity/global limits and quote-operation attachment. Limits operate on explicit gross USD. Failure rolls back consumption and the hold. Quote/approval expiry use the SQL clock. Quote expiry only prevents a new reservation; it does not release an already-pending withdrawal.

An exact retry authenticated as the same owner returns the existing operation without requiring a second approval. It never silently changes recipient, economics or creates another hold. Financial idempotency remains in the wallet engine. The digest includes quote ID, request key, recipient/network/asset, token amounts, fee policy, USD gross/fee/net and price reference.

## Three-leg settlement
The existing `submitWithdrawal` transition is still required before any provider attempt. Unknown/timeouts stay submitted/held. Only a private trusted chain/provider reconciler may call `settleQuotedUsdtWithdrawal` after definitive evidence. The current evidence interface is a trusted adapter contract, NOT an RPC verifier. Exact transaction/finality/recipient/amount binding by a real payout reconciler is still required before live use; public confirmed/rejected booleans are forbidden.

Successful settlement posts one balanced transaction: gross USD debit from customer, net USD credit to settlement pool, fee USD credit to revenue pool, then marks the operation completed with a unique provider reference. All ledger accounts are locked in deterministic UUID order using the shared engine helper. Definitive rejection releases the reservation without fee/revenue posting; conflicting terminal evidence fails. The old generic settlement path rejects every `USDTQ:` operation so it cannot discard the persisted split. Once a signed payout exists, the new database guard additionally blocks this quoted settlement until verified payout reconciliation resolves the outbox and the exact payout reference matches; no such chain worker is activated.

## Tests and launch gates
`npm run test:quoted-withdrawal` applies local migrations and covers both tariffs, a non-peg rate, quote immutability/conflicts/expiry, wrong approval, reservation and settlement crash rollback, exact retry, identity-cap rollback, legacy settlement bypass rejection, submit-before-settle, exact three-leg credit, definitive rejection release, balanced journals and denied runtime access. Approval evidence is seeded privately in fixtures; this is not a real-device or mainnet payout test. Full PostgreSQL independent-session concurrency remains required.

Still absent: authoritative live quote issuance/review, public server quote-confirm UX, funded device ceremonies, shared budget/nonce approvals, operating-wallet broadcast worker (durable offline signing outbox is now prepared), resource purchase/delivery reconciliation, real payout evidence binding and complete failure drills. No reserves are automatically refilled and no paid operation occurs here.
