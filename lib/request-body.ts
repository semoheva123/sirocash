/** Bound decoded bytes, including chunked requests; never trust Content-Length alone. */
export async function readJson(request:Request,limit=16384,timeoutMs=5000):Promise<any>{
 const size=request.headers.get('content-length');
 if(size!==null&&(!/^\d+$/.test(size)||Number(size)>limit))throw new SyntaxError('Invalid body size');
 if(!request.body)throw new SyntaxError('Missing body');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new SyntaxError('Body timeout'))},timeoutMs)});
 try{
  return await Promise.race([(async()=>{
   for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw new SyntaxError('Body too large');chunks.push(value)}
   const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  })(),deadline]);
 }catch{void reader.cancel().catch(()=>{});throw new SyntaxError('Invalid JSON body')}
 finally{clearTimeout(timer);reader.releaseLock()}
}
