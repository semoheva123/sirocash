/** Explicit gateway allowlist; internal wallet accounting remains denominated in USD. */
export const cryptoAssets=['USDT','USDC'] as const;
export type CryptoAsset=typeof cryptoAssets[number];
export const networkIds=['TRC20','BEP20','ETHEREUM','POLYGON'] as const;
export type CryptoNetwork=typeof networkIds[number];
export const networks:Record<CryptoNetwork,{name:string;standard:string;icon:string}>={
 TRC20:{name:'TRON',standard:'TRC-20',icon:'T'},
 BEP20:{name:'BNB Smart Chain',standard:'BEP-20',icon:'◇'},
 ETHEREUM:{name:'Ethereum',standard:'ERC-20',icon:'Ξ'},
 POLYGON:{name:'Polygon PoS',standard:'Native USDC',icon:'⬡'},
};
export const assetNetworks:Record<CryptoAsset,readonly CryptoNetwork[]>={USDT:['TRC20','BEP20'],USDC:['ETHEREUM','POLYGON']};
export function supportsAsset(asset:CryptoAsset,chain:CryptoNetwork){return assetNetworks[asset].includes(chain)}
