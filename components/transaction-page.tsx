'use client';
import {useWalletLanguage} from './mobile-wallet';
import {AccountNavigation} from './account-navigation';
import {WalletPageHeader} from './wallet-page-header';
import {HistoryDetail} from './history-detail';
export function TransactionPage({ownerId,scope,id}:{ownerId:string;scope:'activity'|'deposits'|'withdrawals'|'operation';id:string}){
 const ar=useWalletLanguage();return <div className="site-shell account-workspace"><AccountNavigation active="/activity" ar={ar}/><main id="main-content" className="wallet-task-main" dir={ar?'rtl':'ltr'}><WalletPageHeader ar={ar} title={ar?'تفاصيل المعاملة':'Transaction details'} href="/activity"/><HistoryDetail ownerId={ownerId} scope={scope} id={id} ar={ar}/></main></div>;
}
