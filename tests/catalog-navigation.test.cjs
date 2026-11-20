const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loader}=require('./loader.cjs'),root=path.resolve(__dirname,'..');
const lib=()=>loader(root,{}).load('src/lib/display-layout.ts');
const legacy={schemaVersion:1,columns:3,orderedIds:['b','a']};
const config={...legacy,mode:'pages',rows:2,categoriesEnabled:true,categories:[{id:'drinks',label:'Breuvages',productIds:['a']},{id:'snacks',label:'Collations',productIds:['b','hidden','removed']}]};
const products=[{id:'a',name:'Eau',price:2,location:'10',quantity:5},{id:'b',name:'Barre',price:3,location:'20',quantity:0},{id:'c',name:'Autre',price:4,location:'30',quantity:7},{id:'hidden',visible:false}];
test('legacy display configurations keep their exact fields and scroll behavior',()=>{
 const {validateDisplay,needsNavigation}=lib();assert.equal(JSON.stringify(validateDisplay(legacy)),JSON.stringify(legacy));assert.equal(needsNavigation(legacy),false);assert.equal(needsNavigation(config),true);assert.equal(validateDisplay(config).schemaVersion,2);assert.equal(validateDisplay({...config,mode:'scroll',categoriesEnabled:false}).schemaVersion,1);
});
test('categories never hide unassigned visible products or mutate stock, prices or addresses',()=>{
 const {arrangeProducts,categoryOptions,filterCategory,validateDisplay}=lib(),before=JSON.stringify(products),layout=validateDisplay(config),ordered=arrangeProducts(products,layout);
 assert.equal(JSON.stringify(categoryOptions(ordered,layout)),JSON.stringify([{id:'all',label:'Tous',count:3},{id:'drinks',label:'Breuvages',count:1},{id:'snacks',label:'Collations',count:1},{id:'other',label:'Autres',count:1}]));
 assert.equal(filterCategory(ordered,layout,'drinks')[0].id,'a');assert.equal(filterCategory(ordered,layout,'other')[0].id,'c');assert.equal(filterCategory(ordered,layout,'all').length,3);assert.equal(filterCategory(ordered,layout,'missing').length,3);assert.equal(filterCategory(ordered,{...layout,categoriesEnabled:false},'drinks').length,3);assert.equal(JSON.stringify(products),before);
});
test('empty categories disappear, and duplicate assignments, reserved labels and invalid settings are rejected',()=>{
 const {validateDisplay,categoryOptions}=lib();
 assert.equal(categoryOptions([{id:'a'}],config).length,2);
 const invalid=[{...config,rows:5},{...config,mode:'infinite'},{...config,categoriesEnabled:'yes'},{...config,categories:[{id:'all',label:'Eau',productIds:[]}]},{...config,categories:[{id:'d',label:'Tous',productIds:[]}]},{...config,categories:[{id:'d',label:'Autres',productIds:[]}]},{...config,categories:[{id:'d',label:' X ',productIds:['a']},{id:'e',label:'x',productIds:['b']}]},{...config,categories:[{id:'d',label:'Eau',productIds:['a']},{id:'e',label:'Barres',productIds:['a']}]}];
 invalid.forEach(layout=>assert.throws(()=>validateDisplay(layout)));
});
test('every product is reachable exactly once across pages and final pages clamp after filtering',()=>{
 const {catalogPage}=lib(),items=Array.from({length:37},(_,id)=>({id})),seen=[];
 for(let page=0;page<5;page++)seen.push(...catalogPage(items,page,8).items.map(i=>i.id));
 assert.deepEqual(seen,items.map(i=>i.id));assert.equal(catalogPage(items.slice(0,3),4,8).page,0);assert.equal(catalogPage([],99,8).count,1);assert.equal(catalogPage(items,99,8).items.length,5);
});
test('grid density adapts to display space and a cart while honoring configured maximums',()=>{
 const {catalogGeometry}=lib();const wide=catalogGeometry(1800,760,4,3),cart=catalogGeometry(700,760,4,3),small=catalogGeometry(440,220,8,4);
 assert.equal(wide.columns,4);assert.equal(wide.rows,3);assert.ok(cart.capacity<=wide.capacity);assert.equal(small.rows,1);assert.equal(small.columns,2);assert.equal(catalogGeometry(0,0).capacity,1);
});
