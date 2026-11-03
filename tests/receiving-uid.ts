import assert from "node:assert/strict";
import { uidCheckDigit, normalizeUid, formatUid } from "../lib/receiving-uid";
import {
  internalTransferReviewHref,
  internalTransferPrefill,
} from "../lib/wallet-presentation";
assert.equal(uidCheckDigit("123456789"), "7");
assert.equal(normalizeUid("1234 5678 97"), "1234567897");
assert.equal(normalizeUid("١٢٣٤ ٥٦٧٨ ٩٧"), "1234567897");
assert.equal(normalizeUid("۱۲۳۴۵۶۷۸۹۷"), "1234567897");
assert.equal(formatUid("1234567897"), "1234 5678 97");
for (const value of [
  "0234567897",
  "1234567890",
  "1234-5678-97",
  "1e12345678",
  "1234567897x",
  "123456789",
  "12345678977",
  "\u202e1234567897",
])
  assert.equal(normalizeUid(value), null);
for (let prefix = 100000000; prefix < 100000500; prefix++) {
  const uid = String(prefix) + uidCheckDigit(String(prefix));
  assert.equal(normalizeUid(uid), uid);
  for (let i = 0; i < 10; i++) {
    const changed =
      uid.slice(0, i) + String((Number(uid[i]) + 1) % 10) + uid.slice(i + 1);
    assert.equal(normalizeUid(changed), null);
  }
}
assert.equal(
  new URL(
    "https://fixture.test" +
      internalTransferReviewHref("sirocash:pay:١٢٣٤٥٦٧٨٩٧", "100"),
  ).searchParams.get("recipient"),
  "1234567897",
);
assert.equal(
  internalTransferPrefill(
    new URLSearchParams("kind=TRANSFER&recipient=1234+5678+97&amount=100"),
  )?.recipient,
  "1234567897",
);
assert.throws(() => internalTransferReviewHref("1234567890", "100"));
console.log(
  "Receiving UID PASS: checksum, nonzero prefix, 10 digits, Arabic/Persian digits, spaced/QR input, every single-digit mutation and exact prefill.",
);
