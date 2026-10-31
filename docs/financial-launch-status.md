# Financial launch status

## Prepared/tested locally
- Double-entry wallet engine and reservations; 1% sender-added internal fee.
- Private valuation-to-journal composition with explicit approved non-peg rate, inbox-evidence binding, atomic credit/audit state, rollback and replay tests; no pricing authority/runtime grants activated.
- Gated PostgreSQL-backed passkey credentials/challenges, hashed single-use approvals and transaction-local consumption; legacy financial routes still deny. Persistence tests mock WebAuthn verification, not real-device ceremonies.
- Immutable USDT withdrawal quotes: 5 TRC20 / 2 BEP20 gross-deducted, explicit non-peg USD economics; digest approval+reservation composed atomically, identity/global checks reused, balanced net/revenue settlement and generic-settlement bypass guard tested privately. No live quote authority or payout evidence adapter.
- Watch-only TRON/BEP20 address derivation and gated transactional assignment.
- Offline HD child sweep signing and durable signed-sweep preparation outbox, with fixed operating destinations.
- Private successful TRON/BEP20 sweep confirmation bound to persisted signed bytes and exact finalized Transfer evidence, with atomic audit/state and conservative pending retention. Not a dispatcher or live observer.
- Successful live TronZap authentication/balance and energy-cost read probe (no purchase).
- Synthetic TRON/BEP20 receipt validation and durable deduplicated inbox tied to assigned ownership; BEP20 finality/confirmation checks and network-bound replay protection.
- Energy estimation/quote/preparation and treasury refill policy functions.
- Private bounded read-only BSC HTTPS/JSON-RPC transport with request/body deadlines, streaming size cap, strict method/response validation and a disabled-by-default production gate. Integrated HTTP-adapter/observer fixtures pass; no live endpoint provisioned.

## NOT implemented/deployed as live services
- Vercel signer production provisioning, recovery/backup, secure secret ingestion and runtime authorization; offline operating and fixed-destination HD sweep signing primitives exist. Vercel is not an isolated HSM.
- Authenticated mainnet RPC watcher, inclusion verification, replay/checkpoints and reorg reconciliation.
- Reviewed live pricing authority/import/audit policy and restricted runtime posting privileges. Private approved-valuation-to-ledger composition now exists, but no authority is provisioned or live posting enabled.
- Real-device passkey ceremonies, credential management/recovery and authoritative quote-bound command integration. Durable storage/consumption now exists behind a disabled deployment flag; financial use remains blocked.
- Live authoritative withdrawal quote issuance/confirmation UX and chain-verified payout settlement. Private persisted tariff/approval/reservation/net-revenue settlement exists; no live payout adapter.
- Paid energy dispatch, enforced provider price cap and independent delivery reconciliation.
- Sweep/payout/refill workers with atomic budgets, durable signed transaction identities and crash recovery.
- Production BEP20 endpoint/auth provisioning and provider testing, observer scheduling/checkpoints and replay/reorg handling. Bounded transport and receipt observer exist with mock integration tests, not a live provider test.

## Production gates
No prepared migration may be assumed applied. Need narrow database privileges, real PostgreSQL independent-session tests, custody/provider credentials in a reviewed secret store, signer/address matching, complete funded failure drills, and explicit operator approval. Never request recovery phrases in chat or place them in the web app. Existing finance guards remain unchanged. A build or synthetic test success is not proof of safe financial activation.

## Confirmed decisions and remaining operator gates
Both TRC20 and BEP20; fixed public operating/reserve addresses; Vercel-only signing accepted with hot-custody risk. Owner funds operating liquidity and the energy-provider account manually; no reserve auto-refill. Withdrawal limits are 100/1000 USD by identity, 10,000 USD platform/day. The agreed $3 TRON cycle expense is an estimate, not a proven/enforced cap or customer fee.

Still needed before live activation: independent production deposit wallets, verified backup/recovery and secure secret provisioning (never through chat), approved enforceable provider-spend policy, trusted mainnet RPC access, full failure drills and explicit approval of a limited funded test. Public addresses and matched test derivation alone cannot authorize production custody.
