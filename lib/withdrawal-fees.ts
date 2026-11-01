/** Platform service tariff, not a claim about blockchain gas costs. USDT only. */
export const withdrawalFeePolicy = 'usdt-gross-deducted-v1';
export function quoteUsdtWithdrawal(network: string, gross: string) {
 if (network !== 'TRC20' && network !== 'BEP20') throw new Error('WITHDRAWAL_TARIFF_NOT_CONFIGURED');
 if (!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(gross)) throw new Error('INVALID_WITHDRAWAL_AMOUNT');
 const [whole, fraction=''] = gross.split('.');
 const amount = BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 const fee = network === 'TRC20' ? 5000000n : 2000000n;
 if (amount <= fee) throw new Error('WITHDRAWAL_AMOUNT_MUST_EXCEED_FEE');
 const format = (v:bigint) => `${v/1000000n}.${String(v%1000000n).padStart(6,'0')}`;
 return { asset:'USDT' as const,network,gross:format(amount),fee:format(fee),net:format(amount-fee),policy:withdrawalFeePolicy };
}
