/** An HTTP 200 alone is not evidence of a committed withdrawal request. */
export function withdrawalReceiptState(result:unknown,quoteId:string|undefined):'RESERVED'|'SUBMITTED'|'COMPLETED'|'FAILED'|null{
 if(!result||typeof result!=='object'||!quoteId)return null;
 const {operation,quote}=result as {operation?:{id?:unknown;state?:unknown};quote?:{id?:unknown}};
 if(quote?.id!==quoteId||typeof operation?.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(operation.id))return null;
 return ['RESERVED','SUBMITTED','COMPLETED','FAILED'].includes(String(operation.state))?operation.state as 'RESERVED'|'SUBMITTED'|'COMPLETED'|'FAILED':null;
}
