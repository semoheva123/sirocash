import assert from 'node:assert/strict';
import {sameOrigin} from '../lib/api';
const old={NODE_ENV:process.env.NODE_ENV,WEBAUTHN_ORIGIN:process.env.WEBAUTHN_ORIGIN};
try{
 Object.assign(process.env,{NODE_ENV:'production',WEBAUTHN_ORIGIN:'https://www.sirocash.online'});
 const request=(origin:string,site='same-origin')=>new Request('https://www.sirocash.online/api/auth/email',{method:'POST',headers:{origin,'sec-fetch-site':site}});
 assert.doesNotThrow(()=>sameOrigin(request('https://www.sirocash.online')));
 for(const origin of ['https://evil.example','https://www.sirocash.online.evil.example','https://sirocash.vercel.app','https://sirocash.online','http://www.sirocash.online','null'])assert.throws(()=>sameOrigin(request(origin)));
 assert.throws(()=>sameOrigin(request('https://www.sirocash.online','cross-site')));
 assert.throws(()=>sameOrigin(new Request('https://www.sirocash.online/api/auth/email',{method:'POST'})));
 const spoof=new Request('https://www.sirocash.online/api/auth/email',{method:'POST',headers:{origin:'https://evil.example',host:'www.sirocash.online','x-forwarded-host':'www.sirocash.online'}});
 assert.throws(()=>sameOrigin(spoof));
 console.log('Canonical domain PASS: www custom origin accepted; apex must redirect before form submission; foreign, missing, insecure and spoofed origins rejected. No HTTP requests or sign-in attempts.');
}finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
