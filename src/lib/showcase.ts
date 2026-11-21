import {arrangeProducts, DEFAULT_DISPLAY, type DisplayLayout} from './display-layout';

export type ShowcaseProduct = {
  id:string; name:string; quantity:number; price:number; depositCents?:number;
  visible?:boolean; stockUnavailable?:boolean; imageId?:string; demoPhoto?:string; order?:number;
};
type Kind = 'drink'|'snack'|'other';
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function classify(text:string):Kind {
  const value=normalize(text);
  if (/\b(collations?|snacks?|barres?|chips|biscuits?|cookies?|crackers?|gummies|gummy|grenade|probites|edamame|broadbeanz|donuts?|pastr(y|ies))\b/.test(value)) return 'snack';
  if (/\b(breuvages?|boissons?|drinks?|beverages?|sodas?|eau|water|jus|shakes?|energy|ghost|c4|monster|red bull|spark|essentia|cadence|hydratation|cafe)\b|\b\d+\s*ml\b/.test(value)) return 'drink';
  return 'other';
}
export function showcaseProducts(products:ShowcaseProduct[],layout:DisplayLayout=DEFAULT_DISPLAY) {
  const groups=new Map<string,string>();
  for(const category of layout.categories||[]) for(const id of category.productIds) groups.set(id,category.label);
  const all=arrangeProducts(products,layout).filter(p=>Number.isFinite(p.quantity)&&p.quantity>0&&!p.stockUnavailable&&Number.isFinite(p.price)&&p.price>=0&&[0,10,25].includes(p.depositCents??0));
  const slides=all.map(product=>{
    const category=groups.get(product.id);
    const group=category?classify(category):'other';
    const kind=group==='other'?classify(product.name):group;
    return {product,kind,label:category || ({drink:'Breuvages',snack:'Collations',other:'À découvrir'})[kind]};
  });
  const buckets=[slides.filter(s=>s.kind==='drink'),slides.filter(s=>s.kind==='snack'),slides.filter(s=>s.kind==='other')];
  const result:typeof slides=[];
  for(let i=0;i<Math.max(...buckets.map(g=>g.length));i++) for(const group of buckets) if(group[i]) result.push(group[i]);
  return result;
}
