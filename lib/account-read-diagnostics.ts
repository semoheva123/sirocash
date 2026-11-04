import {databaseFailureCategory} from './database-options';
type Phase='session'|'financial-bootstrap'|'identity-bootstrap';
const last=new Map<string,number>();
/** Static, throttled diagnostics only. No owner IDs, cookies, SQL, stack or error text. */
export async function measureAccountRead<T>(phase:Phase,read:()=>Promise<T>,clock:()=>number=()=>performance.now(),log:(event:string,fields:Record<string,string|number>)=>void=console.warn){
 const start=clock();
 const report=(event:string,category?:string)=>{
  const ms=Math.max(0,Math.round(clock()-start)),key=phase+event,now=Date.now();
  if(event==='ACCOUNT_READ_SLOW'&&ms<1000)return;
  if(now-(last.get(key)??0)<30000)return;last.set(key,now);
  log(event,{phase,ms,...(category?{category}:{})});
 };
 try{const value=await read();report('ACCOUNT_READ_SLOW');return value}
 catch(error){report('ACCOUNT_READ_FAILED',databaseFailureCategory(error));throw error}
}
