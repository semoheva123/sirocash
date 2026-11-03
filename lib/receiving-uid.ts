/** Public receiving identifier, not a credential. Luhn detects most typing errors. */
export function uidCheckDigit(prefix: string) {
  if (!/^[1-9][0-9]{8}$/.test(prefix)) throw Error("INVALID_UID_PREFIX");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(prefix[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return String((10 - (sum % 10)) % 10);
}
export function normalizeUid(input: string) {
  const value = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\s/g, "");
  return /^[1-9][0-9]{9}$/.test(value) &&
    uidCheckDigit(value.slice(0, 9)) === value[9]
    ? value
    : null;
}
export function formatUid(value: string) {
  const uid = normalizeUid(value);
  return uid ? `${uid.slice(0, 4)} ${uid.slice(4, 8)} ${uid.slice(8)}` : "—";
}
export type ReceivingIdentity = {
  uid: string;
  displayName: string | null;
  username: string | null;
  identityVerified: boolean;
};
