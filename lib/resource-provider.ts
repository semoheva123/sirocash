/** Private provider boundary. Synthetic implementations belong in tests, never runtime config. */
export type ResourceOrder={requestKey:string;sender:string;energyAmount:number;bandwidthAmount?:number;durationMinutes:60;maxCostSun:bigint;signal:AbortSignal};
export type ResourceReceipt={orderId:string;status:'new'|'pending'|'success'|'failed';actualCostSun:bigint;priceExceeded:boolean;delegationTxId?:string};
export type ResourceProvider={
 purchaseBlocker?:()=>string|undefined;
 quote:(o:ResourceOrder)=>Promise<{costSun:bigint;expiresAt:number}>;
 send:(o:ResourceOrder)=>Promise<{orderId:string}>;
 check:(o:ResourceOrder)=>Promise<ResourceReceipt>;
 bandwidthPackage?:(required:number,signal:AbortSignal)=>Promise<number>;
};
