# Durable signed withdrawal preparation — private, offline only

`prepareSignedWithdrawal` binds the immutable USDT quote to its reserved wallet operation and persists one signed payout. Command fields are only quote UUID, network and a strict allowlist of chain construction fields (TRON reference/timestamp/expiry/fee limit or BSC nonce/gas). Sender/key/policy are loaded by the trusted server configuration; owner/recipient/net amount come only from the database, never command calldata or customer key material.

Production uses `vercelSignerConfiguration`: production environment plus explicit signer flag, fixed public operating addresses, configured key ownership and amount/network-fee ceilings. Tests inject a trusted server dependency with deterministic fixture keys; no HTTP route accepts this dependency. No user keys are used in tests. Never fund fixture addresses.

BSC sends exactly quote net USDT converted from six quote decimals to eighteen on-chain decimals, with chain ID 56. TRON sends net at six decimals. The offline primitives construct only USDT transfer calldata and reject sender ownership, fee, amount and destination violations. No price peg or USD amount is substituted for USDT base units.

## Persistence and recovery
Quote and operation are locked in that order, matching reservation/settlement. Only a bound RESERVED withdrawal can produce a first signature. Signing and insertion of exact signed bytes/TXID, plus transition of the held wallet operation to SUBMITTED, commit together. Nothing is broadcast. A failure before commit leaves the reservation unchanged and no saved payout; offline signing is safe to retry only because no bytes were dispatched. A committed exact retry returns metadata before loading keys or signing. Changing nonce/gas/reference/expiry under the same quote conflicts instead of replacing the authorization.

One unresolved payout per *network* is enforced by both a durable guard lock and partial unique index, including across signer rotation. BSC sender+nonce uniqueness is retained even after terminal state. This is a conservative payout-only guard, NOT a unified nonce manager for native gas funding, administrative transfers or any other operating-wallet signer. Those must be integrated before live operation.

Signed identity/payload/nonce are immutable through SQL UPDATE. Pending or unknown outcomes stay held. Expiration is not proof of failure: TRON retry returns the original pending signature even when old; a fresh timestamp is rejected. No automatic nonce replacement, new quote signing, rejection or hold release occurs.

A database guard blocks both successful and rejected quote settlement while a signed payout remains unresolved. Future verified reconciliation must transition the outbox and use `payout:<network>:<txId>` as the exact accounting evidence reference. The later private `confirmPayout` service can set successful terminal state from validated trusted normalized evidence and post the journal atomically; it has not been activated with a live observer. The guard is not a proof against privileged SQL owners falsely changing terminal state; narrow private worker privileges and real verification remain required.

## What is NOT complete
No broadcaster, readback/finality payout verifier, resource rental/delivery, spend/budget attestation, chain balance/resource verification, unified operating nonce ledger or live worker is provided here. SQL locks/uniqueness tested in PGlite do not establish independent-connection PostgreSQL concurrency. Prepared migration `20261031130000_signed_withdrawal_outbox` is not remotely applied and grants no runtime finance access. No production flag/secret/deployment is changed.

Signed bytes are broadcastable authorizations: keep them private; never return them to a browser or logs. No public route was added. Returned metadata contains only ID/TXID/state.

## Tests
`npm run test:payout-outbox` covers actual offline TRON and BSC signatures, recovered fixture senders, exact quote net/destination, both decimal scales, denied unreserved/wrong-network/extra-field commands, signer-disabled/ownership/fee checks, injected post-sign persistence failure, atomic SUBMITTED hold, no-key retry, pending network exclusion, retained nonce uniqueness, immutable bytes and unsafe settlement blocking. One fixture directly sets final status only to test retained nonce uniqueness; that is NOT real chain confirmation. No network request, energy purchase or broadcast occurs.
