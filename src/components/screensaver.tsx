'use client';

import {useEffect,useState} from 'react';
import type {DisplayLayout} from '@/lib/display-layout';
import {showcaseProducts,type ShowcaseProduct} from '@/lib/showcase';
import {localProductPhoto} from '@/lib/product-images';
import {productSellingCents} from '@/lib/cart-pricing';

interface Media {id:string;filename:string;url:string;mediaType?:'image'|'video'}
interface Config {enabled?:boolean;durationSeconds?:number;images:Media[];overlayTitle?:string;overlaySubtitle?:string;overlayColor?:string}
const money=new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'});
const shaka='/Shaka_Transparent.png';

function HeroPhoto({product,preview}:{product:ShowcaseProduct;preview:boolean}) {
  const [failed,setFailed]=useState(false);
  const source=(preview && product.demoPhoto) || (product.imageId && localProductPhoto(product.imageId));
  return <img className="showcase-photo" src={source&&!failed?source:shaka} alt="" onError={()=>setFailed(true)} draggable={false} />;
}
export function Screensaver({onInteraction,products,layout,preview=false,included=false}:{
  onInteraction:()=>void;products:ShowcaseProduct[];layout?:DisplayLayout;preview?:boolean;included?:boolean
}) {
  const [config,setConfig]=useState<Config|null>(null);
  const [position,setPosition]=useState({id:'',mediaTurn:false,mediaIndex:0,cycle:0});
  useEffect(()=>{
    if(preview)return;
    let active=true;
    const refresh=async()=>{
      try{
        const response=await fetch('/api/local-screensaver',{cache:'no-store'});
        if(!response.ok)return;
        const c=await response.json();
        if(active && Array.isArray(c.images))setConfig(c);
      }catch{/* Keep the current presentation while the local configuration is unavailable. */}
    };
    void refresh();const timer=setInterval(refresh,30000);
    return ()=>{active=false;clearInterval(timer);};
  },[preview]);
  const slides=showcaseProducts(products,layout);
  const found=slides.findIndex(s=>s.product.id===position.id);
  const index=found<0?0:found;
  const slide=slides[index];
  const mediaList=config?.enabled===false?[]:(config?.images||[]);
  const media=slide && position.mediaTurn && mediaList.length?mediaList[position.mediaIndex%mediaList.length]:undefined;
  const video=!!media && (media.mediaType==='video'||/\.(mp4|webm|mov|ogg)$/i.test(media.filename));
  const nextId=slides[(index+1)%Math.max(1,slides.length)]?.product.id;
  const insertMedia=!!mediaList.length && index===slides.length-1;
  function next(){
    setPosition(p=>({
      id:(media?slides[0]?.product.id:nextId)||'',mediaTurn:!media && insertMedia,
      mediaIndex:p.mediaIndex+(media?1:0),cycle:p.cycle+1
    }));
  }
  const duration=media?Math.max(1,Math.min(120,Number(config?.durationSeconds)||5)):8;
  useEffect(()=>{
    if(!slide||video)return;
    const timer=setTimeout(next,duration*1000);
    return ()=>clearTimeout(timer);
  },[slide?.product.id,slides[0]?.product.id,nextId,insertMedia,media?.id,video,duration,position.cycle]);
  const action=preview?'Revenir au mode test':'Touchez l’écran pour commencer';
  const product=slide?.product;
  return <button type="button" className="shaka-showcase" data-theme={media?'media':slide?.kind||'brand'} onClick={onInteraction} aria-label={action}>
    {media?<div className="showcase-media" key={media.id}>
      {video?<video src={media.url} autoPlay muted playsInline onEnded={next} onError={next}/>:<img src={media.url} alt="" onError={next}/>}
      {(config?.overlayTitle || config?.overlaySubtitle) && <div className="showcase-caption" style={{color:config?.overlayColor}}>{config?.overlayTitle && !/^touchez l.écran pour commencer$/i.test(config.overlayTitle) && <strong>{config.overlayTitle}</strong>}<span>{config?.overlaySubtitle}</span></div>}
    </div>:product?<div className="showcase-slide" key={product.id+'-'+position.cycle}>
      <div className="showcase-copy">
        <span className="showcase-category">{slide.label}</span>
        <strong className="showcase-name">{product.name}</strong>
        <span className="showcase-price">{included?'Fourni par l’entreprise':money.format(productSellingCents(product)/100)}</span>
        {!included && !!product.depositCents && <span className="showcase-deposit">dont {money.format(product.depositCents/100)} de consigne</span>}
      </div>
      <span className="showcase-art"><HeroPhoto key={product.imageId||product.demoPhoto||product.id} product={product} preview={preview}/></span>
    </div>:<div className="showcase-brand"><img src={shaka} alt="Shaka" draggable={false}/></div>}
    {(product||preview) && <span className="showcase-top">{preview?'Aperçu · Mode test':'Shaka'}</span>}
    <span className="showcase-action">{action}<span aria-hidden="true">↗</span></span>
  </button>;
}
