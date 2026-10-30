import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
for(const dir of (await readdir('prisma/migrations')).sort()){
 if(!dir.endsWith('.toml'))await db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
}
const tables=['User','LedgerAccount','Transaction','LedgerEntry','DepositAddress','AuthSession','EmailChallenge','EmailRateLimit'];
for(const name of tables){
 const {rows:[r]}=await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[`"${name}"`]);
 assert.equal(r.relrowsecurity,true,`${name}: RLS`);
 for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(()=>db.query(`SELECT * FROM "${name}"`),/permission denied/);
  await db.exec('RESET ROLE');
 }
}
await db.exec('SET ROLE sirocash_app');
const {rows:[user]}=await db.query('INSERT INTO "User" (id,email,"emailVerifiedAt","passwordHash") VALUES (gen_random_uuid(),$1,NOW(),$2) ON CONFLICT(email) DO NOTHING RETURNING id,email,balance',['restricted@example.com','test-hash']);
assert.equal(Number(user.balance),0);
await db.query('SELECT id,email FROM "User" WHERE id=$1 FOR UPDATE',[user.id]);
await db.query('INSERT INTO "EmailRateLimit" (id) VALUES ($1) ON CONFLICT DO NOTHING',['global']);
await db.exec('UPDATE "EmailRateLimit" SET count=count+1');
await db.query('INSERT INTO "EmailChallenge" (id,email,"codeHash","expiresAt","passwordHash",purpose) VALUES ($1,$2,$3,NOW()+INTERVAL \'10 minutes\',$4,$5)',['challenge',user.email,'hash','test-hash','signup']);
await db.exec('SELECT * FROM "EmailChallenge" FOR UPDATE; UPDATE "EmailChallenge" SET attempts=attempts+1');
await db.query('INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt") VALUES ($1,$2,NOW()+INTERVAL \'1 day\')',['session',user.id]);
await db.exec('SELECT u.id,u.email,u."emailVerifiedAt" FROM "AuthSession" s JOIN "User" u ON u.id=s."userId"');
await db.exec('SELECT u.id,u.email,u."passwordHash",s."tokenHash",c.id,r.id FROM "User" u,"AuthSession" s,"EmailChallenge" c,"EmailRateLimit" r WHERE FALSE');
await assert.rejects(()=>db.exec('UPDATE "User" SET balance=100'),/permission denied/);
await assert.rejects(()=>db.exec('DELETE FROM "User"'),/permission denied/);
await assert.rejects(()=>db.exec('SELECT "pinHash" FROM "User"'),/permission denied/);
for(const table of ['LedgerEntry','LedgerAccount','Transaction','DepositAddress'])await assert.rejects(()=>db.exec(`SELECT * FROM "${table}"`),/permission denied/);
await db.exec('DELETE FROM "EmailChallenge"; DELETE FROM "AuthSession"');
await db.exec('RESET ROLE');
const {rows:[role]}=await db.query("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='sirocash_app'");
assert.ok(Object.values(role).every(value=>value===false));
await db.close();
console.log('Database access: RLS, public isolation, auth operations, and financial permission denial passed.');
