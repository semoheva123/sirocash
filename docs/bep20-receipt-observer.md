# Read-only BEP20 receipt observer — private preparation

`observeBep20UsdtReceipt` takes an operator-controlled RPC transport, a transaction hash and trusted intake policy. It calls only `eth_chainId`, `eth_getTransactionReceipt`, `eth_getBlockByNumber` and `eth_blockNumber`. No broadcast, signing, credentials, provider purchase or ledger mutation occurs.

It requires chain 56; successful receipt; receipt hash/height matching a numbered canonical block; the transaction at the claimed block transaction index; every receipt log bound to the same transaction, index, block hash and height; strict RPC quantity/hash encoding; nonremoved logs; finalized-tag support; and configured confirmation/amount/recipient checks from the existing USDT validator. It re-reads the numbered block after validation and rejects a changed hash. `finalized` failure is never silently replaced by `latest`.

Returned normalized evidence may be passed by a private worker to intake or sweep confirmation. It must never come from customer JSON, a browser-configured endpoint or arbitrary public transport. A node can lie consistently: matching RPC assertions are not a cryptographic inclusion proof. This code does not establish ancestry of the finalized block or protect against later deep reorgs. Scheduling, checkpoints and incident handling remain necessary.

No production HTTP transport is configured. Such a transport must enforce reviewed HTTPS endpoint/auth, connection/read timeout, response-size and RPC error/id validation, provider consistency and rate limiting. Mock tests cover successful normalization, wrong chain, missing/failed receipt, mismatched log context, removed log, missing transaction inclusion, unavailable/insufficient finalized evidence, malformed quantities and observation-window reorg. They do not prove provider behavior or BSC mainnet availability.

No migration is added by the observer or the TRON confirmation extension. Existing prepared finance migrations remain unapplied remotely. Financial UI/permissions remain gated.
