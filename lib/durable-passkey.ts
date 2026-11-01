import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import type {WebAuthnCredential} from '@simplewebauthn/server';
import type {WalletDb,WalletTx} from './wallet-engine';
import {paymentDigest} from './payment-intent';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const webauthn={generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse};
type Context={userId:string;sessionHash:string;origin:string;rpID:string};
type Input={action:string;path?:string;payload?:unknown;response?:unknown};
function decode(row:Record<string,unknown>):WebAuthnCredential{
 const counter=Number(row.counter);if(!Number.isSafeInteger(counter)||counter<0)throw new Error('PASSKEY_COUNTER_INVALID');
 return {id:String(row.id),publicKey:new Uint8Array(Buffer.from(String(row.publicKey),'base64')),counter,transports:row.transports as WebAuthnCredential['transports']};
}
export async function assertDurableSession(tx:WalletTx,c:Context){
 const {rows:[role]}=await tx.query("SELECT current_user='sirocash_financial_worker' AS financial");
 if(role?.financial===true){await tx.query('SELECT public.financial_assert_session($1::uuid,$2)',[c.userId,c.sessionHash]);return}

 const {rows:[session]}=await tx.query('SELECT "userId" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">statement_timestamp() FOR UPDATE',[c.sessionHash,c.userId]);
 if(!session)throw new Error('PASSKEY_SESSION_EXPIRED');
}
/** Private backend only. Authenticated session and fixed origin supplied by the server, not JSON.
 * Holds the session lock through challenge verification/counter update/approval creation.
 */
