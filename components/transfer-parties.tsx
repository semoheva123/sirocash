import type {TransferPartiesData} from '@/lib/internal-transfer-receipt';
/** Public receiving profiles only: never email, private user UUID or inferred brand. */
export function TransferParties({entry,ar}:{entry:TransferPartiesData;ar:boolean}){
 return <dl className="transfer-parties">{([
  [ar?'المرسل':'Sender',entry.senderName,entry.senderUsername,entry.senderUid],
  [ar?'المستفيد':'Recipient',entry.recipientName,entry.recipientUsername,entry.recipientUid],
 ] as const).map(([label,name,username,uid])=><div key={label}><dt>{label}</dt><dd><span>{name||(username?'@'+username:(ar?'الاسم غير متاح':'Name unavailable'))}</span>{uid?<span className="transfer-party-uid" dir="ltr">UID · {uid}</span>:<span>{ar?'UID غير متاح':'UID unavailable'}</span>}</dd></div>)}</dl>;
}
