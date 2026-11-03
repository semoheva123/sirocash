import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {FinancialStatusProvider,useFinancialStatus} from '../components/use-financial-status';
import {ReceivingIdentityProvider,useReceivingIdentity} from '../components/receiving-identity';
import {AccountLanguageProvider,useAccountLanguage} from '../components/account-language';
import {FinancialSyncStatus} from '../components/financial-sync-status';
const owner='11111111-2222-4333-8444-555555555555';
function Probe({id=owner}:{id?:string}){
 const {status,sync}=useFinancialStatus(true,id),{identity}=useReceivingIdentity(id);
 const [ar]=useAccountLanguage();
 return <output>{JSON.stringify({balance:status?.balance?.posted??null,uid:identity?.uid??null,sync,language:ar?'ar':'en'})}</output>;
}
function render(id=owner){return renderToStaticMarkup(<AccountLanguageProvider initialLanguage="en"><FinancialStatusProvider userId={owner} initialStatus={{enabled:true,userId:owner,balance:{posted:'123.456789',held:'0'}}}><ReceivingIdentityProvider ownerId={owner} initialIdentity={{uid:'1234567897',displayName:null,username:null,identityVerified:false}}><Probe id={id}/></ReceivingIdentityProvider></FinancialStatusProvider></AccountLanguageProvider>)}
const html=render();
assert(html.includes('123.456789'));assert(html.includes('1234567897'));assert(html.includes('syncing'));assert(!html.includes('current'));assert(html.includes('en'));
const foreign=render('foreign');assert(!foreign.includes('123.456789'));assert(!foreign.includes('1234567897'));
assert.equal(renderToStaticMarkup(<FinancialSyncStatus compact hasData sync="syncing" updatedAt={null} ar retry={()=>{}}/>),'');
assert(renderToStaticMarkup(<FinancialSyncStatus compact hasData sync="retrying" updatedAt={null} ar retry={()=>{}}/>).includes('role="status"'));
console.log('Account continuity SSR PASS: real initial balance/UID, no live authorization from seed, foreign-owner denial, server language seed, quiet background sync and visible failure warning.');