export async function durablePasskeyAction(db:WalletDb,c:Context,input:Input,verify=webauthn){
 const result=await db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await assertDurableSession(tx,c);
  // Serialize registration across multiple auth sessions of the same account.
  const {rows:[user]}=await tx.query('SELECT id FROM "User" WHERE id=$1 AND "emailVerifiedAt" IS NOT NULL FOR UPDATE',[c.userId]);
  if(!user)throw new Error('PASSKEY_ACCOUNT_UNAVAILABLE');
  const {rows:[stored]}=await tx.query('SELECT * FROM "DurablePasskeyCredential" WHERE "userId"=$1 AND "rpId"=$2 FOR UPDATE',[c.userId,c.rpID]);
  const credential=stored?decode(stored):undefined;
  if(input.action==='status')return {registered:!!credential};
  if(input.action==='register-options'||input.action==='authenticate-options'){
   const registering=input.action==='register-options';
   if(registering&&credential)return {error:'PASSKEY_ALREADY_REGISTERED'};
   if(!registering&&!credential)return {error:'PASSKEY_NOT_REGISTERED'};
   const digest=registering?null:paymentDigest(input.path??'',input.payload);
   const options=registering?await verify.generateRegistrationOptions({rpName:'SiroCash',rpID:c.rpID,userID:new Uint8Array(Buffer.from(c.userId.replace(/-/g,''),'hex')),userName:'SiroCash account',attestationType:'none',authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'required'}}):await verify.generateAuthenticationOptions({rpID:c.rpID,userVerification:'required',allowCredentials:[{id:credential!.id,transports:credential!.transports}]});
   await tx.query('DELETE FROM "DurablePaymentApproval" WHERE "sessionHash"=$1',[c.sessionHash]);
   await tx.query(`INSERT INTO "DurablePasskeyChallenge" ("sessionHash",kind,challenge,"rpId",origin,digest,"expiresAt") VALUES ($1,$2,$3,$4,$5,$6,statement_timestamp()+INTERVAL '2 minutes') ON CONFLICT ("sessionHash") DO UPDATE SET kind=EXCLUDED.kind,challenge=EXCLUDED.challenge,"rpId"=EXCLUDED."rpId",origin=EXCLUDED.origin,digest=EXCLUDED.digest,"expiresAt"=EXCLUDED."expiresAt"`,[c.sessionHash,registering?'register':'authenticate',options.challenge,c.rpID,c.origin,digest]);
   return options;
  }
  if(input.action!=='register-verify'&&input.action!=='authenticate-verify')return {error:'PASSKEY_INVALID_ACTION'};
  // DELETE RETURNING consumes invalid verification attempts too; error is thrown only after commit.
  const {rows:[challenge]}=await tx.query('DELETE FROM "DurablePasskeyChallenge" WHERE "sessionHash"=$1 RETURNING *,"expiresAt">statement_timestamp() AS fresh',[c.sessionHash]);
  const registering=input.action==='register-verify';
  if(!challenge||challenge.fresh!==true||challenge.kind!==(registering?'register':'authenticate')||challenge.rpId!==c.rpID||challenge.origin!==c.origin)return {error:'PASSKEY_CHALLENGE_INVALID'};
  if(registering){
    if(credential)return {error:'PASSKEY_ALREADY_REGISTERED'};
    const result=await verify.verifyRegistrationResponse({response:input.response as Parameters<typeof verifyRegistrationResponse>[0]['response'],expectedChallenge:String(challenge.challenge),expectedOrigin:c.origin,expectedRPID:c.rpID,requireUserVerification:true}).catch(()=>undefined);
    if(!result?.verified||!result.registrationInfo)return {error:'PASSKEY_VERIFICATION_FAILED'};
    const key=result.registrationInfo.credential;
    await tx.query('INSERT INTO "DurablePasskeyCredential" (id,"userId","rpId","publicKey",counter,transports) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',[key.id,c.userId,c.rpID,Buffer.from(key.publicKey).toString('base64'),key.counter,JSON.stringify(key.transports??[])]);
    return {verified:true};
   }
   if(!credential||!challenge.digest)return {error:'PASSKEY_NOT_REGISTERED'};
   const result=await verify.verifyAuthenticationResponse({response:input.response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],expectedChallenge:String(challenge.challenge),expectedOrigin:c.origin,expectedRPID:c.rpID,credential,requireUserVerification:true}).catch(()=>undefined);
   if(!result?.verified)return {error:'PASSKEY_VERIFICATION_FAILED'};
   const token=randomBytes(32).toString('hex');
   await tx.query('UPDATE "DurablePasskeyCredential" SET counter=$2 WHERE id=$1',[credential.id,result.authenticationInfo.newCounter]);
   await tx.query(`INSERT INTO "DurablePaymentApproval" ("tokenHash","sessionHash","credentialId",digest,"expiresAt") VALUES ($1,$2,$3,$4,statement_timestamp()+INTERVAL '1 minute')`,[hash(token),c.sessionHash,credential.id,challenge.digest]);
   return {token};

 });
 if('error' in result)throw new Error(String(result.error));return result;
}
/** Must run INSIDE the same transaction as a future financial command. No standalone debit authorization. */
export async function consumeDurableApproval(tx:WalletTx,c:Context,token:string,digest:string){
 if(!/^[a-f0-9]{64}$/.test(token)||!/^[a-f0-9]{64}$/.test(digest))throw new Error('PAYMENT_APPROVAL_REQUIRED');
 await assertDurableSession(tx,c);
 const {rows:[role]}=await tx.query("SELECT current_user='sirocash_financial_worker' AS financial");
 if(role?.financial===true){await tx.query('SELECT public.financial_consume_approval($1::uuid,$2,$3,$4,$5)',[c.userId,c.sessionHash,c.rpID,hash(token),digest]);return}
 const {rows:[row]}=await tx.query(`UPDATE "DurablePaymentApproval" a SET "consumedAt"=statement_timestamp() FROM "DurablePasskeyCredential" k WHERE a."tokenHash"=$1 AND a."sessionHash"=$2 AND a.digest=$3 AND a."consumedAt" IS NULL AND a."expiresAt">statement_timestamp() AND k.id=a."credentialId" AND k."userId"=$4 AND k."rpId"=$5 RETURNING a."tokenHash"`,[hash(token),c.sessionHash,digest,c.userId,c.rpID]);
 if(!row)throw new Error('PAYMENT_APPROVAL_REQUIRED');
}
