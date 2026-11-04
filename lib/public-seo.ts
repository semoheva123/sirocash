import type {Metadata} from 'next';
export const siteOrigin='https://www.sirocash.online';
export function publicMetadata(path:string,title:string,description:string):Metadata{return {title,description,alternates:{canonical:siteOrigin+path},robots:{index:true,follow:true},openGraph:{type:'website',siteName:'SiroCash',url:siteOrigin+path,title,description,locale:path==='/en'?'en_US':'ar_AR',images:[{url:siteOrigin+'/social-card.png',width:1200,height:630,alt:'SiroCash — سيرو كاش'}]},twitter:{card:'summary_large_image',title,description,images:[siteOrigin+'/social-card.png']}}}
