import "server-only";
import { z } from "zod";
import { normalizeUid, type ReceivingIdentity } from "./receiving-uid";
import { assertDurableSession } from "./durable-passkey";
import type { WalletDb } from "./wallet-engine";
export const receivingProfileInput = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'-]+$/u),
    username: z
      .string()
      .regex(/^[a-z][a-z0-9_]{3,23}$/)
      .nullable(),
  })
  .strict()
  .refine(
    (data) =>
      !data.username ||
      ![
        "admin",
        "support",
        "sirocash",
        "security",
        "official",
        "binance",
      ].includes(data.username),
  );
export function publicReceivingIdentity(
  row: Record<string, unknown>,
): ReceivingIdentity {
  const uid = normalizeUid(String(row.uid));
  if (!uid) throw Error("RECEIVING_IDENTITY_UNAVAILABLE");
  return {
    uid,
    displayName: typeof row.displayName === "string" ? row.displayName : null,
    username: typeof row.username === "string" ? row.username : null,
    identityVerified: row.kycStatus === "VERIFIED",
  };
}
/** Budget commits even for nonexistent, malformed, self or unnamed recipients. No list endpoint. */
export async function resolveReceivingIdentity(
  db: WalletDb,
  context: Parameters<typeof assertDurableSession>[1],
  input: string,
) {
  const allowed = await db.transaction(async (tx) => {
    await assertDurableSession(tx, context);
    const {
      rows: [budget],
    } = await tx.query(
      "SELECT public.receiving_identity_budget($1::uuid,$2) AS allowed",
      [context.userId, "lookup"],
    );
    return budget?.allowed === true;
  });
  if (!allowed) throw Error("RECIPIENT_UNAVAILABLE");
  const raw = input.replace(/^sirocash:pay:/, ""),
    uid = normalizeUid(raw);
  const legacy =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
      ? raw.toLowerCase()
      : null;
  if (!uid && !legacy) throw Error("RECIPIENT_UNAVAILABLE");
  const row = await db.transaction(async (tx) => {
    await assertDurableSession(tx, context);
    const {
      rows: [recipient],
    } = await tx.query(
      `SELECT i."userId",i.uid,i."displayName",i.username,u."kycStatus" FROM "ReceivingIdentity" i JOIN "User" u ON u.id=i."userId" WHERE ${uid ? "i.uid=$1" : 'i."userId"=$1::uuid'} AND u."emailVerifiedAt" IS NOT NULL`,
      [uid ?? legacy],
    );
    return recipient;
  });
  if (
    !row ||
    row.userId === context.userId ||
    typeof row.displayName !== "string" ||
    !row.displayName.trim()
  )
    throw Error("RECIPIENT_UNAVAILABLE");
  return {
    recipientId: String(row.userId),
    identity: publicReceivingIdentity(row),
  };
}
