/** Public, key-free source inspection; no credentials, retries or challenge bypass. */
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('.cache/exchange-web-inspection',{recursive:true});
const response=await fetch('https://sp-today.com/',{headers:{Accept:'text/html','User-Agent':'SiroCash-Reference/1.0 (+https://www.sirocash.online)'},redirect:'error',signal:AbortSignal.timeout(15000)});
const info={status:response.status,type:response.headers.get('content-type'),challenge:response.headers.get('cf-mitigated')==='challenge',observedAt:new Date().toISOString()};
console.log(JSON.stringify(info));
if(!response.ok||info.challenge||!info.type?.includes('text/html'))throw Error('PUBLIC_SOURCE_NOT_AVAILABLE');
const reader=response.body.getReader();let size=0;const chunks=[];
try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024)throw Error('SOURCE_TOO_LARGE');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
await writeFile('.cache/exchange-web-inspection/home.html',Buffer.concat(chunks));
await writeFile('.cache/exchange-web-inspection/result.json',JSON.stringify(info));
