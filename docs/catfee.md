# CatFee-only resource integration

Owner decision, 2026-11-01: use CatFee exclusively; remove the former provider. No fallback.

## Implemented

- Runtime selects `SIRO_ENERGY_PROVIDER=catfee`; rejects another selection when energy worker is enabled.
- `CATFEE_API_KEY` and `CATFEE_API_SECRET`: production-sensitive server-only credentials. Add directly
  to the secret store; never chat, browser, Git, Preview, or logs. The old provider credentials were
  deleted from the project's environment configuration. This does not revoke credentials at their
  issuer or erase immutable old deployments. Revoke the former API key in that provider's account.
- Fixed `https://api.catfee.io`; GET-only account, estimate, and original-client-ID order lookup.
  HMAC-SHA256 Base64 over exact timestamp + GET + encoded path/query. No redirects, retries,
  arbitrary hosts, private keys, wallet authorization, or signed withdrawal submission.
- Bounded response/deadline, safe integer SUN parsing and sanitized transport errors.
- Recovery binds client order ID, address, quantity, resource type and duration. Submission is not
  confirmation; the existing independent on-chain delivery/current-resource checks remain mandatory.
- No native TRX refill/fallback is introduced. BEP20 BNB handling is unchanged.

## Intentionally NOT enabled / not a completed paid integration

`/v1/order` documents idempotent creation but no atomic maximum-price parameter. Provider selection
is NOT acceptance of variable prices. The CatFee adapter exposes a purchase blocker, checked before
any durable purchase claim/HTTP call. Its send function always rejects. Neither toggling a purchase
flag nor adding credentials bypasses this restriction. The retired variable-price acceptance flag
is not recognized. Unbounded prepaid spending is not an implementation of the approved cap.

The ordinary energy estimate is energy-only, not a full activation/bandwidth quote. Bundle quote and
purchase recovery are explicitly unavailable, not fabricated using undocumented fields. Although
CatFee documents ENERGY/BANDWIDTH products and Seamless Energy, their capped execution, billing,
activation, expiry, and independent delivery proof still need a reviewed adapter and funded acceptance.
Seamless Energy must use STOP on insufficient provider balance; do not silently replace our broadcaster
or let the provider forward a signed payment before the local dispatch claim/expense checks.

Account credentials/authentication, actual prices and zero-TRX operation have NOT been live-tested
with CatFee. Fixture domain-cycle tests use a provider-neutral synthetic adapter, not a CatFee purchase.
Deposits, signing, paid operations and customer withdrawals remain gated off.

## Cutover safety

Read-only production preflight returned zero EnergyRentalIntent, EnergyPurchaseAttempt,
SignedWithdrawalOutbox and SignedSweepOutbox rows, and zero enabled energy policies. No old paid
operation was reinterpreted as a CatFee order. Future provider changes with existing rows require
persisted provider provenance/migration; never use a different provider to resolve an old unknown order.
No ledger or schema migration was needed for this empty, disabled cutover.

## Official contracts reviewed

- https://docs.catfee.io/en/getting-started/buy-energy-via-api-on-catfee/api-overview
- https://docs.catfee.io/en/api-reference/account
- https://docs.catfee.io/en/api-reference/price
- https://docs.catfee.io/en/api-reference/create-order
- https://docs.catfee.io/en/api-reference/order-detail
- https://docs.catfee.io/en/getting-started/api-supports-idempotent-requests
- https://docs.catfee.io/en/seamless-energy/introduction
- https://docs.catfee.io/en/seamless-energy/faq
- https://docs.catfee.io/en/getting-started/terms-of-service

Delivered resources may be non-refundable even if the subsequent transfer fails. Resource availability,
provider estimates and advertised savings are not guaranteed final transaction costs.
