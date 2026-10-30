import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {chainSchema,withdrawalSchema} from '../lib/validation';
import {paymentDigest} from '../lib/payment-intent';
import {assetNetworks} from '../lib/crypto-assets';
async function main(){
for(const [asset,chains] of Object.entries(assetNetworks))for(const chain of chains){
 assert.equal(chainSchema.safeParse({asset,chain}).success,true);
 assert.equal(withdrawalSchema.safeParse({asset,chain,recipient:chain==='TRC20'?'T'+'a'.repeat(33):'0x'+'a'.repeat(40),amount:1.25,pin:'123456'}).success,true);
}
for(const [asset,chain] of [['USDC','TRC20'],['USDC','BEP20'],['USDT','ETHEREUM'],['USDC','UNKNOWN'],['BTC','ETHEREUM']])assert.equal(chainSchema.safeParse({asset,chain}).success,false);
assert.equal(chainSchema.parse({chain:'TRC20'}).asset,'USDT');
assert.equal(withdrawalSchema.safeParse({asset:'USDC',chain:'ETHEREUM',recipient:'T'+'a'.repeat(33),amount:5,pin:'123456'}).success,false);
const path='/api/wallet/withdraw',payload={asset:'USDC',chain:'ETHEREUM',recipient:'0x'+'a'.repeat(40),amount:5,pin:'123456'};
const hash=paymentDigest(path,payload);
for(const changed of [{asset:'USDT'},{chain:'POLYGON'},{amount:6},{recipient:'0x'+'b'.repeat(40)}])assert.notEqual(hash,paymentDigest(path,{...payload,...changed}));
assert.equal(hash,paymentDigest(path,{...payload,pin:'654321'}));
const db=new PGlite();
for(const dir of (await readdir('prisma/migrations')).sort()){if(dir.endsWith('.toml'))continue;await db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'))}
const {rows:[user]}=await db.query<{id:string}>('INSERT INTO "User" (id,email) VALUES (gen_random_uuid(),$1) RETURNING id',['crypto@example.com']);
await db.query('INSERT INTO "DepositAddress" (id,"userId",chain,asset,address,"derivationIndex") VALUES (gen_random_uuid(),$1,$2,$3,$4,1)',[user.id,'ETHEREUM','USDC','demo-eth']);
await assert.rejects(()=>db.query('INSERT INTO "DepositAddress" (id,"userId",chain,asset,address,"derivationIndex") VALUES (gen_random_uuid(),$1,$2,$3,$4,2)',[user.id,'TRC20','USDC','demo-invalid']));
const {rows:[tx]}=await db.query<{id:string}>('INSERT INTO "Transaction" (id,"senderId",amount,type,"idempotencyKey","cryptoAsset","cryptoChain") VALUES (gen_random_uuid(),$1,5,\'WITHDRAWAL\',\'usdc-intent\',\'USDC\',\'ETHEREUM\') RETURNING id',[user.id]);
await assert.rejects(()=>db.query('UPDATE "Transaction" SET "cryptoAsset"=\'USDT\',"cryptoChain"=\'BEP20\' WHERE id=$1',[tx.id]));
await assert.rejects(()=>db.query('INSERT INTO "Transaction" (id,"senderId",amount,type,"idempotencyKey","cryptoAsset","cryptoChain") VALUES (gen_random_uuid(),$1,5,\'WITHDRAWAL\',\'invalid-network\',\'USDC\',\'TRC20\')',[user.id]));
await assert.rejects(()=>db.query('INSERT INTO "Transaction" (id,"senderId",amount,type,"idempotencyKey","cryptoAsset") VALUES (gen_random_uuid(),$1,5,\'WITHDRAWAL\',\'incomplete-metadata\',\'USDC\')',[user.id]));
await db.close();
console.log('Crypto tests passed: USDT/USDC network allowlists, address validation, default compatibility, asset-bound approval, migrations and immutable asset/network metadata.');

}
main().catch(error=>{console.error(error);process.exitCode=1});
