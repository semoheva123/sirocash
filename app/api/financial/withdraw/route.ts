import {customerFinancialHttp} from '@/lib/customer-financial-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return customerFinancialHttp(request,'WITHDRAWAL')}
