// Probe only unauthenticated, read-only requests. Never retry document mutations.
const networkCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET']);
export async function waitForIdentityGateway(origin,{fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=8,report=()=>{}}={}){
 let reason='NETWORK_ERROR';
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const response=await fetcher(origin+'/requests',{redirect:'error',signal:AbortSignal.timeout(10000)});
   const status=response.status;
   // Consume no document data or error bodies; release the connection before retrying.
   await response.body?.cancel();
   if(status===401){report('Gateway reachable; unauthenticated access denied (HTTP 401).');return}
   reason='HTTP '+status;
   if(status>=200&&status<300)throw new Error('UNEXPECTED_PUBLIC_ACCESS');
  }catch(error){
   if(error.message==='UNEXPECTED_PUBLIC_ACCESS')throw new Error('Identity gateway unexpectedly accepted an unauthenticated request. Collection must remain disabled.');
   const code=error.cause?.code||error.code;
   reason=networkCodes.has(code)?code:error.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR';
  }
  report(`Gateway readiness attempt ${attempt+1}/${attempts}: ${reason}.`);
  if(attempt+1<attempts)await sleep(Math.min(2500*(attempt+1),10000));
 }
 throw new Error(`Identity gateway is not ready (${reason}). No document uploads were retried; collection remains disabled.`);
}
