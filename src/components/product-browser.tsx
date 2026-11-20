'use client';
import { useEffect,useRef,useState,type ReactNode } from 'react';
import type { Product } from '@/lib/types';
import { arrangeProducts,categoryOptions,filterCategory,catalogGeometry,catalogPage,displayColumns,type DisplayLayout } from '@/lib/display-layout';
import { Button } from './ui/button';

export function ProductBrowser({products,layout,renderProduct}:{products:Product[];layout:DisplayLayout;renderProduct:(product:Product,index:number,compact:boolean)=>ReactNode}) {
  const root=useRef<HTMLElement>(null),grid=useRef<HTMLDivElement>(null);
  const [box,setBox]=useState({width:1024,height:640,gridHeight:420});
  const [category,setCategory]=useState('all'),[page,setPage]=useState(0),[categoryPage,setCategoryPage]=useState(0);
  const paged=layout.mode==='pages';
  useEffect(()=>{
    if(!root.current||!grid.current)return;
    let frame=0;
    const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      if(!root.current||!grid.current)return;
      const bounds=root.current.getBoundingClientRect();
      const height=Math.max(180,Math.floor((window.visualViewport?.height || window.innerHeight)-bounds.top-24));
      const width=Math.floor(bounds.width),gridHeight=Math.floor(grid.current.getBoundingClientRect().height);
      setBox(old=>old.width===width&&old.height===height&&old.gridHeight===gridHeight?old:{width,height,gridHeight});
    });};
    const observer=new ResizeObserver(measure);observer.observe(root.current);observer.observe(grid.current);
    window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
  },[paged]);
  useEffect(()=>{setCategory('all');setPage(0);setCategoryPage(0);},[layout]);
  const ordered=arrangeProducts(products,layout);
  const options=categoryOptions(ordered,layout);
  const selected=options.some(c=>c.id===category)?category:'all';
  const filtered=filterCategory(ordered,layout,selected);
  const geometry=catalogGeometry(box.width,box.gridHeight,layout.columns,layout.rows);
  const oldCapacity=useRef(geometry.capacity);
  useEffect(()=>{const previous=oldCapacity.current;oldCapacity.current=geometry.capacity;if(previous!==geometry.capacity)setPage(p=>Math.floor(p*previous/geometry.capacity));},[geometry.capacity]);
  const current=catalogPage(filtered,page,geometry.capacity);
  const categorySize=Math.max(1,Math.min(6,Math.floor((box.width+8)/148)));
  const groups=options.filter(c=>c.id!=='all'),categoryPages=Math.max(1,Math.ceil(groups.length/categorySize));
  const groupPage=Math.min(categoryPage,categoryPages-1);
  const select=(id:string)=>{setCategory(id);setPage(0);};
  const items=paged?current.items:filtered;
  return <section ref={root} aria-label="Catalogue de produits" className={`catalog-browser ${paged?'is-paged':''}`} style={paged?{height:box.height}:undefined}>
    {layout.categoriesEnabled&&<nav aria-label="Catégories de produits" className={`catalog-categories ${categoryPages===1&&groups.length<=Math.floor((box.width-96)/148)?'one-row':''}`}>
      <div className="catalog-categories-heading"><Button variant={selected==='all'?'default':'outline'} aria-pressed={selected==='all'} onClick={()=>select('all')}>Tous <span className="ml-2 opacity-70">{ordered.length}</span></Button>
        {categoryPages>1&&<div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Catégories précédentes" disabled={groupPage===0} onClick={()=>setCategoryPage(groupPage-1)}>←</Button><span className="catalog-category-pages-label text-xs text-muted-foreground">Catégories {groupPage+1} / {categoryPages}</span><Button variant="outline" size="icon" aria-label="Catégories suivantes" disabled={groupPage===categoryPages-1} onClick={()=>setCategoryPage(groupPage+1)}>→</Button></div>}
      </div>
      {groups.length>0&&<div className="catalog-category-buttons">{groups.slice(groupPage*categorySize,(groupPage+1)*categorySize).map(group=><Button key={group.id} className="catalog-category-button" title={group.label} variant={selected===group.id?'default':'outline'} aria-pressed={selected===group.id} onClick={()=>select(group.id)}><span className="line-clamp-2">{group.label}</span><span className="shrink-0 text-xs opacity-70">{group.count}</span></Button>)}</div>}
    </nav>}
    <div ref={grid} data-testid="catalog-grid" className={`catalog-products ${paged?'catalog-products-paged':''}`} style={{gridTemplateColumns:paged?`repeat(${geometry.columns}, minmax(0,1fr))`:displayColumns(layout.columns),...(paged?{gridTemplateRows:`repeat(${geometry.rows},minmax(0,1fr))`}:{})}}>
      {items.map((product,index)=>renderProduct(product,ordered.findIndex(p=>p.id===product.id),paged))}
      {items.length===0&&<div role="status" className="col-span-full flex items-center justify-center rounded-xl border bg-white p-6 text-center font-semibold">Aucun produit disponible</div>}
    </div>
    {paged&&<nav aria-label="Pages de produits" className="catalog-pagination"><Button variant="outline" disabled={current.page===0} onClick={()=>setPage(current.page-1)}>← Précédent</Button><div aria-live="polite" className="text-center"><strong className="block text-sm">Page {current.page+1} sur {current.count}</strong><span className="text-xs text-muted-foreground">{selected==='all'?'Tous les produits':options.find(c=>c.id===selected)?.label} · {filtered.length} produit{filtered.length===1?'':'s'}</span></div><Button variant="outline" disabled={current.page>=current.count-1} onClick={()=>setPage(current.page+1)}>Suivant →</Button></nav>}
  </section>;
}
