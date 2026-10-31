/** USD accounting gross limits. Email verification/preliminary AI screening are NOT final identity approval. */
export const withdrawalLimits = Object.freeze({unverifiedPerWithdrawalMicros:100000000n,verifiedPerWithdrawalMicros:1000000000n,platformDailyMicros:10000000000n});
export function enforceWithdrawalLimit(grossUsd:string,kycStatus:unknown){
 if(!/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(grossUsd))throw new Error('INVALID_WITHDRAWAL_AMOUNT');
 const [whole,fraction='']=grossUsd.split('.');
 const gross=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 const limit=kycStatus==='VERIFIED'?withdrawalLimits.verifiedPerWithdrawalMicros:withdrawalLimits.unverifiedPerWithdrawalMicros;
 if(gross<=0n||gross>limit)throw new Error('WITHDRAWAL_IDENTITY_LIMIT_EXCEEDED');
 return {grossMicros:gross,limitMicros:limit};
}
