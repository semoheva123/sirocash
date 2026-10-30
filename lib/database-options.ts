import type {PoolConfig} from 'pg';
export function databaseOptions(connectionString:string,production:boolean,ca?:string):PoolConfig{
 const url=new URL(connectionString);
 const tls=production||Boolean(ca);
 if(tls){
  // Connection-string SSL flags must not replace the explicit verified TLS settings.
  for(const key of ['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat'])url.searchParams.delete(key);
 }
 return {
  connectionString:url.toString(),max:1,connectionTimeoutMillis:8000,idleTimeoutMillis:10000,
  query_timeout:10000,
  ...(tls?{ssl:{rejectUnauthorized:true,...(ca?{ca:ca.replace(/\\n/g,'\n')}: {})}}:{}),
 };
}
export const databaseReadinessQuery='SELECT u.id,u.email,u."passwordHash",s."tokenHash",c.id,r.id,a.id,e.id,n.id FROM "User" u,"AuthSession" s,"EmailChallenge" c,"EmailRateLimit" r,"AccountSecurityChallenge" a,"SecurityEvent" e,"SecurityNotification" n WHERE FALSE';
export function databaseFailureCategory(error:unknown){
 const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
 if(['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))return 'TLS_CERTIFICATE';
 if(['28P01','28000'].includes(code))return 'AUTHENTICATION';
 if(code==='42501')return 'PERMISSIONS';
 if(['42P01','42703'].includes(code))return 'SCHEMA';
 if(['ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET','ENETUNREACH','EHOSTUNREACH'].includes(code))return 'NETWORK';
 return 'CONNECTION_FAILED';
}
