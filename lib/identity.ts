import {createHmac} from 'node:crypto';
export const IDENTITY_CONSENT='identity-v1';
export const DOCUMENT_LIMIT=1500000;
export const BODY_LIMIT=3200000;
export const identityKinds=['national_id','passport','residence_permit'] as const;
export function identityStorageConfig(env:Readonly<Record<string,string|undefined>>=process.env){
 const days=Number(env.IDENTITY_RETENTION_DAYS);let url:URL;try{url=new URL(env.IDENTITY_WORKER_URL||'')}catch{return null}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!env.IDENTITY_SERVICE_TOKEN||env.IDENTITY_SERVICE_TOKEN.length<32||!env.IDENTITY_SUBJECT_SECRET||env.IDENTITY_SUBJECT_SECRET.length<32||!Number.isInteger(days)||days<1||days>90)return null;
 return {url:url.origin,token:env.IDENTITY_SERVICE_TOKEN,subjectSecret:env.IDENTITY_SUBJECT_SECRET,days};
}
export function identityConfig(env:Readonly<Record<string,string|undefined>>=process.env){return env.IDENTITY_COLLECTION_ENABLED==='true'?identityStorageConfig(env):null}
export function identitySubject(id:string,secret:string){return createHmac('sha256',secret).update('sirocash-identity-v1:'+id).digest('hex')}
export function identityOrigin(request:Request){
 const origin=request.headers.get('origin');if(!origin)throw Error('origin');
 const parsed=new URL(origin);if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==origin)throw Error('origin');
 // Next may build Request.url with its bind address. Never trust a client-supplied forwarded-host.
 const fixed=process.env.WEBAUTHN_ORIGIN;
 if(fixed?origin!==new URL(fixed).origin:parsed.host!==(request.headers.get('host')||new URL(request.url).host))throw Error('origin');
}
export async function boundedIdentityBody(request:Request,max=BODY_LIMIT){
 if(Number(request.headers.get('content-length')||0)>max)throw Error('size');const reader=request.body?.getReader();if(!reader)throw Error('body');let size=0;const parts:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('size')}parts.push(value)}
 return Buffer.concat(parts);
}
export async function identityGateway(userId:string,path:string,options:{method?:string;body?:BodyInit;review?:boolean}={}){
 const config=identityStorageConfig();if(!config)throw Error('unavailable');
 const token=options.review?process.env.IDENTITY_REVIEW_TOKEN:config.token;
 if(!token||token.length<32||(options.review&&token===config.token))throw Error('unavailable');
 const headers:Record<string,string>={Authorization:'Bearer '+token,[options.review?'X-Identity-Actor':'X-Identity-Subject']:identitySubject(userId,config.subjectSecret)};
 if(typeof options.body==='string')headers['Content-Type']='application/json';
 return fetch(config.url+path,{method:options.method||'GET',body:options.body,headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
}
