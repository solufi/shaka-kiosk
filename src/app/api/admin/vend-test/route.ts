import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized } from '@/lib/local-admin';

export async function POST(request: NextRequest) {
  if (!adminAuthorized(request)) {
    return NextResponse.json({ok: false, error: 'Reconnectez-vous au menu Admin.'}, {status: 401});
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > 1024) return NextResponse.json({ok: false}, {status: 413});
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ok: false, error: 'Commande illisible'}, {status: 400});
  }
  if (!data || Object.keys(data).length !== 2 || typeof data.commandId !== 'string'
      || !/^admin-vend:[A-Za-z0-9-]{1,100}$/.test(data.commandId)
      || typeof data.location !== 'string' || !/^(?:[1-8][0-9]|[A-H][1-8])$/.test(data.location)) {
    return NextResponse.json({ok: false, error: 'Commande de test invalide'}, {status: 400});
  }
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.VEND_SERVER_PORT || '5001'}/admin/vend-test`, {
      method: 'POST', headers: {'Content-Type': 'application/json', 'x-agent-token': process.env.AGENT_TOKEN!},
      body: JSON.stringify({commandId: data.commandId, location: data.location}),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(130000),
    });
    return new NextResponse(await response.text(), {status: response.status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  } catch {
    return NextResponse.json({ok: false, pending: true, error: 'Réponse interrompue. Vérifiez le résultat du même essai.'}, {status: 503});
  }
}
