import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{await(await db()).query('SELECT 1');return NextResponse.json({status:'ready'},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}}
