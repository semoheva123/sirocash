/* No fetch handler or offline cache: never cache account pages, APIs or balances. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data={};try{data=event.data.json()}catch{}
  await self.registration.showNotification('SiroCash',{
   body:typeof data.body==='string'?data.body.slice(0,200):'لديك تحديث جديد في محفظتك.',
   icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',tag:typeof data.tag==='string'?data.tag:'wallet-update',
   data:{url:'/notifications'}
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL('/notifications',self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(new URL(client.url).origin===self.location.origin&&'focus' in client){await client.navigate(url);return client.focus()}
  return self.clients.openWindow(url);
 })());
});
