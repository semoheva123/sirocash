import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import sharp from 'sharp';
import {identityConfig,identityStorageConfig,identitySubject,identityOrigin,boundedIdentityBody} from '../lib/identity';
import {normalizeIdentityImage,identityOcr} from '../lib/identity-image';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {purge} from '../cloudflare/identity/worker.mjs';
import {IdentityVerification} from '../components/identity-verification';
const token='intake-'.padEnd(48,'x'),reviewToken='review-'.padEnd(48,'y'),subject='a'.repeat(64),other='b'.repeat(64);
async function main(){
 assert.equal(identityConfig({}),null);
 const env={IDENTITY_COLLECTION_ENABLED:'true',IDENTITY_WORKER_URL:'https://identity.example.test',IDENTITY_SERVICE_TOKEN:token,IDENTITY_SUBJECT_SECRET:'s'.repeat(48),IDENTITY_RETENTION_DAYS:'7'};
 assert.ok(identityConfig(env));const lifetimeEnv={...env,IDENTITY_RETENTION_POLICY:'account_lifetime',IDENTITY_RETENTION_DAYS:''};assert.ok(identityStorageConfig(lifetimeEnv));assert.equal(identityConfig(lifetimeEnv),null);assert.ok(identityConfig({...lifetimeEnv,IDENTITY_LIFECYCLE_ENABLED:'true',CRON_SECRET:'c'.repeat(48)}));assert.ok(identityStorageConfig({...env,IDENTITY_COLLECTION_ENABLED:'false'}));for(const change of [{IDENTITY_WORKER_URL:'http://identity.example.test'},{IDENTITY_WORKER_URL:'https://example.test/other'},{IDENTITY_RETENTION_DAYS:'0'},{IDENTITY_RETENTION_DAYS:'91'},{IDENTITY_COLLECTION_ENABLED:'false'},{IDENTITY_SERVICE_TOKEN:'short'}])assert.equal(identityConfig({...env,...change}),null);
 assert.equal(identitySubject('user1',env.IDENTITY_SUBJECT_SECRET),identitySubject('user1',env.IDENTITY_SUBJECT_SECRET));assert.notEqual(identitySubject('user1',env.IDENTITY_SUBJECT_SECRET),identitySubject('user2',env.IDENTITY_SUBJECT_SECRET));
 for(const origin of ['', 'https://evil.test'])assert.throws(()=>identityOrigin(new Request('https://wallet.test/api/identity',{headers:{origin}})));identityOrigin(new Request('https://wallet.test/api/identity',{headers:{origin:'https://wallet.test'}}));
 await assert.rejects(boundedIdentityBody(new Request('https://wallet.test',{method:'POST',body:'x'.repeat(100)}),50));
 for(const ar of [true,false]){const html=renderToStaticMarkup(<IdentityVerification ar={ar}/>);assert.ok(html.includes(ar?'قراءة النص لا تثبت':'OCR is not proof'));assert.ok(!html.includes('type="file"'));assert.ok(html.includes('identity-verification'))}
 const image=await sharp({create:{width:900,height:650,channels:3,background:'#ccddee'}}).jpeg().toBuffer();const normalized=await normalizeIdentityImage(image);assert.equal(normalized.checks.width,900);assert.equal((await sharp(normalized.data).metadata()).exif,undefined);
 await assert.rejects(normalizeIdentityImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')));
 await assert.rejects(normalizeIdentityImage(await sharp({create:{width:599,height:700,channels:3,background:'#fff'}}).jpeg().toBuffer()));
 const text=await sharp(Buffer.from('<svg width="1000" height="650"><rect width="100%" height="100%" fill="white"/><text x="70" y="180" font-family="sans-serif" font-size="65" fill="black">SYNTHETIC TEST ONLY</text><text x="70" y="300" font-size="55" fill="black">NOT AN ID DOCUMENT</text></svg>')).jpeg().toBuffer();
 const ocr=await identityOcr([text]);assert.equal(ocr[0].status,'completed');assert.ok(ocr[0].characters>10);assert.deepEqual(Object.keys(ocr[0]).sort(),['characters','confidence','status']);
 const mf=new Miniflare({modules:true,script:await readFile('cloudflare/identity/worker.mjs','utf8'),compatibilityDate:'2026-07-01',d1Databases:['IDENTITY_DB'],bindings:{IDENTITY_SERVICE_TOKEN:token,IDENTITY_REVIEW_TOKEN:reviewToken}});
 try{
  const db=await mf.getD1Database('IDENTITY_DB');const sql=(await readFile('cloudflare/identity/migrations/0001_identity.sql','utf8'))+'\n'+(await readFile('cloudflare/identity/migrations/0002_account_retention.sql','utf8'))+'\n'+(await readFile('cloudflare/identity/migrations/0003_d1_documents.sql','utf8'));for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  const bucket={
   list:async()=>({objects:(await db.prepare('SELECT document_key AS key FROM identity_documents').all<{key:string}>()).results}),
   get:async(key:string)=>db.prepare('SELECT bytes FROM identity_documents WHERE document_key=?').bind(key).first(),
   put:async(key:string,bytes:Uint8Array)=>{const parent=await db.prepare('SELECT id,front_key FROM identity_requests WHERE front_key=? OR back_key=?').bind(key,key).first<{id:string;front_key:string}>();assert.ok(parent);return db.prepare('INSERT INTO identity_documents VALUES (?,?,?,?,?)').bind(key,parent.id,key===parent.front_key?'front':'back',new Uint8Array(bytes).buffer,'0'.repeat(64)).run()}
  };
  const call=async(path:string,method='GET',body?:FormData|string,review=false,owner=subject,secret=review?reviewToken:token)=>{const headers:Record<string,string>={Authorization:'Bearer '+secret,[review?'X-Identity-Actor':'X-Identity-Subject']:owner};let wire:string|Uint8Array<ArrayBuffer>|undefined=typeof body==='string'?body:undefined;if(body instanceof FormData){const serialized=new Request('https://identity.test',{method:'POST',body});headers['Content-Type']=serialized.headers.get('content-type')!;wire=new Uint8Array(await serialized.arrayBuffer())}return mf.dispatchFetch('https://identity.test'+path,{method,body:wire,headers})};
  assert.equal((await call('/requests','GET',undefined,false,subject,'wrong')).status,401);assert.equal((await call('/requests','GET',undefined,false,'bad')).status,403);
  assert.equal((await call('/review','GET',undefined,false)).status,401);
  const upload=()=>{const form=new FormData();form.set('kind','national_id');form.set('consent','identity-v3-d1');form.set('retentionDays','7');form.set('checks',JSON.stringify([0,1].map(()=>({...normalized.checks,ocr:ocr[0]}))));for(const side of ['front','back'])form.set(side,new Blob([new Uint8Array(image)],{type:'image/jpeg'}),'untrusted-filename.jpg');return form};
  const incomplete=upload();incomplete.delete('back');assert.equal((await call('/requests','POST',incomplete)).status,400);
  const invalid=upload();invalid.set('checks',JSON.stringify([{rawText:'PII must not be stored'}]));assert.equal((await call('/requests','POST',invalid)).status,400);
  const created=await call('/requests','POST',upload());assert.equal(created.status,201);const id=(await created.json() as {request:{id:string}}).request.id;
  const state=await (await call('/requests')).json() as {request:{status:string}};assert.equal(state.request.status,'pending_review');
  const isolated=await (await call('/requests','GET',undefined,false,other)).json() as {request:unknown};assert.equal(isolated.request,null);
  assert.equal((await call('/requests','POST',upload())).status,409);assert.equal((await bucket.list()).objects.length,2);
  const objects=await bucket.list();assert.ok(objects.objects.every((o:{key:string})=>!o.key.includes(subject)&&!o.key.includes('filename')));
  const d1=await db.prepare('SELECT * FROM identity_requests WHERE id=?').bind(id).first();assert.ok(!JSON.stringify(d1).includes('SYNTHETIC'));assert.ok(!JSON.stringify(d1).includes('rawText'));
  const publicJson=JSON.stringify(await (await call('/requests')).json());assert.ok(!/front_key|back_key|reviewer|checks|subject|documents\//.test(publicJson));
  const doc=await call(`/review/document?id=${id}&side=front`,'GET',undefined,true,other);assert.equal(doc.status,200);assert.equal(doc.headers.get('content-type'),'image/jpeg');assert.ok(doc.headers.get('cache-control')?.includes('no-store'));assert.ok((await doc.arrayBuffer()).byteLength>100);
  const access=await db.prepare("SELECT count(*) AS n FROM identity_audit WHERE action='document_access_front'").first();assert.equal(access?.n,1);
  const decision=(status:string,confirmed=true)=>JSON.stringify({id,status,confirmed,reason:'unreadable'});
  assert.equal((await call('/review','POST',decision('approved'),true,subject)).status,409);assert.equal((await call('/review','POST',decision('approved',false),true,other)).status,400);
  assert.equal((await call('/review','POST',decision('approved'),true,other)).status,200);assert.equal((await call('/review','POST',decision('resubmit'),true,other)).status,409);
  assert.equal((await call(`/review/document?id=${id}&side=front`,'GET',undefined,true,other)).status,404);
  assert.equal((await call('/requests','DELETE')).status,200);assert.equal((await bucket.list()).objects.length,0);assert.equal((await db.prepare('SELECT * FROM identity_requests WHERE id=?').bind(id).first())?.status,'withdrawn');
  for(let i=0;i<4;i++)assert.equal((await call('/quota','POST')).status,200);assert.equal((await call('/quota','POST')).status,429);assert.equal((await call('/quota','POST',undefined,false,other)).status,200);
  assert.equal((await call('/review/auth-attempt','POST',undefined,true,other)).status,200);
  await db.prepare("INSERT INTO identity_requests(id,subject,kind,status,front_key,checks,consent_version,created_at,expires_at) VALUES (?,?,?,'uploading',?,'[]','identity-v1',?,?)").bind(crypto.randomUUID(),other,'passport','stale/front.jpg',Date.now(),Date.now()+86400000).run();assert.equal((await call('/requests','DELETE',undefined,false,other)).status,409);
  // Scheduled cleanup executes the real worker handler against persistent emulated D1.
  const expired=crypto.randomUUID();await db.prepare("INSERT INTO identity_requests(id,subject,kind,status,front_key,checks,consent_version,created_at,expires_at) VALUES (?,?,?,'pending_review',?,'[]','identity-v1',?,?)").bind(expired,'c'.repeat(64),'passport','expired/front.jpg',1,2).run();await bucket.put('expired/front.jpg',image);
  const worker=await mf.getWorker() as unknown as {scheduled:(options:{cron:string})=>Promise<void>};await worker.scheduled({cron:'17 * * * *'});assert.equal(await bucket.get('expired/front.jpg'),null);const purged=await db.prepare('SELECT * FROM identity_requests WHERE id=?').bind(expired).first();assert.equal(purged?.status,'resubmit');assert.ok(purged?.purged_at);
  // Inject a failure into the second BLOB insert: the first insert must roll back too.
  const faultOwner='d'.repeat(64);
  await db.prepare("CREATE TRIGGER synthetic_fail_back BEFORE INSERT ON identity_documents WHEN NEW.side='back' BEGIN SELECT RAISE(ABORT,'synthetic D1 failure'); END").run();
  const fault=await call('/requests','POST',upload(),false,faultOwner);assert.equal(fault.status,503);
  const failed=await db.prepare('SELECT * FROM identity_requests WHERE subject=?').bind(faultOwner).first();assert.equal(failed?.status,'failed');assert.equal((await bucket.list()).objects.length,0);
  await db.prepare('DROP TRIGGER synthetic_fail_back').run();await purge({IDENTITY_DB:db});assert.equal((await bucket.list()).objects.length,0);
  const concurrentOwner='e'.repeat(64);const concurrent=await Promise.all([call('/requests','POST',upload(),false,concurrentOwner),call('/requests','POST',upload(),false,concurrentOwner)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);assert.equal((await call('/requests','DELETE',undefined,false,concurrentOwner)).status,200);
  const lifetimeOwner='f'.repeat(64),lifetime=upload();lifetime.set('kind','national_id');lifetime.set('retentionPolicy','account_lifetime');lifetime.set('retentionDays','0');lifetime.set('consent','identity-v3-d1-account-lifetime');
  const lifeResponse=await call('/requests','POST',lifetime,false,lifetimeOwner);assert.equal(lifeResponse.status,201);const life=await lifeResponse.json() as {request:{id:string;expiresAt:null;retentionPolicy:string}};assert.equal(life.request.expiresAt,null);assert.equal(life.request.retentionPolicy,'account_lifetime');
  await purge({IDENTITY_DB:db});assert.equal((await bucket.list()).objects.length,2);
  // Old account-lifetime records survive inactivity, and only a complete fresh primary snapshot
  // may schedule deletion. A grace window protects users created concurrently with the snapshot.
  await db.prepare('UPDATE identity_requests SET created_at=? WHERE subject=?').bind(Date.now()-86400000,lifetimeOwner).run();
  assert.equal((await call('/accounts/reconcile','POST',JSON.stringify({complete:false,observedAt:Date.now(),active:[]}))).status,400);
  assert.equal((await call('/accounts/reconcile','POST',JSON.stringify({complete:true,observedAt:1,active:[]}))).status,400);
  assert.equal((await call('/accounts/reconcile','POST',JSON.stringify({complete:true,observedAt:Date.now(),active:[lifetimeOwner]}))).status,200);assert.equal((await bucket.list()).objects.length,2);
  assert.equal((await call('/accounts/reconcile','POST',JSON.stringify({complete:true,observedAt:Date.now(),active:[]}))).status,200);assert.equal((await bucket.list()).objects.length,0);assert.equal(await db.prepare('SELECT * FROM identity_requests WHERE subject=?').bind(lifetimeOwner).first(),null);
  const big=new Uint8Array(1499000).fill(17);big.set([255,216,255],0);
  const bigOwner='1'.repeat(64),bigForm=upload();bigForm.set('kind','passport');bigForm.delete('back');bigForm.set('checks',JSON.stringify([{...normalized.checks,ocr:ocr[0]}]));bigForm.set('front',new Blob([big],{type:'image/jpeg'}),'synthetic-large.jpg');
  const bigResult=await call('/requests','POST',bigForm,false,bigOwner);assert.equal(bigResult.status,201);const bigId=(await bigResult.json() as {request:{id:string}}).request.id;
  const bigRead=await call(`/review/document?id=${bigId}&side=front`,'GET',undefined,true,other);assert.equal(bigRead.status,200);assert.deepEqual(new Uint8Array(await bigRead.arrayBuffer()),big);
  // Corruption must never be served as a valid document.
  await db.prepare("UPDATE identity_documents SET sha256=? WHERE request_id=?").bind('0'.repeat(64),bigId).run();assert.equal((await call(`/review/document?id=${bigId}&side=front`,'GET',undefined,true,other)).status,503);
  assert.equal((await call('/requests','DELETE',undefined,false,bigOwner)).status,200);
  assert.equal((await call('/not-found')).status,404);
 }finally{await mf.dispose()}
 console.log('Identity: fail-closed config, bounded uploads, CSRF, pseudonyms, local Arabic/English OCR, metadata stripping, D1-only BLOB isolation and atomic rollback, private audited access, no auto/self approval, compare-and-set decisions, withdrawal, quotas and scheduled document purge passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
