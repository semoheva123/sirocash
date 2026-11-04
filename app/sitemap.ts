import type {MetadataRoute} from 'next';
import {siteOrigin} from '@/lib/public-seo';
export default function sitemap():MetadataRoute.Sitemap{return ['/','/features','/install','/en','/support','/trust','/privacy','/terms'].map(path=>({url:siteOrigin+(path==='/'?'':path),...(path==='/'||path==='/en'?{alternates:{languages:{ar:siteOrigin,'en':siteOrigin+'/en','x-default':siteOrigin}}}:{} )}))}
