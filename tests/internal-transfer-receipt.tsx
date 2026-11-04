import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TransferParties} from '../components/transfer-parties';
import {InternalTransferSuccess} from '../components/internal-transfer-success';
import {completedInternalTransfer} from '../lib/internal-transfer-receipt';
const done={state:'COMPLETED',id:'00000000-0000-0000-0000-000000000001',transactionId:'00000000-0000-0000-0000-000000000002'};
for(const bad of [null,{},true,{...done,state:'RESERVED'},{...done,state:'SUBMITTED'},{...done,state:'FAILED'},{...done,transactionId:null},{...done,id:''}]){
 assert.equal(completedInternalTransfer(bad),false);
 assert.equal(renderToStaticMarkup(<InternalTransferSuccess result={bad} amount="1.000000" ar/>),'');
}
for(const ar of [true,false]){
 const html=renderToStaticMarkup(<TransferParties ar={ar} entry={{senderName:'<script>fake</script>',senderUid:'1234567897',recipientName:'Recipient',recipientUid:'9876543217'}}/>);
 assert(html.includes(ar?'المرسل':'Sender'));assert(html.includes(ar?'المستفيد':'Recipient'));
 assert(html.includes('1234567897'));assert(html.includes('9876543217'));assert(!html.includes('<script>'));
 const receipt=renderToStaticMarkup(<InternalTransferSuccess ar={ar} result={done} amount="1.000000" identity={{uid:'9876543217',displayName:'Recipient',username:null,identityVerified:false}}/>);
 assert(receipt.includes('role="status"'));assert(receipt.includes(ar?'وصل المبلغ إلى حساب المستفيد':'recipient account has been credited'));assert(receipt.includes('9876543217'));assert(receipt.includes('1.000000'));
 const missing=renderToStaticMarkup(<TransferParties entry={{}} ar={ar}/>);assert(missing.includes(ar?'UID غير متاح':'UID unavailable'));
}
console.log('Internal transfer receipt PASS: only committed completion/reference confirms arrival; named sender/recipient + UID, AR/EN, escaped names, honest missing profiles. No live transfer or device authorization.');
