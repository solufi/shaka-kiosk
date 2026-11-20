'use client';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { localProductPhoto } from '@/lib/product-images';
export function ProductPhoto({imageId,name,className='',sizes='(max-width: 768px) 50vw, 33vw'}:{imageId:string;name:string;className?:string;sizes?:string}) {
  const [missing,setMissing]=useState(false);
  useEffect(()=>setMissing(false),[imageId]);
  useEffect(()=>{if(!missing)return;const timer=setTimeout(()=>setMissing(false),15000);return()=>clearTimeout(timer);},[missing]);
  if (missing || !imageId) return <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400" role="img" aria-label={`Photo indisponible : ${name}`}><ImageOff className="h-8 w-8"/><span className="text-sm">Photo à venir</span></div>;
  return <Image src={localProductPhoto(imageId)} alt={name} fill unoptimized sizes={sizes} className={className} onError={()=>setMissing(true)}/>;
}
