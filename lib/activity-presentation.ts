/** Presentation only. Direction comes from the signed owner-bound entry, never its type. */
export function activityDirection(amount:string):'incoming'|'outgoing'|'neutral'{
 if(!/^-?\d{1,20}(\.\d{1,6})?$/.test(amount)||!/[1-9]/.test(amount))return 'neutral';
 return amount.startsWith('-')?'outgoing':'incoming';
}
export function activityAmount(amount:string){
 if(!/^-?\d{1,20}(\.\d{1,6})?$/.test(amount))return '—';
 const negative=amount.startsWith('-'),[whole,fraction='']=amount.replace(/^-/, '').split('.');
 return `${negative?'−':activityDirection(amount)==='incoming'?'+':''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction.length>2?fraction.replace(/0+$/, '').padEnd(2,'0'):(fraction+'00').slice(0,2)}`;
}
export const pendingActivityStates=new Set(['PENDING','RESERVED','SUBMITTED','SIGNED','BROADCAST_UNKNOWN','AWAITING_VALUATION']);
