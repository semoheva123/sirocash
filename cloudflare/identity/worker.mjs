// D1-only private identity gateway. Never expose service tokens or document bytes in public APIs.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(body,status=200)=>Response.json(body,{status,headers});
const fail=(status)=>json({error:'Identity service request failed.'},status);
const validSubject=s=>/^[a-f0-9]{64}$/.test(s||'');
const validId=s=>/^[a-f0-9-]{36}$/.test(s||'');
const ACCOUNT_LIFETIME=8640000000000000;
const publicRow=r=>r?{id:r.id,kind:r.kind,status:r.status,reason:r.reason,createdAt:r.created_at,expiresAt:r.expires_at===ACCOUNT_LIFETIME?null:r.expires_at,retentionPolicy:['identity-v2-account-lifetime','identity-v3-d1-account-lifetime'].includes(r.consent_version)?'account_lifetime':'fixed_days',documentsDeleted:!!r.purged_at}:null;
async function authentic(request,secret){
 if(!secret||secret.length<32)return false;
 const candidate=request.headers.get('authorization')||'';
 const enc=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(candidate)),crypto.subtle.digest('SHA-256',enc.encode('Bearer '+secret))]);
 const aa=new Uint8Array(a),bb=new Uint8Array(b);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
async function bounded(request,max){
 const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error()}chunks.push(value)}
 const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length}return data;
}
async function form(request){const body=await bounded(request,3300000);return new Response(body,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData()}
async function audit(db,id,actor,action){await db.prepare('INSERT INTO identity_audit VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,actor,action,Date.now()).run()}
async function removeFiles(env,row){await env.IDENTITY_DB.prepare('DELETE FROM identity_documents WHERE request_id=?').bind(row.id).run()}
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function storedImage(db,key){
 const row=await db.prepare('SELECT bytes,sha256 FROM identity_documents WHERE document_key=?').bind(key).first();if(!row)return null;
 const bytes=row.bytes instanceof ArrayBuffer?new Uint8Array(row.bytes):new Uint8Array(row.bytes);
 if(bytes.length<100||bytes.length>1500000||await sha256(bytes)!==row.sha256)throw Error('stored image integrity');return bytes;
}
export async function purge(env){
 const now=Date.now();const rows=await env.IDENTITY_DB.prepare("SELECT * FROM identity_requests WHERE expires_at<=? AND purged_at IS NULL AND (status<>'uploading' OR created_at<?) LIMIT 5").bind(now,now-600000).all();
 for(const row of rows.results){
  try{await removeFiles(env,row);await env.IDENTITY_DB.batch([
   env.IDENTITY_DB.prepare("UPDATE identity_requests SET front_key=NULL,back_key=NULL,purged_at=?,status=CASE WHEN status IN ('uploading','pending_review') THEN 'resubmit' ELSE status END,reason=CASE WHEN status IN ('uploading','pending_review') THEN 'incomplete' ELSE reason END WHERE id=? AND purged_at IS NULL").bind(now,row.id),
   env.IDENTITY_DB.prepare('INSERT INTO identity_audit VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),row.id,'retention','documents_purged',now)
  ])}catch{/* Retain keys for the next retry; never log file contents, tokens or OCR text. */}
 }
 const closed=await env.IDENTITY_DB.prepare('SELECT subject FROM identity_closed_accounts LIMIT 3').all();
 for(const {subject} of closed.results){
  const pending=await env.IDENTITY_DB.prepare('SELECT count(*) AS n FROM identity_requests WHERE subject=? AND purged_at IS NULL').bind(subject).first();
  if(pending.n===0)await env.IDENTITY_DB.batch([
   env.IDENTITY_DB.prepare('DELETE FROM identity_audit WHERE request_id IN (SELECT id FROM identity_requests WHERE subject=?)').bind(subject),
   env.IDENTITY_DB.prepare('DELETE FROM identity_requests WHERE subject=?').bind(subject),
   env.IDENTITY_DB.prepare('DELETE FROM identity_quota WHERE subject=?').bind(subject),
   env.IDENTITY_DB.prepare("UPDATE identity_audit SET actor='deleted-account' WHERE actor=?").bind(subject),
   env.IDENTITY_DB.prepare('UPDATE identity_requests SET reviewer=NULL WHERE reviewer=?').bind(subject),
   env.IDENTITY_DB.prepare('DELETE FROM identity_closed_accounts WHERE subject=?').bind(subject)
  ]);
 }
 await env.IDENTITY_DB.prepare("DELETE FROM identity_quota WHERE (day NOT LIKE 'review:%' AND day<?) OR (day LIKE 'review:%' AND day<?)").bind(new Date(now-7*86400000).toISOString().slice(0,10),'review:'+new Date(now-7*86400000).toISOString().slice(0,13)).run();
}
export default {
 async fetch(request,env){
  try{
   if(env.IDENTITY_SERVICE_TOKEN===env.IDENTITY_REVIEW_TOKEN)return fail(503);
   const url=new URL(request.url),review=url.pathname.startsWith('/review');
   if(!await authentic(request,review?env.IDENTITY_REVIEW_TOKEN:env.IDENTITY_SERVICE_TOKEN))return fail(401);
   const subject=request.headers.get(review?'x-identity-actor':'x-identity-subject');if(!validSubject(subject))return fail(403);
   const db=env.IDENTITY_DB,now=Date.now();
   if(url.pathname==='/accounts/reconcile'&&request.method==='POST'){
    const snapshot=JSON.parse(new TextDecoder().decode(await bounded(request,800000)));
    if(!Number.isInteger(snapshot.observedAt)||Math.abs(now-snapshot.observedAt)>300000||snapshot.complete!==true||!Array.isArray(snapshot.active)||snapshot.active.length>10000||snapshot.active.some(s=>!validSubject(s))||new Set(snapshot.active).size!==snapshot.active.length)return fail(400);
    const active=new Set(snapshot.active);
    const stored=await db.prepare('SELECT subject FROM identity_requests GROUP BY subject HAVING MIN(created_at)<? LIMIT 10001').bind(snapshot.observedAt-600000).all();if(stored.results.length>10000)return fail(503);
    let closed=0;
    const candidates=stored.results.filter(row=>!active.has(row.subject));
    for(const row of candidates.slice(0,4)){
     await db.batch([
      db.prepare('INSERT INTO identity_closed_accounts VALUES (?,?) ON CONFLICT(subject) DO NOTHING').bind(row.subject,now),
      db.prepare("UPDATE identity_requests SET expires_at=?,status=CASE WHEN status='uploading' THEN status ELSE 'withdrawn' END WHERE subject=? AND purged_at IS NULL").bind(now,row.subject)
     ]);closed++;
    }
    await purge(env);return json({ok:true,closed,hasMore:candidates.length>4});
   }
   if(url.pathname==='/requests'&&request.method==='GET'){
    const row=await db.prepare('SELECT * FROM identity_requests WHERE subject=? ORDER BY created_at DESC LIMIT 1').bind(subject).first();
    return json({request:publicRow(row)});
   }
   if(url.pathname==='/quota'&&request.method==='POST'){
    const row=await db.prepare('INSERT INTO identity_quota VALUES (?,?,1) ON CONFLICT(subject,day) DO UPDATE SET attempts=attempts+1 WHERE attempts<4 RETURNING attempts').bind(subject,new Date(now).toISOString().slice(0,10)).first();return row?json({ok:true}):fail(429);
   }
   if(url.pathname==='/requests'&&request.method==='POST'){
    // The app proxy reserves a quota attempt BEFORE image decoding/OCR. No browser has this token.
    const data=await form(request),kind=data.get('kind'),consent=data.get('consent'),days=Number(data.get('retentionDays'));
    const front=data.get('front'),back=data.get('back'),policy=data.get('retentionPolicy')||'fixed_days';
    if(await db.prepare('SELECT subject FROM identity_closed_accounts WHERE subject=?').bind(subject).first())return fail(403);
    if(!['national_id','passport','residence_permit'].includes(kind)||!((policy==='fixed_days'&&consent==='identity-v3-d1'&&Number.isInteger(days)&&days>=1&&days<=90)||(policy==='account_lifetime'&&consent==='identity-v3-d1-account-lifetime'&&days===0)))return fail(400);
    const files=kind==='passport'?[front]:[front,back];
    if(kind==='passport'&&back)return fail(400);
    for(const f of files){if(!(f instanceof File)||f.type!=='image/jpeg'||f.size<100||f.size>1500000)return fail(400);const magic=new Uint8Array(await f.slice(0,3).arrayBuffer());if(magic[0]!==255||magic[1]!==216||magic[2]!==255)return fail(400)}
    let checks;try{checks=JSON.parse(String(data.get('checks')))}catch{return fail(400)}
    // Only aggregate diagnostics; never persist extracted names, ID numbers or raw OCR text.
    if(!Array.isArray(checks)||checks.length!==files.length||checks.some(c=>!Number.isFinite(c.width)||!Number.isFinite(c.height)||!Number.isFinite(c.contrast)||!['completed','unavailable'].includes(c.ocr?.status)||(c.ocr.status==='completed'&&(!Number.isFinite(c.ocr.confidence)||!Number.isInteger(c.ocr.characters)||c.ocr.characters<0))||Object.keys(c).some(k=>!['width','height','contrast','ocr'].includes(k))||Object.keys(c.ocr).some(k=>!['status','confidence','characters'].includes(k))))return fail(400);
    const id=crypto.randomUUID(),frontKey=`documents/${id}/front.jpg`,backKey=files.length===2?`documents/${id}/back.jpg`:null;
    try{await db.prepare("INSERT INTO identity_requests(id,subject,kind,status,front_key,back_key,checks,consent_version,created_at,expires_at) VALUES (?,?,?,'uploading',?,?,?,?,?,?)").bind(id,subject,kind,frontKey,backKey,JSON.stringify(checks),consent,now,policy==='account_lifetime'?ACCOUNT_LIFETIME:now+days*86400000).run()}catch{return fail(409)}
    try{
     const writes=[];
     for(let i=0;i<files.length;i++){
      const bytes=await files[i].arrayBuffer();
      writes.push(db.prepare('INSERT INTO identity_documents(document_key,request_id,side,bytes,sha256) VALUES (?,?,?,?,?)').bind(i===0?frontKey:backKey,id,i===0?'front':'back',bytes,await sha256(bytes)));
     }
     // D1 batch is transactional: both document copies and the review transition commit together.
     await db.batch([...writes,db.prepare("UPDATE identity_requests SET status='pending_review' WHERE id=? AND status='uploading'").bind(id),db.prepare('INSERT INTO identity_audit VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,subject,'submitted',now)]);
    }catch{
     // A failed document transaction leaves no partial image rows. The request remains retry-cleanable.
     await db.prepare("UPDATE identity_requests SET status='failed',expires_at=? WHERE id=?").bind(now,id).run();return fail(503);
    }
    return json({request:publicRow(await db.prepare('SELECT * FROM identity_requests WHERE id=?').bind(id).first())},201);
   }
   if(url.pathname==='/requests'&&request.method==='DELETE'){
    const row=await db.prepare('SELECT * FROM identity_requests WHERE subject=? ORDER BY created_at DESC LIMIT 1').bind(subject).first();if(!row)return fail(404);if(row.status==='uploading')return fail(409);
    // Withdraw first to exclude simultaneous approval; retain manifest until all deletions succeed.
    await db.batch([db.prepare("UPDATE identity_requests SET status='withdrawn',expires_at=? WHERE id=?").bind(now,row.id),db.prepare('INSERT INTO identity_audit VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),row.id,subject,'withdrawn',now)]);
    await removeFiles(env,row);await db.prepare('UPDATE identity_requests SET front_key=NULL,back_key=NULL,purged_at=? WHERE id=?').bind(now,row.id).run();return json({ok:true});
   }
   if(url.pathname==='/review/auth-attempt'&&request.method==='POST'){
    const window='review:'+new Date(now).toISOString().slice(0,13);
    const row=await db.prepare('INSERT INTO identity_quota VALUES (?,?,1) ON CONFLICT(subject,day) DO UPDATE SET attempts=attempts+1 WHERE attempts<60 RETURNING attempts').bind(subject,window).first();return row?json({ok:true}):fail(429);
   }
   if(url.pathname==='/review'&&request.method==='GET'){
    const rows=await db.prepare("SELECT * FROM identity_requests WHERE status='pending_review' AND expires_at>? ORDER BY created_at LIMIT 30").bind(now).all();return json({requests:rows.results.map(r=>({...publicRow(r),checks:JSON.parse(r.checks)}))});
   }
   if(url.pathname==='/review/document'&&request.method==='GET'){
    const id=url.searchParams.get('id'),side=url.searchParams.get('side');if(!validId(id)||!['front','back'].includes(side))return fail(400);
    const row=await db.prepare("SELECT * FROM identity_requests WHERE id=? AND status='pending_review' AND expires_at>? AND purged_at IS NULL").bind(id,now).first();if(!row)return fail(404);
    const key=side==='front'?row.front_key:row.back_key;if(!key)return fail(404);
    await audit(db,id,subject,'document_access_'+side);const bytes=await storedImage(db,key);if(!bytes)return fail(404);
    return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="identity-document.jpg"','Content-Security-Policy':"default-src 'none'; sandbox"}});
   }
   if(url.pathname==='/review'&&request.method==='POST'){
    const body=JSON.parse(new TextDecoder().decode(await bounded(request,2048)));
    if(!validId(body.id)||!['approved','resubmit'].includes(body.status)||body.confirmed!==true||(body.status==='resubmit'&&!['unreadable','incomplete','unsupported','details_mismatch'].includes(body.reason)))return fail(400);
    const decision=crypto.randomUUID();const result=await db.batch([
     db.prepare("UPDATE identity_requests SET status=?,reason=?,reviewed_at=?,reviewer=?,decision_id=? WHERE id=? AND status='pending_review' AND expires_at>? AND subject<>? AND purged_at IS NULL RETURNING id").bind(body.status,body.status==='resubmit'?body.reason:null,now,subject,decision,body.id,now,subject),
     db.prepare('INSERT INTO identity_audit SELECT ?,id,?,?,? FROM identity_requests WHERE id=? AND decision_id=?').bind(crypto.randomUUID(),subject,body.status,now,body.id,decision)
    ]);return result[0].results.length?json({ok:true}):fail(409);
   }
   return fail(404);
  }catch{return fail(503)}
 },
 async scheduled(_event,env,ctx){ctx.waitUntil(purge(env))}
};
