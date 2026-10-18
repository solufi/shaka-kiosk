const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {loader}=require('./loader.cjs');const root=path.resolve(__dirname,'..');
test('display persists through restart, is agent-only and browser acknowledgement cannot publish',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kiosk-display-'));try{
 const env={SHAKA_DISPLAY_DIR:dir,AGENT_TOKEN:'secret'};let l=loader(root,env);let r=l.load('src/app/api/local-display/route.ts');
 const publication={revision:'00000000-0000-4000-8000-000000000001',publishedAt:new Date().toISOString(),config:{schemaVersion:1,columns:3,orderedIds:['b','a']}};
 const req=(body,headers={})=>({headers:new Headers(headers),text:async()=>JSON.stringify(body)});
 assert.equal((await r.POST(req(publication))).status,401);
 assert.equal((await r.POST(req(publication,{'x-agent-token':'secret'}))).status,200);
 assert.equal((await r.GET()).body.renderedRevision,undefined);
 l=loader(root,env);r=l.load('src/app/api/local-display/route.ts');assert.equal((await r.GET()).body.published.revision,publication.revision);
 const headers={host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'};
 assert.equal((await r.PATCH(req({revision:publication.revision},{...headers,origin:'https://evil.invalid'}))).status,403);
 assert.equal((await r.PATCH(req({revision:'old'},headers))).status,409);
 assert.equal((await r.PATCH(req({revision:publication.revision,config:{columns:8}},headers))).status,200);
 const result=(await r.GET()).body;assert.equal(result.renderedRevision,publication.revision);assert.equal(result.published.config.columns,3);
 assert.equal((await r.POST(req({...publication,config:{schemaVersion:1,columns:99,orderedIds:[]}}, {'x-agent-token':'secret'}))).status,400);
 assert.equal((await r.GET()).body.published.config.columns,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Fleet and kiosk use the same presentation rules',()=>{
 const {arrangeProducts}=loader(root,{}).load('src/lib/display-layout.ts');
 assert.deepEqual(Array.from(arrangeProducts([{id:'a',location:'10',quantity:7},{id:'b',location:'20'},{id:'c',visible:false}],{schemaVersion:1,columns:2,orderedIds:['b','a']}),p=>p.id),['b','a']);
});
