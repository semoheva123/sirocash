import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import * as real from '@simplewebauthn/server';
import {durablePasskeyAction,consumeDurableApproval} from '../lib/durable-passkey';
import {paymentDigest} from '../lib/payment-intent';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE sirocash_app;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE sirocash_financial_worker;CREATE TABLE "User" (id UUID PRIMARY KEY,"emailVerifiedAt" TIMESTAMPTZ);CREATE TABLE "AuthSession" ("tokenHash" TEXT PRIMARY KEY,"userId" UUID REFERENCES "User"(id),"expiresAt" TIMESTAMPTZ)');
  await pg.exec(await readFile('prisma/migrations/20261031100000_durable_passkeys/migration.sql','utf8'));
  await pg.exec(await readFile('prisma/migrations/20261104200000_passkey_session_lock/migration.sql','utf8'));
  await pg.exec(`GRANT SELECT ON \"User\",\"AuthSession\" TO sirocash_app; GRANT UPDATE(\"emailVerifiedAt\") ON \"User\" TO sirocash_app;`);
  const session1='a'.repeat(64),session2='b'.repeat(64),otherSession='c'.repeat(64);
  const userId='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
  await pg.query('INSERT INTO "User" VALUES ($1,now()),($2,now())',[userId,other]);
  for(const [token,user] of [[session1,userId],[session2,userId],[otherSession,other]])await pg.query('INSERT INTO "AuthSession" VALUES ($1,$2,now()+interval \'1 day\')',[token,user]);
  const db:WalletDb={transaction:run=>pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE sirocash_app');return run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})})})};
  const c={userId,sessionHash:session1,origin:'https://wallet.example.test',rpID:'wallet.example.test'};
  await assert.rejects(()=>db.transaction(tx=>tx.query('SELECT * FROM "AuthSession" FOR UPDATE')),/permission denied/);
  await assert.rejects(()=>db.transaction(tx=>tx.query('UPDATE "AuthSession" SET "expiresAt"=now()')),/permission denied/);
  await assert.rejects(()=>durablePasskeyAction(db,{...c,userId:other},{action:'status'}),/SESSION_EXPIRED/);
  await assert.rejects(()=>durablePasskeyAction(db,{...c,sessionHash:'0'.repeat(64)},{action:'status'}),/SESSION_EXPIRED/);
  let failVerify=false,counter=0;
  // Only verification is mocked: no test authenticator bypass is exposed by the HTTP route.
  const verify={...real,
   verifyRegistrationResponse:async()=>{if(failVerify)throw Error('bad attestation');return {verified:true,registrationInfo:{credential:{id:'fixture-credential',publicKey:new Uint8Array([1,2,3]),counter:0,transports:['internal']}}} as Awaited<ReturnType<typeof real.verifyRegistrationResponse>>},
   verifyAuthenticationResponse:async(args:Parameters<typeof real.verifyAuthenticationResponse>[0])=>{assert.equal(args.requireUserVerification,true);assert.equal(args.expectedOrigin,c.origin);if(failVerify)throw Error('invalid assertion');counter++;return {verified:true,authenticationInfo:{newCounter:counter}} as Awaited<ReturnType<typeof real.verifyAuthenticationResponse>>},
  };
  const act=(input:Parameters<typeof durablePasskeyAction>[2],ctx=c)=>durablePasskeyAction(db,ctx,input,verify);
  assert.deepEqual(await act({action:'status'}),{registered:false});
  await act({action:'register-options'});await act({action:'register-verify',response:{}});
  assert.deepEqual(await act({action:'status'},{...c,sessionHash:session2}),{registered:true});
  await assert.rejects(()=>act({action:'register-verify',response:{}}),/CHALLENGE_INVALID/);
  const payload={recipient:'target',amount:'100',asset:'USD',fee:'1',totalDebit:'101',netAmount:'100',requestKey:'request:001',feePolicy:'internal-sender-1pct-v1'};
  const path='/api/wallet/transfer',digest=paymentDigest(path,payload);
  for(const change of [{fee:'2'},{netAmount:'99'},{totalDebit:'102'},{requestKey:'request:002'},{quoteId:'quote:2'},{feePolicy:otherSession}])assert.notEqual(paymentDigest(path,{...payload,...change}),digest);
  const options={action:'authenticate-options',path,payload};
  await act(options);failVerify=true;
  await assert.rejects(()=>act({action:'authenticate-verify',response:{}}),/VERIFICATION_FAILED/);failVerify=false;
  await assert.rejects(()=>act({action:'authenticate-verify',response:{}}),/CHALLENGE_INVALID/);
  await act(options);await pg.exec('UPDATE "DurablePasskeyChallenge" SET "expiresAt"=now()-interval \'1 second\'');
  await assert.rejects(()=>act({action:'authenticate-verify'}),/CHALLENGE_INVALID/);
  await act(options);
  const approved=await act({action:'authenticate-verify',response:{}}) as {token:string};
  assert.match(approved.token,/^[a-f0-9]{64}$/);
  const rows=(await pg.query<{tokenHash:string}>('SELECT "tokenHash" FROM "DurablePaymentApproval"')).rows;assert.equal(rows.length,1);assert.notEqual(rows[0].tokenHash,approved.token);
  const consume=(token=approved.token,d=digest,ctx=c)=>db.transaction(tx=>consumeDurableApproval(tx,ctx,token,d));
  await assert.rejects(()=>consume(approved.token,'f'.repeat(64)),/APPROVAL_REQUIRED/);
  await assert.rejects(()=>consume(approved.token,digest,{...c,sessionHash:session2}),/APPROVAL_REQUIRED/);
  await assert.rejects(()=>db.transaction(async tx=>{await consumeDurableApproval(tx,c,approved.token,digest);throw Error('financial write failed')}),/financial write failed/);
  await consume();await assert.rejects(()=>consume(),/APPROVAL_REQUIRED/);
  await act(options);const expired=await act({action:'authenticate-verify'}) as {token:string};await pg.exec('UPDATE "DurablePaymentApproval" SET "expiresAt"=now()-interval \'1 second\'');await assert.rejects(()=>consume(expired.token),/APPROVAL_REQUIRED/);
  await act(options);const stale=await act({action:'authenticate-verify'}) as {token:string};await act(options);await assert.rejects(()=>consume(stale.token),/APPROVAL_REQUIRED/);
  const broken:WalletDb={transaction:run=>db.transaction(tx=>run({query:async(sql,params)=>{if(sql.startsWith('INSERT INTO "DurablePaymentApproval"'))throw Error('injected db outage');return tx.query(sql,params)}}))};
  await assert.rejects(()=>durablePasskeyAction(broken,c,{action:'authenticate-verify'},verify),/injected db outage/);
  // Counter and challenge roll back together when approval persistence fails.
  const final=await act({action:'authenticate-verify'}) as {token:string};assert.ok(final.token);
  await pg.query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1',[session1]);
  assert.equal((await pg.query('SELECT * FROM "DurablePaymentApproval"')).rows.length,0);
  await assert.rejects(()=>consume(final.token),/SESSION_EXPIRED/);
  assert.deepEqual(await act({action:'status'},{...c,sessionHash:otherSession,userId:other}),{registered:false});
  await pg.query(`UPDATE "AuthSession" SET "expiresAt"=now()-interval '1 second' WHERE "tokenHash"=$1`,[otherSession]);
  await assert.rejects(()=>act({action:'status'},{...c,sessionHash:otherSession,userId:other}),/SESSION_EXPIRED/);
  for(const role of ['anon','authenticated','sirocash_financial_worker']){
   const {rows:[r]}=await pg.query<{allowed:boolean}>(`SELECT has_function_privilege($1,'public.passkey_assert_session(uuid,text)','EXECUTE') AS allowed`,[role]);assert.equal(r.allowed,false);
  }
  await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query('SELECT public.passkey_assert_session($1::uuid,$2)',[userId,session1]),/permission denied/);for(const table of ['DurablePasskeyCredential','DurablePasskeyChallenge','DurablePaymentApproval'])await assert.rejects(()=>pg.exec(`SELECT * FROM "${table}"`),/permission denied/);
  console.log('Durable passkeys: cross-session credentials, single-use/expired/failed challenges, hashed approvals, exact economics/idempotency binding, counter+approval rollback, same-transaction consumption, session isolation/revocation and public privilege denial passed. WebAuthn verification mocked; financial routes remain blocked.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
