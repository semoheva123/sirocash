# Read-only BEP20 receipt observer — private preparation

`observeBep20UsdtReceipt` takes an operator-controlled RPC transport, a transaction hash and trusted intake policy. It calls only `eth_chainId`, `eth_getTransactionReceipt`, `eth_getBlockByNumber` and `eth_blockNumber`. No broadcast, signing, credentials, provider purchase or ledger mutation occurs.

It requires chain 56; successful receipt; receipt hash/height matching a numbered canonical block; the transaction at the claimed block transaction index; every receipt log bound to the same transaction, index, block hash and height; strict RPC quantity/hash encoding; nonremoved logs; finalized-tag support; and configured confirmation/amount/recipient checks from the existing USDT validator. It re-reads the numbered block after validation and rejects a changed hash. `finalized` failure is never silently replaced by `latest`.

Returned normalized evidence may be passed by a private worker to intake or sweep confirmation. It must never come from customer JSON, a browser-configured endpoint or arbitrary public transport. A node can lie consistently: matching RPC assertions are not a cryptographic inclusion proof. This code does not establish ancestry of the finalized block or protect against later deep reorgs. Scheduling, checkpoints and incident handling remain necessary.

A bounded HTTP transport is implemented below, but no production endpoint is configured. Provider consistency, endpoint review and rate limiting remain operator/worker requirements. Mock tests cover successful normalization, wrong chain, missing/failed receipt, mismatched log context, removed log, missing transaction inclusion, unavailable/insufficient finalized evidence, malformed quantities and observation-window reorg. They do not prove provider behavior or BSC mainnet availability.

No migration is added by the observer or the TRON confirmation extension. Existing prepared finance migrations remain unapplied remotely. Financial UI/permissions remain gated.

## Bounded HTTPS transport

`createBep20ReadRpc` now provides the private HTTP transport: HTTPS only, no URL userinfo/fragment/local IP literals, no redirects/cache, optional server-side Authorization, a 10-second request+body deadline, 2 MiB default body cap (also enforced while streaming), JSON-only content, exact JSON-RPC 2.0 response ID and sanitized errors. It permits only the four read methods and exact argument forms needed here; raw sending, signing, batch and arbitrary RPC calls are rejected before fetch.

`productionBep20ReadRpc` requires both `VERCEL_ENV=production` and `SIRO_RPC_READ_ENABLED=true`, plus `SIRO_BEP20_RPC_URL`; `SIRO_BEP20_RPC_AUTHORIZATION` is optional. All are server-only, not `NEXT_PUBLIC_`. This independent gate does not change signer, financial UI or database permissions. The endpoint is operator-trusted, not a general SSRF-safe URL proxy: DNS/provider egress review remains necessary. No real endpoint/auth has been provisioned or tested.

Transport tests cover methods/params, HTTPS config, status/content type/body/envelope rejection, bounded chunked bodies, fetch/body timeouts and secret-free errors. An integrated fixture exercises the real HTTP adapter + observer across all six RPC calls. No live provider call occurs. Provider operations/rate limits and transport backoff/checkpoint scheduling remain unimplemented.
