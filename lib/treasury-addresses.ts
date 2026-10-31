/** Owner-confirmed public destinations only. No signer, credentials or live activation.
 * Do not use these shared treasury addresses as per-customer deposit assignments.
 * Validate signer ownership and perform controlled matching tests before activation.
 */
export const treasuryAddresses = Object.freeze({
 TRC20: Object.freeze({
  network: 'TRON_MAINNET',
  operating: 'TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL',
  // Owner reassigned the former reserve to deposits. New reserve is not configured.
  reserve: null,
 }),
 BEP20: Object.freeze({
  network: 'BNB_SMART_CHAIN_MAINNET',
  chainId: 56,
  operating: '0x31d88dEc98de331caEA32028ae9b6995B82e8Bdb',
  reserve: '0x6CD3350E7E635079038b6348781934e4040aC99b',
 }),
});
export function treasuryDestination(network: 'TRC20' | 'BEP20', role: 'operating' | 'reserve'): string {
 if (network !== 'TRC20' && network !== 'BEP20') throw new Error('UNSUPPORTED_TREASURY_NETWORK');
 if (role !== 'operating' && role !== 'reserve') throw new Error('INVALID_TREASURY_ROLE');
 const address=treasuryAddresses[network][role];
 if(!address)throw new Error('TREASURY_ROLE_NOT_CONFIGURED');
 return address;
}

/** Owner manages operating liquidity; no automatic reserve-to-operating refill authorization. */
export const treasuryFundingPolicy = Object.freeze({reserveAutoRefillEnabled:false,operatingTarget:null});
