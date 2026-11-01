# CatFee traditional direct energy rental

## Owner decision

Use CatFee exclusively, with **manual account top-up**, not Seamless Energy. The
latest owner instruction authorizes the direct mechanism: buy the energy needed
for a TRON transaction and broadcast locally after independent delivery proof.
The previous requirement for a provider-side atomic price lock is not implemented
or claimed in direct mode. The owner has acknowledged small peak-price variation;
no numeric USD slippage allowance was invented. This does not remove the existing
expense policies, authorize arbitrary price differences, native TRX burning,
automatic top-up, or a live paid test. Collection remains deferred until separately
enabled. Deposit receipt/credit does not need CatFee. BSC is unaffected.

## Implemented direct path

1. Simulate the exact transfer unsigned; inspect the sender's account and current
   resources. Reuse sufficient existing resources rather than buy unnecessarily.
2. If energy is insufficient, request the required quantity (at least CatFee's
   65,000 minimum), for one hour. Existing sufficient Bandwidth is mandatory;
   missing Bandwidth stops preparation **before** an energy purchase. This adapter
   does not fabricate a Bandwidth product or permit native-burn fallback.
3. Fetch a signed GET estimate. Reject an estimate above the intent's maximum.
   Atomically claim the intent and reserve the estimated cost against the shared
   per-order, provider-lifetime and network-daily expense policies before any POST.
4. Send one signed `POST https://api.catfee.io/v1/order`, with quantity, receiver,
   duration=1h, the committed claim UUID as client_order_id, and activate=false.
   Address activation is not silently purchased. No private key or signed customer
   transfer is sent to CatFee; no Seamless or handoff endpoint is used.
5. Treat the result only as an acknowledgement. Recover through GET /v1/order using
   the same client ID. Timeout, malformed response or unknown result retains the
   durable claim and budget; never blindly issue a second purchase.
6. Bind the receipt to sender, quantity, duration and client ID. Reconcile the real
   charge, including activation fields conservatively. An actual charge above the
   reserved estimate/approved policy holds the operation and disables further
   purchases; **this is after-the-fact containment, not a provider price lock**.
7. Require confirmed native delegation on the pinned TRON chain, exact receiver,
   and currently usable Energy AND Bandwidth. Historical provider success alone is
   insufficient; resources may have been used or reclaimed.
8. Prepare/sign locally only after verified resources. Recheck exact signed
   transaction resources/cost and persist dispatch authorization before broadcast.
   The worker calls the saved outbox processor immediately after successful
   preparation in the same job. If delegation is pending, retain/recover the job;
   never promise zero confirmation latency or resend an unknown transfer.

This shared preparation/execution path supports both TRON sweeps and payouts.
The end-to-end CatFee-adapter sweep test uses mocked HTTP and an isolated DB:
unsigned preflight -> exactly one POST -> pending recovery -> confirmed delegation
-> fresh signing -> dispatch authorization -> broadcast -> final transfer/replay.
A missing-Bandwidth test proves no purchase or broadcast occurs. This is software
coverage, not a completed funded mainnet acceptance or a guarantee of live service.

## Configuration and activation boundary

- `SIRO_ENERGY_PROVIDER=catfee` selects the only supported resource provider.
- `CATFEE_API_KEY` and `CATFEE_API_SECRET` must be Sensitive production-only values;
  never chat, browser, Git, logs or Preview. No recovery phrase is required.
- `SIRO_CATFEE_DIRECT_RENTAL_ENABLED=true` explicitly selects direct rental. When
  absent/false the original purchase blocker remains. Neither account funding nor
  the generic purchase flag silently selects direct mode.
- The existing energy-worker, purchase, preparation, signing, resource-authorization,
  outbox and broadcast gates, DB expense policies and deposit-only isolation remain
  in force. Direct mode alone does not enable financial execution.
- The owner's general limits are 50 TRX/order and 200 TRX/day; these are policy limits,
  not a quoted fee or a claim that a DB policy is currently enabled. Do not turn
  those maximums into a paid-test budget: the separate earlier test authorization
  is at most 10 TRX aggregate and requires verified prerequisites.

No production flag, purchase policy or live deployment was changed in this patch.
No production credentials were decrypted and no real purchase/broadcast was made.

## Safe readiness diagnostics

`npm run energy:readiness` is offline by default and exits nonzero while funded
acceptance remains unproven. `CATFEE_READ_CHECK=true npm run energy:readiness` opts
into at most two signed GETs under a shared 25-second deadline in a secure runtime.
It prints no account balance, email, recharge address, secret or upstream body.
`readCheck=VERIFIED` is not `purchasesReady=true`. Direct mode is reported separately
from priceLocked=false and the current-Bandwidth prerequisite. The unchanged
`energy:check` command tests read authentication only, not paid readiness.

## Provider contract and risk

The documented ordinary POST supports quantity, receiver, duration, client_order_id
and activate. The estimate is energy-only and is not an atomic maximum charge.
No invented max_price/max_cost_sun field is sent. Provider deductions can differ
from the preceding estimate. A charge already made may be nonrefundable even if
subsequent dispatch is held. Live credential authentication and the energy estimate are now verified as recorded below.
Account billing behavior and zero-native-TRX paid operation remain unverified.

## References

- https://docs.catfee.io/en/getting-started/buy-energy-via-api-on-catfee/api-overview
- https://docs.catfee.io/en/api-reference/account
- https://docs.catfee.io/en/api-reference/price
- https://docs.catfee.io/en/api-reference/create-order
- https://docs.catfee.io/en/api-reference/order-detail
- https://docs.catfee.io/en/getting-started/api-supports-idempotent-requests
- https://docs.catfee.io/en/getting-started/terms-of-service

## Cutover safety

The prior read-only production preflight observed zero EnergyRentalIntent,
EnergyPurchaseAttempt, SignedWithdrawalOutbox and SignedSweepOutbox rows and no
active energy policies. That is historical evidence, not a new live DB check.
No old paid operation is reinterpreted under another provider. Existing paid rows
would require persisted provenance/review before any provider migration.


## Live read acceptance, 2026-11-01

Production-origin probe `dpl_Gj8v2hp7Vm6xaotTtpLoR8m5juaY` at source
`4e2f14cd95a3858b3904bdae7a6cc2671113dd41` used the existing secret credentials
inside Vercel, without decrypting/exporting them to the workspace or chat.

- GET /v1/account: authenticated successfully, schema checked; no account data logged.
- GET /v1/estimate?quantity=65000&duration=1h: successful, **1,820,000 SUN = 1.82 TRX**.
- This is an observed energy-only estimate, not a price lock or Bandwidth/activation quote.
- Purchases: 0. Broadcasts: 0. No financial activation or production DB access.
- Intentional exit1 after the probe prevented site publication. The Vercel build's
  ERROR state is expected for this diagnostic, not an API-authentication failure.
- The temporary production opt-in variable was deleted after collecting the result.
- The read probe stops on HTTP/API rejection and never retries a charged operation.

Full local npm test also passed after adding the probe's synthetic safety tests.
Actual purchase, delivery and end-to-end live transfer acceptance remain untested;
this read result does not prove a Bandwidth purchase endpoint is available.
