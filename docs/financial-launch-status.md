# Financial launch status

> أحدث تحقق فعلي (2026-10-31): نجح فحص الجداول العشرين والعزل والصلاحيات عبر اتصال الإنتاج الحقيقي بدور sirocash_app. تطابقت مفاتيح TRON وحساب إيداع BEP20، ثم نجح أيضًا فحص مفتاح تشغيل BEP20 بعد إضافته في الفحص الثالث dpl_2DQGu3kGHB1qgwSMu8Go5PD43ajQ، دون توقيع. تفاصيل الدليل وحدود النتائج في [تجهيز الإنتاج](production-preparation.md). أي إشارة لاحقة إلى انتظار هذا الفحص أو تعذر تشغيله تصف حالة تاريخية سابقة. الإطلاق المالي ما زال NO-GO.

> تحديث لاحق في 2026-10-31: طُبّقت البنية المالية فعليًا؛ 31 ترحيلًا و20 جدولًا محميًا، مع اختبارات مستضافة أُلغيت بعد التحقق. الأقوال أدناه عن غياب الجداول تصف الفحص السابق فقط. انظر `financial-database-installation.md`. قرار عدم الإطلاق المالي باقٍ لأسباب التشغيل والتحقق الأخرى.


## Prepared/tested locally
- Double-entry wallet engine and reservations; 1% sender-added internal fee.
- Private valuation-to-journal composition with explicit approved non-peg rate, inbox-evidence binding, atomic credit/audit state, rollback and replay tests; no pricing authority/runtime grants activated.
- Gated PostgreSQL-backed passkey credentials/challenges, hashed single-use approvals and transaction-local consumption; legacy financial routes still deny. Persistence tests mock WebAuthn verification, not real-device ceremonies.
- Immutable USDT withdrawal quotes: 5 TRC20 / 2 BEP20 gross-deducted, explicit non-peg USD economics; digest approval+reservation composed atomically, identity/global checks reused, balanced net/revenue settlement and generic-settlement bypass guard tested privately. No live quote authority or payout evidence adapter.
- Watch-only TRON/BEP20 address derivation and gated transactional assignment.
- Offline HD child sweep signing and durable signed-sweep preparation outbox, with fixed operating destinations.
- Offline quoted withdrawal signing/outbox on both networks: exact DB net/recipient, saved signed bytes/TXID plus SUBMITTED hold atomically, immutable payload, no-key retry, unresolved-network/nonce constraints and unresolved-signature settlement guard. No live payout broadcaster/finality observer or budget/resource authorization.
- Private successful TRON/BEP20 sweep confirmation bound to persisted signed bytes and exact finalized Transfer evidence, with atomic audit/state and conservative pending retention. Not a dispatcher or live observer.
- Successful live TronZap authentication/balance and energy-cost read probe (no purchase).
- Synthetic TRON/BEP20 receipt validation and durable deduplicated inbox tied to assigned ownership; BEP20 finality/confirmation checks and network-bound replay protection.
- Energy estimation/quote/preparation and treasury refill policy functions.
- Private bounded read-only BSC HTTPS/JSON-RPC transport with request/body deadlines, streaming size cap, strict method/response validation and a disabled-by-default production gate. Integrated HTTP-adapter/observer fixtures pass; no live endpoint provisioned.

- Private dispatch orchestration: separate signature-bound resource/budget approval required; durable pre-send UNKNOWN claim, exact-byte injected adapter, bounded timeout, ACK-only status and no-resend retry. Mock adapters only; no mainnet send adapter, approval authority or finality worker configured.

- Private successful payout finality-to-journal composition on TRON/BSC: saved signature and exact receipt matching, immutable audit, atomic outbox+net/revenue settlement, rollback/replay and unknown-result recovery tested with synthetic receipts. No live finality observer configured.

- Private fresh-resource-evidence gate and native payout expense reservation: disabled-by-default per-network policy, per-payout/UTC daily caps, unresolved prior-day carryover, atomic signature-bound dispatch approval, and conservative settled expense attribution. Observations simulated; no live observer or pre-purchase rental budget.

- Unified pre-sign TRON rental intents for both customer deposit sweeps and operating payouts, DB-bound transfer identities and shared unresolved-sender exclusion. Planner handles both; no paid order/delegation or live sweep resource dispatch gate.

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
Both TRC20 and BEP20; fixed public operating addresses; the entire former reserve wallet is now the deposit wallet on both networks, and the new reserve is unconfigured/excluded; Vercel-only signing accepted with hot-custody risk. Owner funds operating liquidity and the energy-provider account manually; no reserve auto-refill. Withdrawal limits are 100/1000 USD by identity, 10,000 USD platform/day. The agreed $3 TRON cycle expense is an estimate, not a proven/enforced cap or customer fee.

Still needed before live activation: verified production deposit account bindings (owner chose one deposit seed with separate TRON/BSC hardened accounts), verified backup/recovery and secure secret provisioning (never through chat), approved enforceable provider-spend policy, trusted mainnet RPC access, full failure drills and explicit approval of a limited funded test. Public addresses and matched test derivation alone cannot authorize production custody.

## Security review follow-up — 2026-10-31
Patched Axios dependency resolution with zero known audit findings at review, strict production origin and sanitized HTTP errors, conservative browser/API headers, removed the reassigned TRON reserve mapping, and added fixture-tested private no-signature custody preflight plus offline CI. See `security-remediation.md`. These are local tested safeguards, not proof of production key binding or a live financial launch approval. Signing remains disabled; no remote migrations/deployment or paid requests were made.

## Deep review follow-up — 2026-10-31
Prepared migration 20261031180000 requires matching final evidence before terminal payout confirmation/settlement and blocks unsupported signed-payout rejection. Dispatch rechecks approval expiry after durable claim; resource/approval SQL freshness uses the current clock and TRON account activation is strictly boolean. Regression tests exercise genuine synthetic final confirmation instead of directly marking a payout confirmed. Full local tests/build/audit pass. See `deep-security-review.md`; no new production check/deployment/migration occurred.


## Verified production check — 2026-10-31
See `launch-verification.md`: production remains ed96a6ff, signer flag false, migration history stops at 20261030100000, and six core financial tables are confirmed absent by read-only catalog queries. Financial launch is NO-GO. BEP20 private deposit-key preflight is now fixture-tested but actual production binding remains untested.
