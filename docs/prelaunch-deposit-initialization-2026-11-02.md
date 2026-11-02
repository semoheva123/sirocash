# Explicit prelaunch initialization — 2026-11-02

The operator clarified that the platform had not launched and authorized checking unused test addresses before choosing a new start point. This is NOT a live-platform cursor skipping policy.

## Evidence and safeguards

- One allocated TRC20 address and cursor; no allocated BEP20 cursor found.
- ChainDepositInbox, ApprovedDepositValuation, LedgerEntry and WalletOperation were empty. SignedSweepOutbox and SignedWithdrawalOutbox were checked empty again inside the reset transaction.
- At 18:01:18.554 UTC, hosted read-only audit confirmed an empty, fresh, unfiltered TronGrid TRC20 history result (no pagination), an inactive solidified native account, and zero mainnet USDT balanceOf. Indexed history absence is provider evidence, not a cryptographic non-inclusion proof.
- Audit deployment: dpl_9mVhGdnudMEbij314qD2Hgn2cH5K, commit 9c3f661.
- The previously pinned TRON USDT token was wrong for mainnet. Verifier and signer now share canonical mainnet USDT `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`; independent literal address/hex regressions were added. Trust Wallet's tron asset metadata independently confirms this token and six decimals: https://github.com/trustwallet/assets/blob/master/blockchains/tron/assets/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/info.json . No signing or broadcasts occurred.

## Applied operation

- Paused the TRC20 network scanner for the audit and allowed its existing claim to release. Did not pause or alter BEP20.
- Required an unchanged single-address cursor, zero financial activity, no active claim, no reorg/evidence-conflict reason, and evidence no older than five minutes.
- Locked relevant tables and scanner/cursor rows. Saved complete old cursor/network state and evidence in the admin-only RLS-protected PrelaunchDepositStartAudit table in the SAME transaction as initialization.
- Advanced nextBlock from 87637551 to 87656002, retaining a 300-block overlap behind audited solid head 87656302. New previousBlockHash is the twice-read canonical block 87656001: `0000000005398641983da7fa43a2af38982330cb7885ff29daed7df9d64a5011`.
- Cleared network lastBlock/lastHash/lastHead/lagBlocks/lastSuccessAt to NULL and unpaused TRC20. This explicitly invalidates prior health until a REAL scan succeeds; no success timestamp was invented.
- Disabled the one-shot Vercel SIRO_PRELAUNCH_DEPOSIT_AUDIT flag after evidence collection. Audit code performs no reset and is disabled by default. It is not a public endpoint.

## Acceptance still required

A fresh authenticated monitor run must scan the retained overlap with the corrected mainnet token, establish true lag and success times for BOTH networks, and demonstrate continued freshness. A healthy deposit scanner does not establish withdrawal funding/resource/custody readiness. Do not reuse this initialization on live customer addresses.
