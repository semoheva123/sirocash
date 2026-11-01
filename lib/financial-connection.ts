/** Separate worker credential; copying connection host/TLS metadata never reuses the auth password. */
export function financialConnectionString(env:Record<string,string|undefined>):string|undefined{
 if(env.FINANCIAL_DATABASE_URL)return env.FINANCIAL_DATABASE_URL;
 if(!env.FINANCIAL_DATABASE_PASSWORD)return undefined;
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(env.FINANCIAL_DATABASE_PASSWORD)||!env.DATABASE_URL)throw Error('FINANCIAL_CREDENTIAL_CONFIGURATION');
 const url=new URL(env.DATABASE_URL),username=decodeURIComponent(url.username);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!/^sirocash_app(?:\.[a-z0-9]+)?$/.test(username)||url.hash)throw Error('FINANCIAL_CREDENTIAL_CONFIGURATION');
 url.username=username.replace(/^sirocash_app/,'sirocash_financial_worker');url.password=env.FINANCIAL_DATABASE_PASSWORD;
 return url.toString();
}
