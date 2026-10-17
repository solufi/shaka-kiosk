import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const reads = new Set(['health','stripe/status','door-status','proximity/status','proximity/summary','proximity/stats/today','proximity/events','nayax/status']);
const writes = new Set(['purchase/free','stripe/pay','stripe/cancel','stripe/reset','stripe/vend-result','corporate/validate','vend','fridge/access','fridge/status','receipt/send']);
async function proxy(request: NextRequest, ctx: {params: Promise<{path: string[]}>}) {
  const route = (await ctx.params).path.join('/');
  if (!(request.method === 'GET' ? reads : writes).has(route)) return NextResponse.json({ok:false},{status:404});
  const host = request.headers.get('host') || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return NextResponse.json({ok:false},{status:403});
  const origin = request.headers.get('origin');
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) return NextResponse.json({ok:false},{status:403});
  if (request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ok:false},{status:403});
  const token = process.env.AGENT_TOKEN;
  if (!token) return NextResponse.json({ok:false,error:'Identité machine non configurée'},{status:503});
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && Buffer.byteLength(body) > 32768) return NextResponse.json({ok:false},{status:413});
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.VEND_SERVER_PORT || '5001'}/${route}`, {
      method: request.method, headers: {'Content-Type':'application/json','x-agent-token':token}, body,
      cache:'no-store', signal:AbortSignal.timeout(180000), redirect:'error'
    });
    return new NextResponse(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } catch { return NextResponse.json({ok:false,error:'Machine indisponible, résultat à vérifier avant tout nouvel essai'},{status:503}); }
}
export const GET = proxy;
export const POST = proxy;
