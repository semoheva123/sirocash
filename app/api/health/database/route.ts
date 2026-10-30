import {NextResponse} from 'next/server';
import {database,databaseConfigured} from '@/lib/database';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 const headers={'Cache-Control':'no-store'};
 if(!databaseConfigured())return NextResponse.json({database:'not_configured'},{status:503,headers});
 try{
  // Checks connectivity, required schema, and actual backend permissions without retrieving records.
  await database().query('SELECT u.id,u.email,u."passwordHash",s."tokenHash",c.id,r.id FROM "User" u,"AuthSession" s,"EmailChallenge" c,"EmailRateLimit" r WHERE FALSE');
  return NextResponse.json({database:'ready'},{headers});
 }catch{return NextResponse.json({database:'unavailable'},{status:503,headers})}
}
