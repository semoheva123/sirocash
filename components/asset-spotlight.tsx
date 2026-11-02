'use client';
import Link from 'next/link';
import {useState} from 'react';
import {ArrowUpRight,Check,Layers} from 'lucide-react';
import {assetNetworks,networks,type CryptoAsset} from '@/lib/crypto-assets';

/** Explore compatibility, not an executable quote or a claim of account holdings. */
export function AssetSpotlight({ar}:{ar:boolean}){
 const [asset,setAsset]=useState<CryptoAsset>('USDT');const t=(en:string,arabic:string)=>ar?arabic:en;
 return <div className="premium-asset-spotlight">
  <div className="premium-asset-top"><span><Layers size={16}/>{t('DIGITAL ASSETS','العملات الرقمية')}</span><Link href="/deposit" aria-label={t('Digital asset details','تفاصيل العملات الرقمية')}><ArrowUpRight size={20}/></Link></div>
  <h3>{t('The right asset.','العملة المناسبة.')}<br/><span>{t('The right network.','والشبكة المتوافقة.')}</span></h3>
  <div className="premium-asset-switch" role="group" aria-label={t('Preview a digital asset','معاينة عملة رقمية')}>{(['USDT','USDC'] as const).map(value=><button type="button" key={value} disabled={value==='USDC'} aria-pressed={asset===value} onClick={()=>setAsset(value)}><span className={'fintech-coin '+value.toLowerCase()}>{value==='USDT'?'₮':'$'}</span><span>{value}{value==='USDC'&&<small className="asset-coming-soon">{t('Coming soon','سيتوفر قريباً')}</small>}</span>{value===asset&&<Check size={14}/>}</button>)}</div>
  <div className="premium-network-list" aria-live="polite" aria-atomic="true"><span>{t('Compatible preview networks','الشبكات المتوافقة في النموذج')}</span><div>{assetNetworks[asset].map(network=><span key={network} data-network={network} dir="ltr"><i/>{networks[network].name}</span>)}</div></div>
  <div className="premium-asset-footer"><small>{t('Preview only · No live settlement','خيارات تجريبية · دون تسوية فعلية')}</small><Link href={'/deposit?asset='+asset} aria-label={t('Explore '+asset,'استكشاف '+asset)}><ArrowUpRight size={18}/></Link></div>
 </div>;
}
