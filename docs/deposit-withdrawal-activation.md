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
