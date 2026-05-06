import { NextResponse } from 'next/server';
import path from 'path';
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
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  const data = await readCache();
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: Request) {
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
