import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { localAgentAuthorized } from '@/lib/local-agent-auth';
import { validateDisplay, DisplayLayout } from '@/lib/display-layout';
export const dynamic = 'force-dynamic';
type Publication = { revision: string; config: DisplayLayout; publishedAt: string };
const root = process.env.SHAKA_DISPLAY_DIR || path.join(process.env.HOME || '/tmp', '.shaka-cache');
const file = path.join(root, 'display.json');
const g = globalThis as typeof globalThis & { shakaDisplayRendered?: { renderedRevision: string; renderedAt: string } };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function read(): Publication | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export async function GET() {
  return json({ published: read(), ...g.shakaDisplayRendered });
}
export async function POST(req: Request) {
  if (!localAgentAuthorized(req)) return json({ error: 'Accès refusé' }, 401);
  const text = await req.text();
  if (Buffer.byteLength(text) > 65536) return json({ error: 'Requête trop volumineuse' }, 413);
  try {
    const body = JSON.parse(text);
    if (typeof body.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(body.revision) || !Number.isFinite(Date.parse(body.publishedAt))) throw new Error('Invalid publication');
    const published: Publication = { revision: body.revision, config: validateDisplay(body.config), publishedAt: body.publishedAt };
    if (JSON.stringify(read()) !== JSON.stringify(published)) {
      fs.mkdirSync(root, { recursive: true });
      const temp = file + '.' + randomUUID() + '.tmp';
      try {
        const fd = fs.openSync(temp, 'wx', 0o600);
        try { fs.writeFileSync(fd, JSON.stringify(published)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(temp, file);
      } finally { fs.rmSync(temp, { force: true }); }
    }
    return json({ ok: true, receivedRevision: published.revision });
  } catch { return json({ error: 'Disposition invalide' }, 400); }
}
/** Browser acknowledgement has no machine credential and cannot change layout. */
export async function PATCH(req: Request) {
  const host = req.headers.get('host') || '';
  const origin = req.headers.get('origin');
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || origin !== `http://${host}` || req.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Accès refusé' }, 403);
  const text = await req.text();
  if (text.length > 200) return json({ error: 'Requête trop volumineuse' }, 413);
  try {
    const { revision } = JSON.parse(text);
    if (!revision || read()?.revision !== revision) return json({ error: 'Version dépassée' }, 409);
    g.shakaDisplayRendered = { renderedRevision: revision, renderedAt: new Date().toISOString() };
    return json({ ok: true });
  } catch { return json({ error: 'Requête invalide' }, 400); }
}
