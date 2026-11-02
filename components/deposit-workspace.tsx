'use client';
import {AccountNavigation} from './account-navigation';
import {WalletPageHeader} from './wallet-page-header';
import {DepositPanel} from './deposit-panel';
import {FinancialLivePanel} from './financial-live-panel';
import {useWalletLanguage} from './mobile-wallet';
export function DepositWorkspace({ownerId}:{ownerId:string}){
 const ar=useWalletLanguage();
 return <div className="site-shell account-workspace deposit-workspace"><AccountNavigation active="/deposit" ar={ar}/><main id="main-content" className="wallet-task-main" dir={ar?'rtl':'ltr'}><WalletPageHeader title={ar?'إيداع':'Deposit'} ar={ar}/><DepositPanel ar={ar} userId={ownerId}/><FinancialLivePanel ar={ar} userId={ownerId} scope="deposits"/></main></div>;
}
