import { NextResponse } from 'next/server';
import { adminAuthorized } from '@/lib/local-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reply = (error: string, status: number) => NextResponse.json({error}, {status, headers:{'Cache-Control':'no-store'}});
  if (!adminAuthorized(request)) return reply('Reconnectez-vous au menu Admin.', 401);
  let data;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1024) return reply('Demande trop longue.', 413);
    data = JSON.parse(raw);
    if (!data || !['scan','enable','connect','status'].includes(data.action)) return reply('Demande invalide.', 400);
  } catch { return reply('Demande invalide.', 400); }
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.VEND_SERVER_PORT || '5001'}/admin/wifi`, {
      method:'POST', headers:{'Content-Type':'application/json','x-agent-token':process.env.AGENT_TOKEN!},
      body:JSON.stringify(data), cache:'no-store', redirect:'error', signal:AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (response.status === 404) return reply('Mettez à jour l’agent de la machine dans Fleet.', 503);
    return NextResponse.json(result, {status:response.status, headers:{'Cache-Control':'no-store'}});
  } catch { return reply('Le service Wi-Fi local est indisponible.', 503); }
}
