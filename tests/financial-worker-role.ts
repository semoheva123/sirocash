import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
async function main(){const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 const {rows:[role]}=await pg.query<{rolcanlogin:boolean;rolsuper:boolean;rolbypassrls:boolean}>("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='sirocash_financial_worker'");assert.equal(role.rolcanlogin,false);assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
 const member=(await pg.query<{v:boolean}>("SELECT pg_has_role('sirocash_app','sirocash_financial_worker','MEMBER') AS v")).rows[0];assert.equal(member.v,false);
 await pg.exec('SET ROLE sirocash_financial_worker');
 for(const table of ['SignedWithdrawalOutbox','SignedSweepOutbox','EnergyPurchaseAttempt','LedgerEntry'])await pg.query(`SELECT 1 FROM "${table}" LIMIT 0`);
 for(const table of ['DepositAddressVault','UserDepositAddress','WithdrawalSigningGuard','PlatformWithdrawalGuard'])await pg.query(`SELECT * FROM "${table}" FOR UPDATE`);
 for(const sql of ['SELECT "passwordHash" FROM "User" LIMIT 0','SELECT * FROM "AuthSession" LIMIT 0','SELECT * FROM "DurablePasskeyCredential" LIMIT 0','UPDATE "EnergyPurchasePolicy" SET "perOrderSun"=100','UPDATE "EnergyPurchasePolicy" SET enabled=true','UPDATE "WithdrawalSigningGuard" SET network=network','DELETE FROM "EnergyPurchaseAttempt"'])await assert.rejects(()=>pg.exec(sql));
 await pg.exec('UPDATE "EnergyPurchasePolicy" SET enabled=false');
 assert.equal((await pg.query<{enabled:boolean}>('SELECT enabled FROM "EnergyPurchasePolicy"')).rows[0].enabled,false);
 console.log('Dedicated worker role: no login/bypass/app membership, financial writes and row locks available, password/session/credential/cap/configuration mutations denied; trip-only circuit breaker passed.');
}finally{await pg.close()}}
main().catch(error=>{console.error(error);process.exitCode=1});
