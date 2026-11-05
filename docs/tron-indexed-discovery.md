# TRON indexed discovery (2026-11-05)

Purpose: cut the CPU spent by `/api/internal/deposit-monitor-scheduled` on TRON without weakening credit verification. Before this change every scan fetched full solidified blocks plus the complete receipt set of each block in the window, then filtered for platform recipients. Now candidates come from a recipient-filtered indexed listing and only those candidates are read canonically.

## Trust model (unchanged credit rules)

- The indexed listing (`GET /v1/accounts/{address}/transactions/trc20`, `only_to`, `only_confirmed`, fixed USDT contract, timestamp bounds) is **discovery only**, the same class as BEP20 `eth_getLogs`. Nothing from it is credited.
- Every candidate is still verified against the solidified node by `observeTronUsdtReceipt`: genesis binding, receipt `SUCCESS`, block inclusion, log decoding, confirmation and reorg recheck. Cursor hashes, leases, atomic staging (`ON CONFLICT ("eventKey") DO NOTHING`) and the canonical-hash pause are untouched.
- Window anchors are header-only reads (`/walletsolidity/getblock` with `detail:false`), which also supply the timestamp bounds `[ts(start), ts(end)+2999]` (second-granularity inclusive bounds verified live).
- No cursor skips. An unavailable index, an unexpected recipient, a candidate outside the requested window, or a listing that cannot be completed within the candidate limit leaves the cursor unchanged (`SCAN_INDEX_UNAVAILABLE`, `SCAN_UNREQUESTED_RECIPIENT`, `SCAN_INDEX_CONTEXT`). The window is halved until the listing is complete and within `tronCandidateLimit`; a single dense block falls back to the full canonical block and receipt set.

## Configuration

- `SIRO_TRON_INDEX_URL` (optional, default `https://api.trongrid.io`), HTTPS only, no credentials/query, no private hosts.
- Reuses `SIRO_TRON_RPC_API_KEY` (`TRON-PRO-API-KEY`). Only HTTP 429 is retried, at most twice. Bodies are size-capped; timeouts/malformed bodies fail closed.
- Runtime: `tronWindow 2000`, `tronCandidateLimit 16`, `maxEvents 32`, 110 s deadline.

## Evidence

- Offline: `npm run test:deposit-network` (scanner + `test:tron-index`), `test:chain-network`, `test:deposit-discovery`, `test:financial-worker`, `test:security-boundaries`, `test:financial-isolation`.
- Live keyless public probe (workflow `tron-index-probe.yml`, run 42071867102, public exchange address): genesis header `…b6653dc` equals the production `SIRO_TRON_GENESIS_ID`; parent linkage and 3000 ms spacing; listing of the sample window returned exactly the sample transfer; receipt id/`SUCCESS`/1 log; block header timestamp equals the index timestamp; transaction found at index 537 of 601 in the canonical block.

## Not proven

CPU and quota savings are projections (≈7 TronGrid calls per scan vs ≈80) until Active CPU is measured after deployment. This note is not an activation certificate and changes no customer-facing gate.
