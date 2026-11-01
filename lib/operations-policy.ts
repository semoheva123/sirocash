/** Explicit immutable account IDs only. An unset or malformed configuration grants nobody access. */
export function operationsAllowed(userId:string,configured:string|undefined){
 const ids=(configured||'').split(',').map(s=>s.trim()).filter(s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
 return ids.includes(userId);
}
