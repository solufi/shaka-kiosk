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
  if (data?.length) {
    try {
      const response = await fetch(`http://127.0.0.1:${process.env.VEND_SERVER_PORT || '5001'}/inventory`, {cache:'no-store',signal:AbortSignal.timeout(2000)});
      const live = await response.json();
      if (!response.ok || !live.ok || !Array.isArray(live.data)) throw new Error('Inventory unavailable');
      data = live.data;
    } catch {
      // All physical counters are durable in the agent, including single rows.
      data = (data || []).map((p:any)=>({...p,quantity:0,stockUnavailable:true}));
    }
  }
  // Fleet can synchronize the photo under the product ID before inventory has an imageId.
  const products = data ?? [];
  const needsPhoto = (p: unknown): p is {id: string; imageId?: string} =>
    !!p && typeof p === 'object' && 'id' in p && typeof p.id === 'string' && !('imageId' in p && p.imageId);
  if (products.some(needsPhoto)) {
    const directory = process.env.SHAKA_PRODUCT_IMAGES_DIR || path.join(process.cwd(), 'public/images/products');
    const files = await fs.readdir(directory, {withFileTypes:true}).catch(() => []);
    const localIds = new Set(files.filter(f => f.isFile() && /\.(webp|jpe?g|png|avif|gif)$/.test(f.name)).map(f => path.parse(f.name).name));
    return NextResponse.json({ok:true, data:products.map(p => needsPhoto(p) && localIds.has(p.id) ? {...p, imageId:p.id} : p)});
  }
  return NextResponse.json({ok:true, data:products});
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
