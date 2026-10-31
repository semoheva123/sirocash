import {financialConnectionString} from './financial-connection';
/** LISTEN must use a dedicated session connection, NEVER transaction pooling. */
export function financialEventConnection(env:Record<string,string|undefined>){
 const value=env.FINANCIAL_EVENTS_DATABASE_URL??financialConnectionString(env);
 if(!value)throw Error('FINANCIAL_EVENTS_CONNECTION_REQUIRED');
 const url=new URL(value);
 if(!/^sirocash_financial_worker(?:\.[a-z0-9]+)?$/.test(decodeURIComponent(url.username)))throw Error('FINANCIAL_EVENTS_UNSAFE_ROLE');
 if(url.port==='6543'){
  if(!url.hostname.endsWith('.pooler.supabase.com'))throw Error('FINANCIAL_EVENTS_SESSION_CONNECTION_REQUIRED');
  url.port='5432'; // Supabase session pooler preserves LISTEN state for this dedicated client.
 }
 return url.toString();
}
