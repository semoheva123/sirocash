import { customerFinancialCommands } from "../lib/customer-financial-commands";
import { paymentDigest } from "../lib/payment-intent";
import { verifyReceivingIdentitySchema } from "../lib/receiving-identity-schema";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { WalletDb } from "../lib/wallet-engine";
import { normalizeUid } from "../lib/receiving-uid";
import { resolveReceivingIdentity } from "../lib/receiving-identity";
/** Actual restricted-role SQL. Call only from the existing isolated-cluster harness. */
export async function receivingIdentityAcceptance(
  pool: Pool,
  db: WalletDb,
  alice: string,
  bob: string,
) {
  const app = async (sql: string, values: unknown[] = []) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE sirocash_app");
      const result = await c.query(sql, values);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  await verifyReceivingIdentitySchema((sql, values) => app(sql, values));
  const identities = (
    await pool.query(
      'SELECT * FROM "ReceivingIdentity" WHERE "userId"=ANY($1::uuid[])',
      [[alice, bob]],
    )
  ).rows;
  assert.equal(identities.length, 2);
  for (const identity of identities)
    assert.equal(normalizeUid(identity.uid), identity.uid);
  assert.notEqual(identities[0].uid, identities[1].uid);
  const uid = identities.find((i) => i.userId === bob).uid;
  await app(
    'UPDATE "ReceivingIdentity" SET "displayName"=$2,username=$3 WHERE "userId"=$1',
    [bob, "Recipient Fixture", "fixture_recipient"],
  );
  const session = randomUUID().replaceAll("-", "").repeat(2);
  await pool.query(
    'INSERT INTO "AuthSession"("tokenHash","userId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',
    [session, alice],
  );
  const context = {
    userId: alice,
    sessionHash: session,
    rpID: "fixture.test",
    origin: "https://fixture.test",
  };
  const resolved = await resolveReceivingIdentity(db, context, uid);
  assert.equal(resolved.recipientId, bob);
  assert.equal(resolved.identity.displayName, "Recipient Fixture");
  assert.equal(resolved.identity.identityVerified, true);
  const prepared = await customerFinancialCommands(db, {
    feeAccountId: randomUUID(),
    settlementAccountId: randomUUID(),
  }).prepare(context, {
    kind: "TRANSFER",
    recipient: resolved.recipientId,
    amount: "100",
    requestKey: "uid:bound:prepare",
  });
  assert.equal(prepared.payload.recipient, bob);
  assert.equal(prepared.payload.fee, "1.000000");
  assert.equal(prepared.payload.totalDebit, "101.000000");
  assert.equal(
    prepared.digest,
    paymentDigest("/api/wallet/transfer", prepared.payload),
  );
  // Lookup limit commits even when resolution is rejected. Concurrent requests share a single budget.
  await pool.query('DELETE FROM "ReceivingIdentityBudget" WHERE "userId"=$1', [
    alice,
  ]);
  const race = await Promise.all(
    Array.from({ length: 24 }, () =>
      db.transaction(
        async (tx) =>
          (
            await tx.query(
              "SELECT receiving_identity_budget($1,'lookup') AS allowed",
              [alice],
            )
          ).rows[0].allowed,
      ),
    ),
  );
  assert.equal(race.filter(Boolean).length, 10);
  await pool.query('DELETE FROM "ReceivingIdentityBudget" WHERE "userId"=$1', [
    alice,
  ]);
  for (let i = 0; i < 10; i++)
    await assert.rejects(() =>
      resolveReceivingIdentity(db, context, "1234567890"),
    );
  await assert.rejects(() => resolveReceivingIdentity(db, context, uid));
  assert.equal(
    (
      await pool.query(
        'SELECT count FROM "ReceivingIdentityBudget" WHERE "userId"=$1 AND action=\'lookup\'',
        [alice],
      )
    ).rows[0].count,
    10,
  );
  await pool.query(
    `UPDATE "ReceivingIdentityBudget" SET "windowStart"=now()-interval '2 minutes' WHERE "userId"=$1`,
    [alice],
  );
  assert.equal(
    (await resolveReceivingIdentity(db, context, uid)).recipientId,
    bob,
  );
  for (const sql of [
    'UPDATE "ReceivingIdentity" SET uid=uid WHERE "userId"=$1',
    'DELETE FROM "ReceivingIdentity" WHERE "userId"=$1',
  ])
    await assert.rejects(() => app(sql, [bob]), /permission denied/);
  await assert.rejects(
    () =>
      pool.query('UPDATE "ReceivingIdentity" SET uid=$2 WHERE "userId"=$1', [
        bob,
        identities.find((i) => i.userId === alice).uid,
      ]),
    /IMMUTABLE/,
  );
  await assert.rejects(
    () =>
      app('UPDATE "ReceivingIdentity" SET username=$2 WHERE "userId"=$1', [
        bob,
        "changed_name",
      ]),
    /IMMUTABLE/,
  );
  await assert.rejects(
    () =>
      app('UPDATE "ReceivingIdentity" SET username=$2 WHERE "userId"=$1', [
        alice,
        "fixture_recipient",
      ]),
    /duplicate key/,
  );
  await assert.rejects(
    () =>
      db.transaction((tx) =>
        tx.query('UPDATE "ReceivingIdentity" SET "displayName"=\'Attack\''),
      ),
    /permission denied/,
  );
  for (const role of ["anon", "authenticated"]) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(
        () => c.query('SELECT uid FROM "ReceivingIdentity"'),
        /permission denied/,
      );
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  }
  await pool.query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1', [session]);
  const fresh = randomUUID();
  await app(
    'INSERT INTO "User"(id,email,"emailVerifiedAt") VALUES($1,$2,now())',
    [fresh, `uid-${fresh}@example.test`],
  );
  assert(
    normalizeUid(
      (
        await app('SELECT uid FROM "ReceivingIdentity" WHERE "userId"=$1', [
          fresh,
        ])
      ).rows[0].uid,
    ),
  );
  const f = (
    await pool.query(
      "SELECT has_function_privilege('anon','public.issue_receiving_identity(uuid)','EXECUTE') AS anon,has_function_privilege('sirocash_app','public.issue_receiving_identity(uuid)','EXECUTE') AS app",
    )
  ).rows[0];
  assert.equal(f.anon, false);
  assert.equal(f.app, false);
  console.log(
    "Receiving identity PostgreSQL PASS: restricted-role allocation/lookup, checksum, unique permanent UID/username, real KYC, 24-session budget race (10 allowed), failed lookups persist budget and anonymous/write isolation.",
  );
}
