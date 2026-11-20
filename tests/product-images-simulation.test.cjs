const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const {loader}=require('./loader.cjs'),root=path.resolve(__dirname,'..');
test('new photos are served after startup, revalidate changes, support aliases and reject file escapes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shaka-photo-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const registry=path.join(dir,'registry.json');
 const x=loader(root,{SHAKA_PRODUCT_IMAGES_DIR:dir,SHAKA_PRODUCT_REGISTRY_FILE:registry});
 const {GET}=x.load('src/app/api/product-images/[id]/route.ts');
 const get=(id,headers={})=>GET({headers:new Headers(headers)},{params:Promise.resolve({id})});
 assert.equal((await get('new-photo')).status,404);
 await fs.writeFile(path.join(dir,'new-photo.jpg'),Buffer.from([255,216,255,1]));
 const first=await get('new-photo');assert.equal(first.status,200);assert.equal(first.headers.get('content-type'),'image/jpeg');assert.equal(Buffer.from(first.body).length,4);
 assert.equal((await get('new-photo',{'if-none-match':first.headers.get('etag')})).status,304);
 await fs.writeFile(path.join(dir,'new-photo.jpg'),Buffer.from([255,216,255,2]));assert.notEqual((await get('new-photo')).headers.get('etag'),first.headers.get('etag'));
 await fs.writeFile(registry,JSON.stringify({placeholderImages:[{id:'alias',imageUrl:'/images/products/new-photo.jpg'}]}));assert.equal((await get('alias')).status,200);
 await fs.symlink(registry,path.join(dir,'secret.png'));assert.equal((await get('secret')).status,404);
 for(const id of ['../registry.json','%2e%2e','/etc/passwd','file..jpg'])assert.equal((await get(id)).status,400);
 const entries=await x.load('src/app/api/placeholder-images/route.ts').GET();assert.ok(entries.body.some(e=>e.id==='alias'&&e.imageUrl==='/api/product-images/alias'));
});
test('simulation uses canonical prices and quantities without changing catalog or calling hardware',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shaka-sim-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'.shaka-cache'));
 const catalog=[{id:'p1',name:'Produit',price:5.49,quantity:3}];const file=path.join(dir,'.shaka-cache/products.json');await fs.writeFile(file,JSON.stringify(catalog));
 const calls=[];let accepted=true;
 const x=loader(root,{HOME:dir,AGENT_TOKEN:'fixture-private-token',MACHINE_ID:'test-pi',FLEET_URL:'https://fleet.example.test'}, {},{fetch:async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return {ok:accepted,json:async()=>({ok:accepted})};}});
 const route=x.load('src/app/api/admin/simulate-checkout/route.ts'),session=x.load('src/app/api/admin/session/route.ts');
 const request=(body,cookie)=>({url:'http://localhost:3000/api/admin/simulate-checkout',headers:new Headers({host:'localhost:3000',origin:'http://localhost:3000',...(cookie?{cookie}:{})}),text:async()=>JSON.stringify(body)});
 const purchase={items:[{productId:'p1',qty:2,price:0,name:'forged'}]};
 assert.equal((await route.POST(request(purchase))).status,401);assert.equal(calls.length,0);
 const login=await session.POST(request({pin:'211288'})),cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await session.GET(request({},cookie))).body.authenticated,true);
 const result=await route.POST(request(purchase,cookie));assert.equal(result.status,200);assert.equal(result.body.receipt.theoreticalCents,1098);assert.equal(result.body.receipt.items[0].name,'Produit');assert.equal(result.body.paymentTaken,false);assert.equal(result.body.inventoryChanged,false);assert.equal(calls.length,0);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),catalog);
 for(const items of [[{productId:'p1',qty:4}],[{productId:'p1',qty:-1}],[{productId:'p1',qty:1},{productId:'p1',qty:1}]])assert.equal((await route.POST(request({items},cookie))).status,400);
 const email={action:'email',sessionId:result.body.receipt.id,email:'nobody@example.invalid'};assert.equal((await route.POST(request(email,cookie))).status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://fleet.example.test/api/receipt');assert.match(calls[0].body.receipt.machineName,/TEST.*AUCUNE VENTE/);assert.equal(calls[0].body.receipt.totalCents,0);assert.equal(calls[0].body.receipt.discountCents,1098);assert.match(calls[0].body.receipt.items[0].name,/SIMULATION/);assert.equal((await route.POST(request(email,cookie))).status,409);
 const second=await route.POST(request(purchase,cookie));accepted=false;assert.equal((await route.POST(request({...email,sessionId:second.body.receipt.id},cookie))).status,502);assert.equal((await route.POST(request({...email,sessionId:second.body.receipt.id},cookie))).status,409);
});
test('description pages preserve all words and both allergen statements',()=>{
 const {productDetails}=loader(root,{}).load('src/lib/product-details.ts');const words=Array.from({length:250},(_,i)=>'mot'+i).join(' ');
 const details=productDetails(words+' | Allergènes — Contient : Lait, Soja, Blé. | Allergènes — Peut contenir : Arachides, Moutarde. | Source des allergènes : https://example.invalid');
 assert.equal(details.contains,'Lait, Soja, Blé.');assert.equal(details.mayContain,'Arachides, Moutarde.');assert.equal(details.pages.join(' '),words);assert.ok(details.pages.every(p=>p.length<=420));
});
