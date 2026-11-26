import { NextRequest, NextResponse } from 'next/server';
import { cookie, localRequest, login, sessionExpiry, revokeSession } from '@/lib/local-admin';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!localRequest(request)) return NextResponse.json({ok:false}, {status:403});
  if (!process.env.AGENT_TOKEN) return NextResponse.json({ok:false,error:'Identité machine non configurée'}, {status:503});
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 1024) return NextResponse.json({ok:false}, {status:413});
    const session = login(JSON.parse(body).pin);
    return NextResponse.json({ok:true}, {headers:{'Set-Cookie':cookie(request, session),'Cache-Control':'no-store'}});
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error ? error.message : 'Connexion impossible'}, {status:401});
  }
}

export function DELETE(request: NextRequest) {
  if (!localRequest(request)) return NextResponse.json({ok:false}, {status:403});
  revokeSession(request);
  return NextResponse.json({ok:true}, {headers:{'Set-Cookie':cookie(request,''),'Cache-Control':'no-store'}});
}

export function GET(request: NextRequest) {
  const expiresAt = sessionExpiry(request);
  return NextResponse.json({ok:true,authenticated:expiresAt > 0,expiresAt}, {headers:{"Cache-Control":"no-store"}});
}

export function PUT(request: NextRequest) {
  const expiresAt = sessionExpiry(request, true);
  return NextResponse.json({authenticated:expiresAt > 0,expiresAt}, {status:expiresAt ? 200 : 401, headers:{'Cache-Control':'no-store'}});
}
