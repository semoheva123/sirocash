export type TransferPartiesData={senderUid?:string|null;senderName?:string|null;senderUsername?:string|null;recipientUid?:string|null;recipientName?:string|null;recipientUsername?:string|null};
/** A 2xx response alone is not proof of recipient credit. The transfer endpoint
 * returns this state/reference only after the atomic ledger transaction commits. */
export function completedInternalTransfer(value:unknown):boolean{
 if(!value||typeof value!=='object')return false;
 const r=value as Record<string,unknown>,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 return r.state==='COMPLETED'&&typeof r.id==='string'&&uuid.test(r.id)&&typeof r.transactionId==='string'&&uuid.test(r.transactionId);
}
