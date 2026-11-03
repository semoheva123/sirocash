import assert from "node:assert/strict";
import {
  receivingProfileInput,
  publicReceivingIdentity,
  resolveReceivingIdentity,
} from "../lib/receiving-identity";
import type { WalletDb } from "../lib/wallet-engine";
const owner = "11111111-1111-4111-8111-111111111111",
  recipient = "22222222-2222-4222-8222-222222222222";
const context = {
  userId: owner,
  sessionHash: "fixture",
  rpID: "fixture.test",
  origin: "https://fixture.test",
};
async function main() {
  let budget = true,
    allowedSession = true,
    lookups = 0,
    budgets = 0;
  let row: Record<string, unknown> | undefined = {
    userId: recipient,
    uid: "1234567897",
    displayName: "أحمد",
    username: "ahmad",
    kycStatus: "UNVERIFIED",
  };
  const db: WalletDb = {
    transaction: async (run) =>
      run({
        query: async (sql, params) => {
          if (sql.includes("current_user="))
            return { rows: [{ financial: true }] };
          if (sql.includes("financial_assert_session")) {
            if (!allowedSession) throw Error("SESSION_EXPIRED");
            return { rows: [] };
          }
          if (sql.includes("receiving_identity_budget")) {
            budgets++;
            assert.equal(params?.[0], owner);
            return { rows: [{ allowed: budget }] };
          }
          if (sql.includes('FROM "ReceivingIdentity"')) {
            lookups++;
            return { rows: row ? [row] : [] };
          }
          throw Error("Unexpected SQL");
        },
      }),
  };
  const result = await resolveReceivingIdentity(db, context, "١٢٣٤ ٥٦٧٨ ٩٧");
  assert.equal(result.recipientId, recipient);
  assert.equal(result.identity.identityVerified, false);
  assert.deepEqual(Object.keys(result.identity).sort(), [
    "displayName",
    "identityVerified",
    "uid",
    "username",
  ]);
  row!.kycStatus = "VERIFIED";
  assert.equal(
    (await resolveReceivingIdentity(db, context, "sirocash:pay:1234567897"))
      .identity.identityVerified,
    true,
  );
  for (const state of ["PENDING", "REJECTED", "UNVERIFIED", undefined])
    assert.equal(
      publicReceivingIdentity({ ...row, kycStatus: state }).identityVerified,
      false,
    );
  await resolveReceivingIdentity(db, context, recipient); // legacy links resolve to the same canonical account
  let before = lookups;
  await assert.rejects(() =>
    resolveReceivingIdentity(db, context, "1234567890"),
  );
  assert.equal(lookups, before);
  assert(budgets > 0);
  budget = false;
  before = lookups;
  await assert.rejects(() =>
    resolveReceivingIdentity(db, context, "1234567897"),
  );
  assert.equal(lookups, before);
  budget = true;
  row = { ...row, userId: owner };
  await assert.rejects(() =>
    resolveReceivingIdentity(db, context, "1234567897"),
  );
  row = { ...row, userId: recipient, displayName: null };
  await assert.rejects(() =>
    resolveReceivingIdentity(db, context, "1234567897"),
  );
  row = undefined;
  await assert.rejects(() =>
    resolveReceivingIdentity(db, context, "1234567897"),
  );
  allowedSession = false;
  before = budgets;
  await assert.rejects(() =>
    resolveReceivingIdentity(db, context, "1234567897"),
  );
  assert.equal(budgets, before);
  assert(
    receivingProfileInput.safeParse({
      displayName: "أحمد محمود",
      username: "ahmad_22",
    }).success,
  );
  for (const data of [
    { displayName: "a", username: null },
    { displayName: "<script>", username: null },
    { displayName: "Name\u202e", username: null },
    { displayName: "Name", username: "admin" },
    { displayName: "Name", username: "UPPER" },
    { displayName: "Name", username: null, identityVerified: true },
  ])
    assert(!receivingProfileInput.safeParse(data).success);
  console.log(
    "Receiving identity PASS: authenticated/budgeted lookup, failed-attempt budgeting, UID/legacy resolution, immutable account binding, self/unnamed/missing rejection, actual KYC only and minimal metadata.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
