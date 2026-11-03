# Account support center

## Scope

Authenticated customers open requests at `/settings/support` from Settings →
Contact support. A ticket has a topic, subject, initial message, immutable
conversation history and a visible status. Customers can reply to their own open
tickets. Authorized staff use `/operations/support` to read, reply and close.
Staff access is configured with `SUPPORT_ADMIN_IDS` (comma-separated account UUIDs);
if absent, the existing operations allowlist is used. Empty configuration denies
all staff. Settings shows a separate staff-desk link only to permitted accounts.

Support is **in-app**, as explicitly selected by the owner. There is no inbound
email integration, attachment upload, claim of 24/7 staffing, automatic resolution,
financial action or fabricated response time. `support@sirocash.online` is the
public support identity, not a claim that an external receiving mailbox exists.
Security/OTP mail uses `RESEND_FROM_EMAIL`, intended as
`Siro Cash Security <security@sirocash.online>` after the owner's domain verification.
Provider delivery and inbound mailbox availability are separate checks.

## Security and persistence

- All HTTP reads require a verified database session; all mutations also require
  the fixed trusted origin. JSON is byte-bounded and strictly validated. Caller
  cannot supply owner/author IDs, staff flags or message timestamps.
- Server decides staff membership from an explicit allowlist. `staff=1` is just a
  requested view and grants no permission by itself. Regular reads are scoped to
  the authenticated owner, including direct-ID detail requests. Staff replies are
  attributed to the actual staff UUID internally; public projections omit it.
- Message save, status update, budget and idempotency lookup execute in one DB
  transaction. A row lock serializes each author's mutations; a ticket row lock
  serializes replies with closure. Replays return the saved ticket without a second
  message. Same key/different content is rejected. Network failures preserve the
  draft and retry key; no success is shown before durable save acknowledgment.
- Customer writes: 5/minute, 50/day and at most 10 open tickets. Staff writes:
  30/minute, 500/day. Failed transactions roll back all effects. Messages are
  2–4000 characters; subjects 4–120. UI counters/disabled submit supplement server
  validation, not replace it.
- List reads are bounded/keyset-paginated (30 tickets, 50 messages per page).
  There is no background polling. Open/refresh and successful mutations reload
  the current view. A staff reply becomes visible when the customer opens or
  refreshes the request, not via a new push service.
- RLS and revoked PUBLIC/anon/authenticated grants block browser database access.
  Only the restricted backend role has explicit support grants. It cannot edit or
  delete message history, delete tickets, or change owner/subject/category after
  creation. Financial tables and workers receive no new support permissions.
- Content renders as escaped text, not HTML/Markdown. No message bodies are logged
  or passed to email providers. Forms warn against passwords/OTPs/private keys.

## Deployment

Apply `prisma/migrations/20261103160000_support_center/migration.sql` before
publishing the routes. Configure `SUPPORT_ADMIN_IDS` with an explicitly approved
account UUID and `SUPPORT_EMAIL=support@sirocash.online`. Do not derive an admin ID
from submitted forms or grant everyone access. The owner approved the existing
verified account associated with their sign-in email, not a new administrative
user or shared password. No credentials are stored in this document.

## Verification

`npm run test:support` uses isolated PostgreSQL/PGlite to execute the migration,
real service transactions and HTTP handlers: input rejection, quota, replay,
customer/staff replies, closure, anonymous/foreign-owner/staff-spoof denial,
no-store/minimal projections, database privilege boundaries. It sends no emails.

`node tests/visual/support-review.mjs` uses the local synthetic fixture to exercise
AR/EN at 320/390/1440 px, full create/reply/close flow, a committed-but-lost response
and same-key retry, draft retention, hostile HTML text escaping and overflow.
The browser fixture is not a production authentication, delivery or load test.
