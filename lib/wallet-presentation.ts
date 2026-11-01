/** Presentation only. This module never authorizes or executes a payment. */
export type ReceiveSnapshot={userId:string;enabled:boolean;readable?:boolean;capabilities?:{deposits?:boolean};addresses?:{network:string;address:string}[]};
export type SendNetwork='TRC20'|'BEP20';
export function walletAddressShape(value:string,network:SendNetwork){
 return network==='TRC20'?/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value):/^0x[0-9a-fA-F]{40}$/.test(value);
}
export function receiveDetails(status:ReceiveSnapshot|null,ownerId:string,method:'account'|'crypto',network:SendNetwork){
 if(!status||status.userId!==ownerId||!(status.readable===true||status.enabled))return null;
 if(method==='crypto'&&status.capabilities?.deposits===false)return null;
 if(method==='account')return {value:ownerId,qr:`sirocash:pay:${ownerId}`};
 const address=status.addresses?.find(item=>item.network===network)?.address;
 return address&&walletAddressShape(address,network)?{value:address,qr:address}:null;
}
export function withdrawalReviewHref(recipient:string,amount:string,network:SendNetwork){
 if(!walletAddressShape(recipient,network))throw Error('INVALID_ADDRESS');
 if(!/^\d{1,14}(\.\d{1,6})?$/.test(amount)||!/[1-9]/.test(amount))throw Error('INVALID_AMOUNT');
 return '/payments?'+new URLSearchParams({kind:'WITHDRAWAL',recipient,amount,chain:network}).toString();
}
export function withdrawalPrefill(params:URLSearchParams){
 if(params.get('kind')!=='WITHDRAWAL')return null;
 const chain=params.get('chain')==='BEP20'?'BEP20':'TRC20';
 const recipient=params.get('recipient')??'',amount=params.get('amount')??'';
 return {chain,recipient:walletAddressShape(recipient,chain)?recipient:'',amount:/^\d{1,14}(\.\d{1,6})?$/.test(amount)&&/[1-9]/.test(amount)?amount:''};
}

export function internalTransferReviewHref(recipient:string,amount:string){
 const account=recipient.replace(/^sirocash:pay:/,'').toLowerCase();
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(account))throw Error('INVALID_ACCOUNT');
 if(!/^\d{1,14}(\.\d{1,6})?$/.test(amount)||!/[1-9]/.test(amount))throw Error('INVALID_AMOUNT');
 return '/payments?'+new URLSearchParams({kind:'TRANSFER',recipient:account,amount}).toString();
}
export function internalTransferPrefill(params:URLSearchParams){
 if(params.get('kind')!=='TRANSFER')return null;
 try{const p=new URLSearchParams(internalTransferReviewHref(params.get('recipient')??'',params.get('amount')??'').split('?')[1]);return {recipient:p.get('recipient')!,amount:p.get('amount')!}}catch{return null}
}
