'use client';
import {createContext,useContext,useEffect,useState} from 'react';
type LanguageState=readonly [boolean,(ar:boolean)=>void];
const LanguageContext=createContext<LanguageState|null>(null);
/** Non-sensitive preference cookie lets the next server render use the same language. */
function persist(ar:boolean){
 const language=ar?'ar':'en';
 try{localStorage.setItem('siro-language',language)}catch{/* Storage can be blocked. */}
 document.cookie=`siro-language=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
export function AccountLanguageProvider({children,initialLanguage}:{children:React.ReactNode;initialLanguage:'ar'|'en'|null}){
 const [ar,setAr]=useState(initialLanguage!=='en');
 useEffect(()=>{
  // One-time migration for browsers that predate the preference cookie.
  if(initialLanguage===null){try{const value=localStorage.getItem('siro-language');if(value==='en'||value==='ar'){setAr(value==='ar');persist(value==='ar')}}catch{}}
 },[initialLanguage]);
 useEffect(()=>{document.documentElement.lang=ar?'ar':'en';document.documentElement.dir=ar?'rtl':'ltr'},[ar]);
 return <LanguageContext.Provider value={[ar,value=>{persist(value);setAr(value)}]}>{children}</LanguageContext.Provider>;
}
export function useAccountLanguage():LanguageState{
 const shared=useContext(LanguageContext);
 const [ar,setAr]=useState(true);
 useEffect(()=>{if(!shared){try{setAr(localStorage.getItem('siro-language')!=='en')}catch{}}},[!!shared]);
 return shared??[ar,value=>{persist(value);setAr(value)}];
}
