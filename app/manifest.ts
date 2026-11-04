import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest{return {
 id:'/',name:'SiroCash — سيرو كاش',short_name:'SiroCash',description:'محفظة رقمية بواجهة عربية وإنجليزية وإدارة آمنة للحساب.',lang:'ar',dir:'rtl',
 start_url:'/dashboard',scope:'/',display:'standalone',background_color:'#0B0B0F',theme_color:'#0B0B0F',
 icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]
}}
