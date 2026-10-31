# Autonomous financial execution — implementation acceptance

Date: 2026-10-31. This document covers the three previously identified execution gaps,
not certification of every application feature or a live financial launch.

## Implemented and wired, not just exported functions

`productionOutboxNetworkWorkers().batch()` fairly scans six durable job categories:

1. Reserved quote -> PREPARE_PAYOUT -> unsigned mainnet preflight -> resource preparation
   when required -> persisted signature + SUBMITTED hold -> resource/budget authorization
   -> claim-before-broadcast -> canonical exact Transfer -> existing atomic journal settlement.
2. Enabled, origin-verified deposit child -> PREPARE_SWEEP -> bounded token balance discovery,
   minimum sweep threshold and fixed operating destination -> resources -> HD signature ->
   authorization -> saved-byte send -> final confirmation/expense settlement.
3. ENERGY intents retain one persisted provider claim ID through timeout, restart, lookup,
   final charge reconciliation and solid native delegation proof plus usable resources. A pending/unknown
   order cannot be purchased again. If free bandwidth is insufficient, the official
   `resource_bundle` endpoint rents energy and bandwidth in the same bound order. Bandwidth
   tiers come from authenticated `/v1/services`, exactly converted from per-1000-unit prices
   and rounded up in SUN; both resources are checked before signing/dispatch.
   Initial unsigned simulation uses the actual transfer;
   the provider's bound read-only estimate is only a fallback before activation, not execution
   authority. The signed transaction is simulated/checked again before dispatch.
4. GAS outboxes top up only an independently derived BEP20 deposit child, **from operating
   BNB, never reserve**. Fresh token/native balances and operating nonce/balance are checked
   under the common operating signing lock. The target gas balance has a 20% funding buffer;
   token execution gas itself is estimated with 20% headroom. Unneeded native funding is skipped.
   Fixed 21,000-gas native transfers, funding+fee exposure, saved bytes and a durable pre-send
   claim are enforced. Funding must be canonically finalized before signing the child sweep.
   Changed recipient, failed receipt, missing inclusion, reorg or insufficient finality hold.
5. Expired **unconsumed** dispatch approvals can refresh fresh resource evidence without
   releasing or adding a duplicate budget reservation. Old approval/evidence is append-only
   audited. Consumed/UNKNOWN/ACKNOWLEDGED claims cannot be reset or resent.
6. Expired, authenticated, never-claimed TRON signatures can refresh TAPOS/expiry, with their
   exact old signed bytes and approvals archived atomically. Sender/recipient/amount/fee limit
   and the existing ledger hold remain unchanged. Claimed/unknown signatures NEVER renew.

The scheduler executes the newly saved outbox immediately within the same job, rather than
waiting five minutes for a sixty-second TRON signature to expire. A crash before any claim
can recover as above. A crash after claim is conservatively UNKNOWN, not a guessed failure.

## Safety boundaries

- Per-network mutex + shared payout/sweep/native exposure budget, including unresolved prior
  days and current UTC-day settlements. Native prefund plus child fee exposure is counted
  conservatively (not misrepresented as measured expense or a USD customer fee).
- Native funding and operating payouts serialize against the SAME signing guard. Native
  funding cannot take an operating nonce while a payout or native transfer is unresolved.
- The worker cannot change configured spend caps or custody-vault flags. Its only energy-policy
  write is tripping `enabled=false`. Authentication passwords/sessions/credentials are denied.
- No automated reserve refill. No customer-supplied transaction fields, keys, endpoints, receipts,
  limits, destination overrides or signed payloads enter the scheduler route.
- Unknown/failed/unsupported provider or chain states stay held. Safe handling of those states
  is deliberate; an instruction to automate is not permission to guess finality or retry money.
- TronZap has no documented atomic maximum-price request field. Variable-price purchases
  still require the separate explicit operator risk permission; preflight quotes are not price
  guarantees. Known overruns stop new purchases and remain fully recorded.

## Code and tests

- `financial-preflight.ts`, `financial-preparation.ts`: live unsigned planning and initial signing.
- `native-gas.ts`: restricted durable BNB funding, nonce exclusion, broadcast and finality.
- `unsent-tron-renewal.ts`: audited expired unclaimed signature recovery.
- `sweep-dispatch.ts`, `payout-resource-authorization.ts`: audited approval refresh.
- `outbox-network-runtime.ts`, `financial-worker.ts`: real production composition and fair scan.
- `tests/autonomous-financial.ts`: BEP20 from empty native child through finalized BNB funding,
  HD signing, renewed resource approval, broadcast and final sweep; restart/no resend, malformed
  native proof, immutable native amount, unchanged expense and consumed-renewal denial.
- `tests/autonomous-tron.ts`: resource intent, single provider-order fixture, pending recovery,
  energy-only and bundled energy+bandwidth delivery proof, zero-native HD sweep, exact final
  Transfer and expired unsent renewal.
- `tests/signed-withdrawal-outbox.ts`: reserved-quote automatic preparation using real fixture
  signatures, journal/finality invariants, budget-neutral approval refresh and archived expired
  payout signature+approval renewal. Final-evidence and rejection-proof guards remain intact.

These use public fixture keys, PGlite and injected HTTP transports. No real money, production
key loading, provider purchase or live broadcast occurred. They are NOT independent-session
PostgreSQL concurrency tests or funded mainnet end-to-end proof.

## Installation/configuration still intentionally separate

Production remains unchanged (migration 32, financial execution disabled). Apply staged
migrations 33–36 in order before deploying code expecting 26 protected tables and nine checked
triggers. The last migration is `20261031240000_autonomous_financial_execution`.

In addition to existing private configuration, reviewed activation needs:
- `SIRO_AUTOMATIC_PREPARATION_ENABLED=true`;
- `SIRO_NATIVE_GAS_ENABLED=true` for automatic BNB funding;
- `SIRO_<TRC20|BEP20>_MIN_SWEEP_BASE_UNITS`, positive operator-chosen economic thresholds;
- existing max token/native fee limits, enabled bounded DB policies, validated signer bindings,
  trusted RPC/genesis, resource/energy/broadcast flags, independent financial DB credential,
  dedicated scheduler secret and explicit variable-price purchase permission.

Do not enable a flag without its prerequisites or increase a budget to force a test through.
The worker role remains NOLOGIN until a separate securely stored credential is provisioned.
No production settings or permissions were changed by this patch. The workflow schedule only
runs from the default branch after merge; this working branch is not an active schedule.

Other platform launch requirements (authoritative customer command/valuation integration,
real-device ceremonies, restore/concurrency drills and explicitly bounded funded acceptance)
remain independent of closing these three execution-code gaps. This document does not claim
those were all completed or that the site is ready to move customer funds.
