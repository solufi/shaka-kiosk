import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized } from '@/lib/local-admin';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!adminAuthorized(request)) return NextResponse.json({ok:false,error:'Reconnectez-vous au menu Admin avant de tester le relais.'}, {status:401});
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 1024) return NextResponse.json({ok:false}, {status:413});
    const { commandId } = JSON.parse(text);
    if (typeof commandId !== 'string' || !/^admin-relay:[A-Za-z0-9-]{1,100}$/.test(commandId)) return NextResponse.json({ok:false,error:'Identifiant de test invalide'}, {status:400});
    const response = await fetch(`http://127.0.0.1:${process.env.VEND_SERVER_PORT || '5001'}/admin/relay-test`, {
      method:'POST', headers:{'Content-Type':'application/json','x-agent-token':process.env.AGENT_TOKEN!},
      body:JSON.stringify({commandId}), cache:'no-store', redirect:'error', signal:AbortSignal.timeout(20000),
    });
    return new NextResponse(await response.text(), {status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } catch {
    return NextResponse.json({ok:false,error:'Résultat du test à vérifier avant un nouvel essai'}, {status:503});
  }
}
