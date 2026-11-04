/** Only canonical mainnet explorers and validated hashes; never trust a URL from an API. */
export function transactionExplorer(network:string,txId:string):string|null{
 if(network==='TRC20'&&/^[a-fA-F0-9]{64}$/.test(txId))return `https://tronscan.org/#/transaction/${txId}`;
 if(network==='BEP20'&&/^0x[a-fA-F0-9]{64}$/.test(txId))return `https://bscscan.com/tx/${txId}`;
 return null;
}
