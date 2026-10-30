import {NextResponse} from 'next/server';
import {database,databaseConfigured} from '@/lib/database';
import {databaseReadinessQuery} from '@/lib/database-options';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 const headers={'Cache-Control':'no-store'};
 if(!databaseConfigured())return NextResponse.json({database:'not_configured'},{status:503,headers});
 try{
  // Checks connectivity, required schema, and actual backend permissions without retrieving records.
  await database().query(databaseReadinessQuery);
  return NextResponse.json({database:'ready'},{headers});
 }catch{return NextResponse.json({database:'unavailable'},{status:503,headers})}
}
