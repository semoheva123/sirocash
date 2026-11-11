import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('components/account-notifications.tsx','utf8');
for(const copy of ['لا توجد إشعارات','No notifications','الإشعارات','Notifications'])assert(source.includes(copy),copy);
for(const removed of ['لا يمنح الإشعار تفويضًا','A notification never authorizes','لا ننشئ تنبيهات افتراضية','Earlier activity was not backfilled','حتى 50 إشعارًا','Up to 50 notifications','الاتصال المباشر غير جاهز','Live connection is not ready','مركز الدعم','Support center'])assert(!source.includes(removed),removed);
// Keep actual notifications, their actions, and truthful load/failure states.
for(const kept of ['data.inbox.notifications.map','labels[n.kind]','تحديد كمقروء','عرض التفاصيل','role="alert"','role="status"','Loading notifications…','Could not update notifications.'])assert(source.includes(kept),kept);
assert(source.includes("'/api/notifications/events'"));
// Close control: returns to the in-app origin of the tap, or to the wallet home when opened directly.
for(const kept of ['className="notifications-close"','إغلاق الإشعارات','Close notifications','window.history.back()',"window.location.assign('/dashboard')"])assert(source.includes(kept),kept);
const css=readFileSync('app/notifications.css','utf8');assert(css.includes('.notifications-close{')&&css.includes('min-height:44px;min-width:44px'),'close control is a 44px target');
console.log('Notification copy PASS: concise empty state, no feature explanations/count rules/technical connection copy or support footer; actual notifications, read actions, SSE and failure states retained.');
