'use client';

import {useEffect,useRef,useState} from 'react';
import type {DisplayLayout} from '@/lib/display-layout';
import {showcaseProducts,type ShowcaseProduct} from '@/lib/showcase';
import {localProductPhoto} from '@/lib/product-images';
import {productSellingCents} from '@/lib/cart-pricing';

interface Media {id:string;filename:string;url:string;mediaType?:'image'|'video'}
interface Config {enabled?:boolean;durationSeconds?:number;images:Media[];overlayTitle?:string;overlaySubtitle?:string;overlayColor?:string}
const money=new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'});
const shaka='/Shaka_Transparent.png';

// Check the actual photo on this Pi. Fleet can deliver the stock before its image files.
function useAvailablePhotos(sources: string[]) {
  const sourceKey = JSON.stringify([...new Set(sources)].sort());
  const available = useRef(new Set<string>());
  const [photos, setPhotos] = useState<ReadonlySet<string>>(() => new Set());

  function discard(source: string) {
    if (available.current.delete(source)) setPhotos(new Set(available.current));
  }

  useEffect(() => {
    const wanted: string[] = JSON.parse(sourceKey);
    let active = true;
    const pending = new Map<string, HTMLImageElement>();
    for (const source of available.current) {
      if (!wanted.includes(source)) discard(source);
    }
    function refresh() {
      for (const source of wanted) {
        if (available.current.has(source) || pending.has(source)) continue;
        const photo = new Image();
        pending.set(source, photo);
        photo.onload = () => {
          pending.delete(source);
          if (active && photo.naturalWidth > 0) {
            available.current.add(source);
            setPhotos(new Set(available.current));
          }
        };
        photo.onerror = () => { pending.delete(source); };
        photo.src = source;
      }
    }
    refresh();
    const retry = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(retry);
      for (const photo of pending.values()) photo.onload = photo.onerror = null;
    };
  }, [sourceKey]);
  return { photos, discard };
}
export function Screensaver({onInteraction,products,layout,preview=false,included=false}:{
  onInteraction:()=>void;products:ShowcaseProduct[];layout?:DisplayLayout;preview?:boolean;included?:boolean
}) {
  const [config,setConfig]=useState<Config|null>(null);
  const [position,setPosition]=useState({id:'',mediaTurn:false,mediaIndex:0,cycle:0,logoTurn:false,productsSinceLogo:0});
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
  const candidates = showcaseProducts(products,layout);
  const withPhoto = candidates.flatMap(slide => {
    const product = slide.product;
    const source = (preview && product.demoPhoto) || (product.imageId && localProductPhoto(product.imageId));
    return source ? [{...slide, source}] : [];
  });
  const {photos, discard} = useAvailablePhotos(withPhoto.map(slide => slide.source));
  const slides = withPhoto.filter(slide => photos.has(slide.source));
  const found=slides.findIndex(s=>s.product.id===position.id);
  const index=found<0?0:found;
  const slide=slides[index];
  const mediaList=config?.enabled===false?[]:(config?.images||[]);
  const logoTurn = position.logoTurn && slides.length > 0;
  const media=!logoTurn && candidates.length > 0 && position.mediaTurn && mediaList.length?mediaList[position.mediaIndex%mediaList.length]:undefined;
  const video=!!media && (media.mediaType==='video'||/\.(mp4|webm|mov|ogg)$/i.test(media.filename));
  const nextId=slides[(index+1)%Math.max(1,slides.length)]?.product.id;
  const insertMedia=!!mediaList.length && candidates.length > 0 && (!slide || index===slides.length-1);
  function next(){
    setPosition(p=>{
      if (p.cycle !== position.cycle) return p;
      if (logoTurn) return {...p,logoTurn:false,cycle:p.cycle+1};
      const productsSinceLogo = p.productsSinceLogo + (slide && !media ? 1 : 0);
      const showLogo = productsSinceLogo >= 5;
      return {
        id:(media?slides[0]?.product.id:nextId)||'',mediaTurn:!media && insertMedia,
        mediaIndex:p.mediaIndex+(media?1:0),cycle:p.cycle+1,
        logoTurn:showLogo,productsSinceLogo:showLogo?0:productsSinceLogo
      };
    });
  }
  const duration=logoTurn?4:media?Math.max(1,Math.min(120,Number(config?.durationSeconds)||5)):8;
  useEffect(()=>{
    if(!slide && !insertMedia)return;
    const timer=setTimeout(next,duration*1000);
    return ()=>clearTimeout(timer);
  },[slide?.product.id,slides[0]?.product.id,nextId,insertMedia,media?.id,duration,position.cycle]);
  const action=preview?'Revenir au mode test':'Touchez l’écran pour commencer';
  const product=logoTurn?undefined:slide?.product;
  return <button type="button" className="shaka-showcase" data-theme={logoTurn?'brand':media?'media':slide?.kind||'brand'} onClick={onInteraction} aria-label={action}>
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
      <span className="showcase-art"><img className="showcase-photo" src={slide.source} alt={product.name} onError={()=>discard(slide.source)} draggable={false}/></span>
    </div>:<div className="showcase-brand"><img src={shaka} alt="Shaka" draggable={false}/></div>}
    {(product||preview) && <span className="showcase-top">{preview?'Aperçu · Mode test':'Shaka'}</span>}
    <span className="showcase-action">{action}<span aria-hidden="true">↗</span></span>
  </button>;
}
