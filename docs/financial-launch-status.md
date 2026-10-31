# Financial launch status

## Prepared/tested locally
- Double-entry wallet engine and reservations; 1% sender-added internal fee.
- USDT withdrawal tariff quotes: 5 TRC20 / 2 BEP20 gross-deducted. Live settlement binding still absent.
- Watch-only TRON/BEP20 address derivation and gated transactional assignment.
- Offline HD child sweep signing and durable signed-sweep preparation outbox, with fixed operating destinations.
- Successful live TronZap authentication/balance and energy-cost read probe (no purchase).
- Synthetic TRON receipt validation and durable deduplicated inbox tied to assigned ownership.
- Energy estimation/quote/preparation and treasury refill policy functions.

## NOT implemented/deployed as live services
- Vercel signer production provisioning, recovery/backup, secure secret ingestion and runtime authorization; offline operating and fixed-destination HD sweep signing primitives exist. Vercel is not an isolated HSM.
- Authenticated mainnet RPC watcher, inclusion verification, replay/checkpoints and reorg reconciliation.
- Approved valuation-to-ledger ingestion with restricted runtime posting privileges.
- Persistent single-use device approval exactly bound to fees/net/idempotency.
- Persisted withdrawal tariff and balanced net/revenue settlement.
- Paid energy dispatch, enforced provider price cap and independent delivery reconciliation.
- Sweep/payout/refill workers with atomic budgets, durable signed transaction identities and crash recovery.
- BEP20 verification/ingestion pipeline.

## Production gates
No prepared migration may be assumed applied. Need narrow database privileges, real PostgreSQL independent-session tests, custody/provider credentials in a reviewed secret store, signer/address matching, complete funded failure drills, and explicit operator approval. Never request recovery phrases in chat or place them in the web app. Existing finance guards remain unchanged. A build or synthetic test success is not proof of safe financial activation.

## Owner decisions needed
Start network; public treasury/operating addresses; independent wallet keys confirmation; chosen isolated signing deployment and approved spend; approved operating/refill/daily limits. Public addresses alone cannot sign. No live service can be completed responsibly without resolving signing and mainnet access.
