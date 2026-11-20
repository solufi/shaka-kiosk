import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { localProductPhoto } from '@/lib/product-images';
export const dynamic='force-dynamic';
export async function GET() {
  const entries=new Map<string,any>();
  for(const file of [path.join(process.cwd(),'src/lib/placeholder-images.json'),process.env.SHAKA_PRODUCT_REGISTRY_FILE || path.join(process.env.HOME || '/home/shaka','Shaka-main/src/lib/placeholder-images.json')]) {
    try {
      const data=JSON.parse(await fs.readFile(file,'utf8'));
      if(Array.isArray(data.placeholderImages))for(const entry of data.placeholderImages)if(typeof entry?.id==='string'&&typeof entry.imageUrl==='string')entries.set(entry.id,{...entry,imageUrl:entry.imageUrl.startsWith('/images/products/')?localProductPhoto(entry.id):entry.imageUrl});
    } catch { /* Keep the seed registry when the runtime registry is unavailable. */ }
  }
  return NextResponse.json([...entries.values()],{headers:{'Cache-Control':'no-store'}});
}
