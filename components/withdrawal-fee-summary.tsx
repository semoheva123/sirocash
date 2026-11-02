import {quoteUsdtWithdrawal} from '../lib/withdrawal-fees';
export function WithdrawalFeeSummary({asset,network,amount,ar}:{asset:string;network:string;amount:string;ar:boolean}) {
 if(asset!=='USDT'||!['TRC20','BEP20'].includes(network))return null;
 let quote:ReturnType<typeof quoteUsdtWithdrawal>|null=null;
 try{quote=quoteUsdtWithdrawal(network,amount)}catch{/* Show policy while input is incomplete. */}
 const fee=network==='TRC20'?'5':'2';
 return <div className="withdrawal-fee-summary" aria-live="polite">
  <div><span>{ar?'رسم سحب ثابت':'Fixed withdrawal fee'}</span><strong dir="ltr">{fee} USDT</strong></div>
  <p>{ar?'رسم خدمة للمنصة يُخصم من مبلغ السحب، وليس تسعيرة رسوم الشبكة.':'Platform service fee deducted from the withdrawal amount, not a network gas quote.'}</p>
  {quote?<><div><span>{ar?'إجمالي الخصم من الرصيد':'Total balance debit'}</span><strong dir="ltr">{quote.gross} USDT</strong></div><div><span>{ar?'صافي المبلغ للمستلم':'Recipient receives'}</span><strong dir="ltr">{quote.net} USDT</strong></div></>:<p>{ar?`يجب أن يتجاوز مبلغ السحب ${fee} USDT.`:`Withdrawal amount must exceed ${fee} USDT.`}</p>}

 </div>;
}
