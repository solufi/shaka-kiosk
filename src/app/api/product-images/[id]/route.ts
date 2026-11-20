import { NextRequest, NextResponse } from 'next/server';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const formats: Record<string,string> = {'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.avif':'image/avif'};
const safeName = (value: string) => /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/.test(value) && !value.includes('..');
export async function GET(request: NextRequest, context: {params:Promise<{id:string}>}) {
  const {id}=await context.params;
  if (!safeName(id)) return new NextResponse(null,{status:400});
  const directory=process.env.SHAKA_PRODUCT_IMAGES_DIR || path.join(process.cwd(),'public/images/products');
  const registry=process.env.SHAKA_PRODUCT_REGISTRY_FILE || path.join(process.env.HOME || '/home/shaka','Shaka-main/src/lib/placeholder-images.json');
  const candidates: string[]=[];
  try {
    const data=JSON.parse(await fs.readFile(registry,'utf8'));
    const entry=data.placeholderImages?.find((item:{id:string})=>item.id===id);
    if (typeof entry?.imageUrl==='string' && entry.imageUrl.startsWith('/images/products/')) {
      const name=decodeURIComponent(new URL(entry.imageUrl,'http://localhost').pathname.slice('/images/products/'.length));
      if (safeName(name)) candidates.push(name);
    }
  } catch { /* A missing registry does not prevent finding a synchronized photo. */ }
  if (formats[path.extname(id).toLowerCase()]) candidates.push(id);
  candidates.push(...Object.keys(formats).map(extension=>id+extension));
  for (const name of new Set(candidates)) {
    const type=formats[path.extname(name).toLowerCase()];
    if (!type) continue;
    let file;
    try {
      file=await fs.open(path.join(directory,name),constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat=await file.stat();
      if (!stat.isFile() || stat.size===0 || stat.size>12*1024*1024) continue;
      const bytes=await file.readFile();
      if (bytes.length!==stat.size) continue;
      const etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';
      const headers={'Content-Type':type,'Content-Length':String(bytes.length),'Cache-Control':'no-cache, max-age=0, must-revalidate','ETag':etag,'X-Content-Type-Options':'nosniff'};
      if (request.headers.get('if-none-match')===etag) return new NextResponse(null,{status:304,headers});
      return new NextResponse(new Uint8Array(bytes).buffer,{headers});
    } catch { /* Try another supported image format without serving other files. */ }
    finally { await file?.close(); }
  }
  return new NextResponse(null,{status:404,headers:{'Cache-Control':'no-store'}});
}
