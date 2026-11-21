import {NextResponse} from 'next/server';
import {adminAuthorized} from '@/lib/local-admin';
import {PracticeError,practiceTerminal} from '@/lib/practice-terminal';

export const dynamic='force-dynamic';
export async function POST(request: Request) {
  const headers={'Cache-Control':'no-store'};
  if (!adminAuthorized(request)) return NextResponse.json({error:'Reconnectez-vous au menu Admin.'},{status:401,headers});
  try {
    const text=await request.text();
    if (text.length>2048) return NextResponse.json({error:'Demande trop longue.'},{status:413,headers});
    const result=await practiceTerminal(JSON.parse(text));
    return NextResponse.json(result,{headers});
  } catch (error) {
    const message=error instanceof PracticeError ? error.message : 'Communication interrompue. Reprenez le suivi de l’essai.';
    return NextResponse.json({error:message},{status:error instanceof PracticeError?409:503,headers});
  }
}
