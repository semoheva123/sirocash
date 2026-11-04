import type {MetadataRoute} from 'next';
import {siteOrigin} from '@/lib/public-seo';
export default function robots():MetadataRoute.Robots{return {rules:[{userAgent:'*',allow:['/','/features','/install','/en','/support','/trust','/privacy','/terms'],disallow:['/api/','/auth','/dashboard','/wallet','/activity','/payments','/deposit','/withdraw','/send','/transactions/','/settings','/notifications','/operations','/identity-review','/exchange','/sham-cash','/mobile-topup']}],sitemap:siteOrigin+'/sitemap.xml',host:siteOrigin}}
