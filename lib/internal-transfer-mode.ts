/** Independent ledger-only activation. Never grants signing, provider, outbox or withdrawal access. */
export function internalTransfersEnabled(env:Readonly<Record<string,string|undefined>>=process.env){
 return env.VERCEL_ENV==='production'&&env.SIRO_INTERNAL_TRANSFERS_ENABLED==='true'&&env.SIRO_DURABLE_PASSKEY_ENABLED==='true';
}
