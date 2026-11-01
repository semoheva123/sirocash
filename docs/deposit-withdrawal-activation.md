# Deposit and withdrawal activation request — 2026-11-02

The owner requested activation of both customer deposits and withdrawals. This expands authorization beyond internal ledger transfers but does not waive bounded spending, device approval, independent chain/resource proofs, unknown-attempt holds or controlled acceptance. No customer funds were fabricated or transferred.

## Fresh production observations

- Both `DepositNetworkScanner` rows exist but have null `lastSuccessAt` and `lagBlocks`. Neither has proven successful live operation. `EnergyPurchasePolicy.enabled` remains false.
- The financial-worker workflow **now exists on main** (file SHA `138c57ba230b37bf2844ed42329faada80210b98`, workflow ID `403777773`). This supersedes older notes that said it was absent. Its presence alone is not successful scheduling.
- GitHub integration denied Actions secret metadata and manual workflow dispatch with HTTP 403 `Resource not accessible by integration`. Secret presence/matching is unverified, not asserted missing. No alternative was used to bypass this permission rejection. The owner must grant the required GitHub Actions/secret-management permissions via the connection/settings; never paste tokens into chat.
- Read-only production build diagnostic `dpl_4P6bf1W8vrKr9StAAJa1H6ra3boG` matched TRON custody, BSC deposit keys and BSC operating key without signing. Chain56/finality and pinned TRON genesis/solid tip reads passed. TRON bulk receipts matched the complete block transaction set. Real USDT/USD observation passed.
- TronRental authenticated balance was **0 SUN**; 1000 Bandwidth for 1h quoted 600000 SUN including 200000 SUN fixed fee. Zero purchases/broadcasts. This does not prove paid-order scope, delegation delivery or payout liquidity.
- The primary configured BSC endpoint rejected `eth_getLogs` (`RPC_INVALID_ENVELOPE`). Publicnode timed out on the diagnostic range, DRPC rejected it, LLAMA failed transport. No candidate was silently adopted.
- Diagnostic ended with intentional exit 1, preventing promotion; temporary project Build Command was restored to `npm run build`. No activation environment variables changed.

## Software repair

Found `SIRO_BEP20_LOG_RPC_URL` already configured but unused by the production transport. Implementation SHA `d0dea3705e5b62227ddb9818d1432b6a39e5edbd` wires only `eth_getLogs` to that explicitly selected endpoint and requires chain56 there. Primary endpoint still supplies independent transaction receipts, blocks and finality. Existing scanner receipt/hash matching remains unchanged. No primary authorization header is forwarded to the separate log provider; it may use its own server-only `SIRO_BEP20_LOG_RPC_AUTHORIZATION`. No fallback or write method is introduced. The deployment probe now exercises the same production transport.

Tests cover split routing, credential isolation, primary receipt proofs, wrong-chain refusal and transport failure without fallback. Full npm test and local production build passed after the repair.

## Activation boundary

Customer deposits and withdrawals remain closed until the authenticated scheduler works, both scanners demonstrate healthy sustained lag, and bounded real deposit/credit acceptance succeeds. Withdrawals additionally need confirmed operating token/native liquidity, provider funding and bounded paid end-to-end resource/sign/broadcast/confirmation acceptance. Existing approved caps and operating-only acceptance limits remain unchanged. Internal transfers remain independently enabled.

Isolated PostgreSQL 17.11 acceptance was rerun after the routing repair: PASS, 16 sessions, concurrent deposits/holds/settlements, approvals, replay, overspend and cap races, lease exclusion, RLS denials, journal/cache reconciliation and rollback. Server stopped afterwards. This is not funded mainnet acceptance.

Hosted build of the repair (`dpl_HKZhiqkebUtEMCkF5SymPob6B6ve`) rechecked the actual explicitly configured log service and reported **DEPOSIT_READ_BEP20_LOGS:SUPPORTED**, along with pinned TRON solid-tip, complete TRON bulk receipts, BSC finalized chain56 and observed pricing. This supersedes the primary-only log failure as the production discovery-transport result; it does not prove watcher scheduling, range/OR throughput or a real deposit credit. Dedicated restricted DB/event/read preflights and internal-transfer preflight again passed; external activation blockers remained off. The Build Command snapshot included the read-only deposit probe and the project setting was restored to `npm run build` immediately afterwards, with no persisted probe flags.

Final software publication: `dpl_HKZhiqkebUtEMCkF5SymPob6B6ve` READY/PROMOTED, ready `1793568030011`, aliases assigned `1793568030251`. This publishes the discovery-transport repair, **not** deposit/withdrawal activation. No pending deployment or paid operation remains from this request.

## Manual credential verification without monetary execution

The existing `financial-worker.yml` on `arena/34940244-sirocash` now separates event types: manual `workflow_dispatch` performs only authenticated GET to the existing production endpoint; only the `schedule` event uses POST. GET verifies the secret in constant time and returns 204 without DB access or invoking any worker. Manual check rejects every non-204 response, does not follow redirects, discards response bodies, has a 20-second deadline and zero retries, and does not log the credential. Offline mocked-curl regression covers success, 401, redirects, 503, transport failure and secret-length rejection. No matching-secret or real workflow success is claimed before the owner runs it.

Owner instructions: open the Financial worker Actions page, choose Run workflow, select branch `arena/34940244-sirocash` (not the older main workflow), then run. PASS means only credential acceptance, not an enabled deposit/withdrawal worker, scheduler health or paid financial acceptance. No production deployment or activation change is needed for this check because the read-only GET endpoint is already deployed.

