const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const React=require('react'),Renderer=require('react-test-renderer');
const {loader}=require('./loader.cjs');
const root=path.resolve(__dirname,'..');
const item=(id,name,properties={})=>({id,name,quantity:1,price:2,...properties});
const show=loader(root,{}).load('src/lib/showcase.ts').showcaseProducts;
test('rotation uses Fleet category assignments, sellable quantities and visible products',()=>{
  const layout={orderedIds:['d1','d2','s1','s2'],columns:0,schemaVersion:2,categories:[{id:'boire',label:'Breuvages',productIds:['d1','d2']}]};
  const products=[item('s1','Chips'),item('s2','Barre'),item('d1','Article A'),item('d2','Article B'),
    item('gone','Eau',{quantity:0}),item('hidden','C4',{visible:false}),item('unverified','biscuit',{stockUnavailable:true}),item('bad','Eau',{quantity:NaN})];
  assert.deepEqual(Array.from(show(products,layout),s=>s.product.id),['d1','s1','d2','s2']);
  assert.equal(show(products.slice(4),layout).length,0);
});

async function screen(t,products,preview,config,missing=new Set()) {
  const timers=new Map(),intervals=new Map(),requests=[],photoRequests=[];let clicks=0;
  const {Screensaver}=loader(root,{}, {},{
    Image:class {
      set src(url) {
        photoRequests.push(url);
        this.naturalWidth=missing.has(url)?0:240;
        queueMicrotask(()=>this.naturalWidth ? this.onload?.() : this.onerror?.());
      }
    },
    setInterval:(fn,ms)=>{const id=Symbol();intervals.set(id,{ms,fn});return id;},
    clearInterval:id=>intervals.delete(id),
    fetch:async url=>{requests.push(url);return {ok:true,json:async()=>config};},
    setTimeout:(fn,ms)=>{timers.set(ms,fn);return ms;},clearTimeout:id=>timers.delete(id)
  }).load('src/components/screensaver.tsx');
  const props={products,preview,onInteraction:()=>clicks++};
  let ui;
  await Renderer.act(async()=>{ui=Renderer.create(React.createElement(Screensaver,props));});
  t.after(()=>Renderer.act(()=>ui.unmount()));
  return {ui,requests,photoRequests,
    refresh:()=>Renderer.act(async()=>{for(const {fn} of intervals.values()) await fn();}),
    get clicks(){return clicks;},tick:ms=>Renderer.act(()=>timers.get(ms)()),update:products=>Renderer.act(async()=>ui.update(React.createElement(Screensaver,{...props,products})))};
}
test('virtual preview zooms through its own products, exits on first tap and never reads machine media',async t=>{
  const f=await screen(t,[item('a','Eau',{demoPhoto:'/showcase/boisson.webp'}),item('b','Chips',{demoPhoto:'/showcase/barre.webp'})],true);
  assert.equal(f.ui.root.findByType('img').props.src,'/showcase/boisson.webp');
  await f.tick(8000);assert.match(JSON.stringify(f.ui.toJSON()),/Chips/);
  await f.update([item('b','Chips',{quantity:0})]);assert.equal(f.ui.root.findByType('img').props.src,'/Shaka_Transparent.png');
  f.ui.root.findByType('button').props.onClick();assert.equal(f.clicks,1);assert.deepEqual(f.requests,[]);
});
test('when idle the last removed product gives way to the logo, even during a custom slide',async t=>{
  const f=await screen(t,[item('one','Eau',{depositCents:10,imageId:'eau'}),item('two','Chips',{imageId:'chips'})],false,{enabled:true,durationSeconds:3,images:[{id:'a',filename:'pub.jpg',url:'/pub.jpg'}]});
  await f.tick(8000);await f.tick(8000);assert.equal(f.ui.root.findByType('img').props.src,'/pub.jpg');
  await f.tick(3000);assert.match(JSON.stringify(f.ui.toJSON()),/Eau/);
  await f.tick(8000);await f.tick(8000);await f.update([]);
  assert.equal(f.ui.root.findByType('img').props.src,'/Shaka_Transparent.png');
  assert.equal(f.ui.root.findByType('button').props['aria-label'],'Touchez l’écran pour commencer');
});

test('machine ads rotate the matching local photos, skip missing files, and include later deliveries automatically',async t=>{
  const source=id=>'/api/product-images/'+id;
  const missing=new Set([source('orange')]);
  const products=[item('a','Café',{imageId:'cafe'}),item('b','Chips',{imageId:'chips'}),
    item('c','Jus',{imageId:'orange'}),item('d','Barre sans photo'),item('e','Eau',{imageId:'epuise',quantity:0})];
  const f=await screen(t,products,false,{images:[]},missing);
  const current=()=>f.ui.root.findByType('img').props.src;
  assert.deepEqual(f.photoRequests,[source('cafe'),source('chips'),source('orange')]);
  assert.equal(current(),source('cafe'));
  await f.tick(8000);assert.equal(current(),source('chips'));
  await f.tick(8000);assert.equal(current(),source('cafe'));
  missing.clear();
  await f.refresh();
  await f.tick(8000);assert.equal(current(),source('chips'));
  await f.tick(8000);assert.equal(current(),source('orange'));
  await f.update([products[0],item('f','Biscuit',{imageId:'biscuit'})]);
  assert.equal(current(),source('cafe'));
  await f.tick(8000);assert.equal(current(),'/Shaka_Transparent.png');
  await f.tick(4000);assert.equal(current(),source('biscuit'));
  await Renderer.act(()=>f.ui.root.findByType('img').props.onError());
  assert.equal(current(),source('cafe'));
  await f.update([products[3]]);
  assert.equal(current(),'/Shaka_Transparent.png');
});
test('a machine with only unphotographed stock keeps its configured advertising between logo slides',async t=>{
  const f=await screen(t,[item('a','Test')],false,{images:[{id:'ad',url:'/ad.jpg',filename:'ad.jpg'}],durationSeconds:4});
  assert.equal(f.ui.root.findByType('img').props.src,'/Shaka_Transparent.png');
  await f.tick(8000);assert.equal(f.ui.root.findByType('img').props.src,'/ad.jpg');
  await f.tick(4000);assert.equal(f.ui.root.findByType('img').props.src,'/Shaka_Transparent.png');
});

test('five products lead to a short logo and playback resumes with the next product',async t=>{
  const products=Array.from({length:7},(_,i)=>item('p'+i,'Chips '+i,{imageId:'photo'+i}));
  const f=await screen(t,products,false,{images:[]});
  const current=()=>f.ui.root.findByType('img').props.src;
  for(let i=0;i<5;i++){
    assert.equal(current(),'/api/product-images/photo'+i);
    await f.tick(8000);
  }
  assert.equal(current(),'/Shaka_Transparent.png');
  await f.tick(4000);
  assert.equal(current(),'/api/product-images/photo5');
  await f.tick(8000);
  assert.equal(current(),'/api/product-images/photo6');
});
