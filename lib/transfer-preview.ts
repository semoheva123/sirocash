/** Display-only preview of the approved sender-added 1% policy.
 * The server still prepares and authorizes the binding quote. */
export function previewInternalTransfer(value:string){
 if(!/^\d{1,14}(\.\d{1,6})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');
 const amount=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 if(amount<=0n||amount>100000n*1000000n)return null;
 const fee=(amount+99n)/100n;
 const format=(v:bigint)=>`${v/1000000n}.${String(v%1000000n).padStart(6,'0')}`;
 return {amount:format(amount),fee:format(fee),totalDebit:format(amount+fee)};
}
