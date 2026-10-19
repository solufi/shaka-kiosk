import { localAgentAuthorized } from '@/lib/local-agent-auth';
import { NextResponse } from 'next/server';
import path from 'path';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';

export const runtime = 'nodejs';

const HOME = process.env.HOME || '/tmp';
const CACHE_DIR = path.join(HOME, '.shaka-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'products.json');

async function readCache(): Promise<unknown[] | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const temporary = `${CACHE_FILE}.${randomUUID()}.tmp`;
  const file = await fs.open(temporary, 'wx', 0o644);
  try {
    await file.writeFile(JSON.stringify(data, null, 2), 'utf-8');
    await file.sync();
  } finally { await file.close(); }
  try { await fs.rename(temporary, CACHE_FILE); } finally { await fs.rm(temporary, { force: true }); }
}

export async function GET() {
  let data = await readCache();
  if (data?.some((p: any) => p.slots)) {
    try {
      const response = await fetch(`http://127.0.0.1:${process.env.VEND_SERVER_PORT || '5001'}/inventory`, {cache:'no-store',signal:AbortSignal.timeout(2000)});
      const live = await response.json();
      if (!response.ok || !live.ok || !Array.isArray(live.data)) throw new Error('Inventory unavailable');
      data = live.data;
    } catch {
      // Never advertise stale per-row counters after a vend-server interruption.
      data = (data || []).map((p:any)=>p.slots?{...p,quantity:0,stockUnavailable:true}:p);
    }
  }
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: Request) {
  if (!localAgentAuthorized(req)) return NextResponse.json({ok:false},{status:401});
  try {
    const body = await req.json();
    const data = (body && (body.products ?? body.data)) as unknown;

    if (!Array.isArray(data)) {
      return NextResponse.json({ ok: false, error: 'Expected products: []' }, { status: 400 });
    }

    await writeCache(data);
    return NextResponse.json({ ok: true, count: data.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
