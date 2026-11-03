import 'server-only';
import type {PoolClient} from 'pg';
type DB=Pick<PoolClient,'query'>;
export async function readAccountNotifications(db:DB,userId:string,staff:boolean){
 const {rows}=await db.query(`SELECT n.id,n.kind,n.reference,n.staff,n."createdAt",r."readAt" FROM "AccountNotification" n LEFT JOIN "AccountNotificationRead" r ON r."notificationId"=n.id AND r."userId"=$1 WHERE n."ownerId"=$1 OR (n.staff AND $2::boolean) ORDER BY (r."readAt" IS NULL) DESC,n."createdAt" DESC,n.id DESC LIMIT 50`,[userId,staff]);
 const {rows:[count]}=await db.query(`SELECT count(*)::int n FROM "AccountNotification" n WHERE (n."ownerId"=$1 OR (n.staff AND $2::boolean)) AND NOT EXISTS(SELECT 1 FROM "AccountNotificationRead" r WHERE r."notificationId"=n.id AND r."userId"=$1)`,[userId,staff]);
 return {enabled:true,userId,notifications:rows,unread:count.n};
}
export async function markAccountNotificationRead(db:DB,userId:string,staff:boolean,id:string){
 const {rows}=await db.query(`INSERT INTO "AccountNotificationRead"("userId","notificationId") SELECT $1,n.id FROM "AccountNotification" n WHERE n.id=$2 AND (n."ownerId"=$1 OR (n.staff AND $3::boolean)) ON CONFLICT DO NOTHING RETURNING "notificationId"`,[userId,id,staff]);
 // A replay and a nonexistent/foreign id have the same response: no identifier oracle.
 return rows.length>0;
}
