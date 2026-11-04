/** Synthetic provider lifecycle test. Never imported by production routes. */
import {useState} from 'react';
import {FinancialStatusProvider,useFinancialStatus} from '../../components/use-financial-status';
import {ReceivingIdentityProvider,useReceivingIdentity} from '../../components/receiving-identity';
import {AccountLanguageProvider,useAccountLanguage} from '../../components/account-language';
const owner='11111111-2222-4333-8444-555555555555';
const initial={enabled:true,readable:true,userId:owner,balance:{posted:'1480.000000',held:'20.000000'}};
function Probe({screen}:{screen:string}){
 const {status,sync}=useFinancialStatus(true,owner);
 const {identity,reload}=useReceivingIdentity(owner);
 const [ar,setAr]=useAccountLanguage();
 return <section style={{padding:40,color:'#fff'}}><h1>{screen}</h1><output data-testid="balance">{status?.balance?.posted??'EMPTY'}</output><p data-testid="uid">{identity?.uid??'EMPTY'}</p><p data-testid="sync">{sync}</p><p data-testid="language">{ar?'ar':'en'}</p><button onClick={()=>setAr(!ar)}>Language</button><button onClick={reload}>Reload identity</button><p>TEST DATA ONLY · No financial execution</p></section>;
}
export function NavigationFixture(){
 const [screen,setScreen]=useState('home');
 return <AccountLanguageProvider initialLanguage="en"><FinancialStatusProvider userId={owner} initialStatus={initial}><ReceivingIdentityProvider ownerId={owner} initialIdentity={{uid:'1234567897',displayName:'Fixture',username:null,identityVerified:false}}><nav>{['home','wallet','activity','settings'].map(s=><button key={s} onClick={()=>setScreen(s)}>{s}</button>)}</nav><Probe key={screen} screen={screen}/></ReceivingIdentityProvider></FinancialStatusProvider></AccountLanguageProvider>;
}
