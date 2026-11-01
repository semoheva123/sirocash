import assert from 'node:assert/strict';
import {internalTransfersEnabled} from '../lib/internal-transfer-mode';
import {customerTransfersEnabled,customerWithdrawalsEnabled,customerFinancialHttp} from '../lib/customer-financial-http';
import {financialDatabase} from '../lib/financial-database';
import {internalTransferReviewHref,internalTransferPrefill} from '../lib/wallet-presentation';
import {verifyInternalTransferReadiness} from '../lib/internal-transfer-readiness';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){
 const env={VERCEL_ENV:'production',SIRO_INTERNAL_TRANSFERS_ENABLED:'true',SIRO_DURABLE_PASSKEY_ENABLED:'true',SIRO_DEPOSIT_ONLY_ENABLED:'true',SIRO_CUSTOMER_FINANCE_ENABLED:'false',SIRO_OUTBOX_WORKER_ENABLED:'false',SIRO_WITHDRAWALS_ENABLED:'false',WEBAUTHN_ORIGIN:'https://sirocash.vercel.app',SIRO_FEE_ACCOUNT_ID:'11111111-1111-4111-8111-111111111111',SIRO_SETTLEMENT_ACCOUNT_ID:'22222222-2222-4222-8222-222222222222'};
 assert(internalTransfersEnabled(env));for(const field of ['VERCEL_ENV','SIRO_INTERNAL_TRANSFERS_ENABLED','SIRO_DURABLE_PASSKEY_ENABLED'])assert(!internalTransfersEnabled({...env,[field]:'false'}));
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 try{
 Object.assign(process.env,env);assert(customerTransfersEnabled());assert(!customerWithdrawalsEnabled());assert.throws(()=>financialDatabase(),/DISABLED/);
 // Same-origin alone is insufficient: no authenticated customer, no transfer.
 assert.equal((await customerFinancialHttp(new Request(env.WEBAUTHN_ORIGIN+'/api/wallet/transfer',{method:'POST',headers:{origin:env.WEBAUTHN_ORIGIN},body:'{}'}),'TRANSFER')).status,400);
 }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
 const recipient='33333333-3333-4333-8333-333333333333';const href=internalTransferReviewHref('sirocash:pay:'+recipient,'100');assert.deepEqual(internalTransferPrefill(new URLSearchParams(href.split('?')[1])),{recipient,amount:'100'});
 for(const amount of ['0','-1','1e2','1.0000001'])assert.throws(()=>internalTransferReviewHref(recipient,amount));assert.throws(()=>internalTransferReviewHref('0x123','100'));
 let total=2,balanced=true;
 const db={transaction:async(run:Parameters<WalletDb['transaction']>[0])=>run({query:async(sql:string)=>({rows:sql.includes('count(*)')?[{total}]:[{balanced}]})} as never)} as WalletDb;
 assert.equal((await verifyInternalTransferReadiness(db,env)).ledgerOnly,true);
 total=1;await assert.rejects(()=>verifyInternalTransferReadiness(db,env),/POOL_UNVERIFIED/);total=2;balanced=false;await assert.rejects(()=>verifyInternalTransferReadiness(db,env),/UNBALANCED/);
 await assert.rejects(()=>verifyInternalTransferReadiness(db,{...env,SIRO_FEE_ACCOUNT_ID:env.SIRO_SETTLEMENT_ACCOUNT_ID}),/ACCOUNTS/);
 console.log('Internal transfers PASS: independent opt-in, deposit-only coexistence, outbox/withdrawals closed, authentication required, secure review and read-only pool/journal deployment guards.');
}
void main().catch(e=>{console.error(e);process.exitCode=1});
