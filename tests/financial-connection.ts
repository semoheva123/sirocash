import assert from 'node:assert/strict';
import {financialConnectionString} from '../lib/financial-connection';
const password='f'.repeat(64),base='postgresql://sirocash_app.project:auth-only@pool.example.com:6543/postgres?sslmode=require';
const u=new URL(financialConnectionString({DATABASE_URL:base,FINANCIAL_DATABASE_PASSWORD:password})!);
assert.equal(u.username,'sirocash_financial_worker.project');assert.equal(u.password,password);assert.equal(u.host,'pool.example.com:6543');assert.equal(u.search,'?sslmode=require');
assert(!u.toString().includes('auth-only'));assert.equal(financialConnectionString({DATABASE_URL:base}),undefined);
const explicit='postgresql://sirocash_financial_worker:explicit@db.example.com/postgres';assert.equal(financialConnectionString({FINANCIAL_DATABASE_URL:explicit,DATABASE_URL:base,FINANCIAL_DATABASE_PASSWORD:password}),explicit);
for(const user of ['postgres','sirocash_financial_worker','other','sirocash_app.evil:bad'])assert.throws(()=>financialConnectionString({DATABASE_URL:`postgresql://${encodeURIComponent(user)}:not-reused@db.example.com/postgres`,FINANCIAL_DATABASE_PASSWORD:password}));
for(const invalid of ['','short','a'.repeat(42),'x\ny'.repeat(25)]){if(!invalid)assert.equal(financialConnectionString({DATABASE_URL:base,FINANCIAL_DATABASE_PASSWORD:invalid}),undefined);else assert.throws(()=>financialConnectionString({DATABASE_URL:base,FINANCIAL_DATABASE_PASSWORD:invalid}))}
console.log('Independent financial credential PASS: distinct worker login/password, shared connection metadata only, explicit URL precedence and administrator/unsafe base refusal.');
