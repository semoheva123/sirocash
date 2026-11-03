import 'server-only';

/** Identify the actual requesting application, never a browser-supplied Origin.
 * Useful for provider keys bound to the application's verified domain. This is
 * not a fallback host, proxy, browser impersonation, or redirect bypass. */
export function exchangeProviderHeaders(key:string,siteOrigin='https://www.sirocash.online'){
 const url=new URL(siteOrigin);
 if(url.protocol!=='https:'||!['www.sirocash.online','sirocash.online'].includes(url.hostname)||url.port||url.username||url.password)throw Error('EXCHANGE_ORIGIN_INVALID');
 return {'X-API-Key':key.trim(),Accept:'application/json',Origin:url.origin,Referer:url.origin+'/'};
}
/** Only recognized constant error identifiers reach diagnostics. Never retain
 * an upstream message, arbitrary code, response body, URL or key. */
export function exchangeProviderFailure(raw:unknown){
 const error=raw&&typeof raw==='object'&&'error' in raw?(raw as {error:unknown}).error:null;
 const value=error&&typeof error==='object'&&'code' in error?(error as {code:unknown}).code:null;
 const codes=new Set(['MISSING_API_KEY','INVALID_API_KEY','INVALID_KEY','API_KEY_DISABLED','API_KEY_INACTIVE','API_KEY_EXPIRED','KEY_INACTIVE','KEY_EXPIRED','KEY_DISABLED','DOMAIN_NOT_ALLOWED','ORIGIN_NOT_ALLOWED','IP_NOT_ALLOWED','FORBIDDEN','UNAUTHORIZED','ACCESS_DENIED','ENDPOINT_NOT_ALLOWED','PLAN_REQUIRED','SUBSCRIPTION_REQUIRED','RATE_LIMIT_EXCEEDED','MONTHLY_LIMIT_EXCEEDED','QUOTA_EXCEEDED']);
 return {providerCode:typeof value==='string'&&codes.has(value)?value:'UNRECOGNIZED_RESPONSE'};
}
