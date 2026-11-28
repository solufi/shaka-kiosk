const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loader}=require('./loader.cjs');const root=path.resolve(__dirname,'..');
test('an empty inventory image ID resolves only to an exact local product photo',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kiosk-local-photo-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'.shaka-cache'));
 const rows=[{id:'same',imageId:'',quantity:3},{id:'other',imageId:'custom'},{id:'missing',imageId:''}];
 fs.writeFileSync(path.join(dir,'.shaka-cache/products.json'),JSON.stringify(rows));
 for(const file of ['same.webp','other.jpg','missing-old.jpg'])fs.writeFileSync(path.join(dir,file),'image');
 const api=loader(root,{HOME:dir,SHAKA_PRODUCT_IMAGES_DIR:dir},{},{fetch:async()=>({ok:true,json:async()=>({ok:true,data:rows})})}).load('src/app/api/local-products/route.ts');
 const products=(await api.GET()).body.data;
 assert.deepEqual(products.map(p=>p.imageId),['same','custom','']);
 assert.equal(products[0].quantity,3);
});
test('row stock comes from the durable agent inventory and unavailable counters fail closed',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kiosk-slots-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'.shaka-cache'));
 const cached=[{id:'dual',quantity:5,slots:[{location:'10',quantity:3},{location:'11',quantity:2}]},{id:'legacy',quantity:7}];fs.writeFileSync(path.join(dir,'.shaka-cache/products.json'),JSON.stringify(cached));
 let live=true,calls=0;const l=loader(root,{HOME:dir},{},{fetch:async url=>{calls++;assert.equal(url,'http://127.0.0.1:5001/inventory');if(!live)throw Error('Offline');return {ok:true,json:async()=>({ok:true,data:[{...cached[0],quantity:1},cached[1]]})};}});
 const api=l.load('src/app/api/local-products/route.ts');assert.equal((await api.GET()).body.data[0].quantity,1);
 live=false;const fallback=(await api.GET()).body.data;assert.equal(fallback[0].quantity,0);assert.equal(fallback[0].stockUnavailable,true);assert.equal(fallback[1].quantity,0);
 fs.writeFileSync(path.join(dir,'.shaka-cache/products.json'),JSON.stringify([cached[1]]));assert.equal((await api.GET()).body.data[0].quantity,0);assert.equal(calls,3);
});