## Isolated monitor preparation — supersedes the manual auth-only instructions above

The owner's manual GitHub run returned `AUTH_CHECK_PASS: GitHub credential accepted by production; no database access or financial work`. Matching credentials are now proven; no rotation or secret inspection is required.

Manual dispatch on **arena/34940244-sirocash** now performs that same harmless GET first, followed by a POST to **/api/internal/deposit-monitor**. The dedicated route checks deposit-only isolation before opening the dedicated financial database and directly composes discovery plus valuation, never the full external execution runtime. It can record observed deposits and balanced credit for already-provisioned addresses; it cannot purchase resources, sign, fund, sweep or broadcast. Customer deposit reception remains closed during warm-up. This is no longer an auth-only manual run.

The monitor rejects every signer, broadcast, preparation, gas, resource, energy or withdrawal flag conflict. The deployment adds a READ ONLY preflight validating both configured watch-only XPUBs against the owner's already-confirmed first addresses, exact enabled/origin-verified database vault bindings, the USD settlement pool and two unpaused scanners. `CONFIGURATION_VERIFIED` is not evidence of live scanner health or deposit credit acceptance. BEP scan windows now honor the configured value (100) and reject values outside 1–1000.

The GitHub monitor step requires exact HTTP200, completed state, both-network healthy status, integer nonnegative counters and zero held work. No redirects, transport retries, raw response bodies or credentials are logged. A failed/transport-unknown run is not paid execution acceptance; inspect scanner state before another dispatch. Offline curl mocks cover rejection paths; they do not prove production monitoring.

After the new deployment is READY/promoted, the owner can open https://github.com/semoheva123/sirocash/actions/workflows/financial-worker.yml, choose **arena/34940244-sirocash**, and run **Financial worker**. Expected next success: `DEPOSIT_MONITOR_PASS: scanners healthy; no signing, purchases or broadcasts.` The app connection cannot dispatch Actions (read-only Actions scope), so this single manual step remains owner-operated. The scheduled full-worker POST is separately gated and only runs the deposit-only composition while isolation remains enabled. Scheduled execution follows the default branch, not a manually selected branch; branch preparation alone is not proof of sustained scheduled health.

Local validation: complete `npm test`, `npm run lint`, `npm run build` and dedicated route/workflow regressions passed. No live monitor completion or paid acceptance is claimed from those tests. Identity AI/document intake and external withdrawals remain disabled; no customer reception activation is implied by the worker flag.

### Hosted preparation evidence

Production monitor build `dpl_Fq5n99zKyRXwWsizZtA7WESQ78Bu`, implementation `c5ce42c1e9f40f558783f055b15a9364b2267b45`: READ ONLY preflight returned `CONFIGURATION_VERIFIED`, networks2, scanWindow100, customerReceptionConfiguredfalse, liveScannerAcceptanceRequiredtrue, externalExecutionfalse (event1793569419503). All eight deposit-only isolation conflicts passed the hosted configuration guard. The production outbox-worker setting was changed to true for this monitored deposit-only composition; customer reception and external execution were not enabled. Normal build/install commands remain unchanged.

The read-only database snapshot before monitor dispatch showed both scanners unpaused but `lastSuccessAt`/`lagBlocks` null; EnergyPurchasePolicy remained disabled. These are preparation results, not healthy scanner acceptance. Publication completion must be confirmed separately from build preflight, and a successful owner manual monitor run is still required.

Publication subsequently confirmed **READY / PROMOTED**, ready1793569481493, aliases assigned1793569481719 including `sirocash.vercel.app` and `sirocash.online`. This publishes isolated monitoring, not customer deposit/withdrawal acceptance. No workflow dispatch was performed by the agent.

## Owner-requested small-deposit trial (2026-11-02)

The owner explicitly requested activation to make a small real deposit. Production `SIRO_CUSTOMER_DEPOSITS_ENABLED` (3I83Ofgal2WDOlEf) was set true; all external signing/purchase/broadcast/withdrawal isolation gates were retained. This is deposit-test preparation, not full financial activation or funded acceptance. No customer session was impersonated and no address was fabricated or allocated by the agent.

Deployment dpl_Fq3anoZ6CxdxgaDeLhAz2Cd5T1QF uses the previously tested merge SHA25746e486a108f2f97edf6b719387dfd4d846b26 with normal build/install settings. Local deposit-only/network/discovery/valuation/setup/worker-route tests and TypeScript lint passed after installing dependencies (initial tsx-missing attempt was an environment setup failure). No production financial transaction was sent by these tests.

The fresh DB check still showed last scanner success at 21:46:30/32 UTC with lag0, but **healthy_now=false** for both networks due age. Schedule-event runs remained0. Do not relax the ten-minute freshness gate or manually update scanner timestamps. The owner must run Financial worker on main, require DEPOSIT_MONITOR_PASS, then obtain their own authenticated address from the platform on the exact intended USDT network. If no address appears, stop rather than use treasury/first-derived/example addresses. After a small deposit reaches finality, manual monitor execution may be needed to discover/value/credit it; automatic scheduling remains unproven. Record the transaction hash and verify exactly-once balanced credit before any further deposit. Funds on deposit-child addresses are not automatically swept in this mode, and withdrawal remains unavailable.
