import { database } from "../lib/database";
import { verifyReceivingIdentitySchema } from "../lib/receiving-identity-schema";
async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("Receiving identity schema: SKIPPED (not production)");
    return;
  }
  const pool = database(),
    client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await verifyReceivingIdentitySchema((sql, values) =>
      client.query(sql, values),
    );
    await client.query("ROLLBACK");
    console.log(
      "Receiving identity schema: VERIFIED (no identifiers or personal data printed)",
    );
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Receiving identity schema: FAILED. Apply the reviewed migration and verify permissions before deployment.",
  );
  process.exitCode = 1;
});
