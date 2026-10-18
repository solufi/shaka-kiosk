const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loader}=require('./loader.cjs');const root=path.resolve(__dirname,'..');
test('local kiosk proxy refuses cross-site and nonlocal hosts, keeps agent secret server-side',async()=>{
 const calls=[];const l=loader(root,{AGENT_TOKEN:'test-secret'},{},{fetch:async(url,options)=>{calls.push({url,options});return {status:200,text:async()=>'{"ok":true}'};}});
 const r=l.load('src/app/api/machine/[...path]/route.ts');const ctx={params:Promise.resolve({path:['vend']})};
 const request=(extra={})=>({method:'POST',headers:new Headers({host:'localhost:3000',...extra}),text:async()=>'{"commandId":"test"}'});
 assert.equal((await r.POST(request({origin:'https://elsewhere.invalid'}),ctx)).status,403);
 assert.equal((await r.POST(request({host:'evil.invalid'}),ctx)).status,403);
 assert.equal((await r.POST(request({'sec-fetch-site':'cross-site'}),ctx)).status,403);assert.equal(calls.length,0);
 const response=await r.POST(request({origin:'http://localhost:3000'}),ctx);assert.equal(response.status,200);assert.equal(calls.length,1);
 assert.equal(calls[0].url,'http://127.0.0.1:5001/vend');assert.equal(calls[0].options.headers['x-agent-token'],'test-secret');assert.ok(!response.body.includes('test-secret'));
 assert.equal((await r.POST(request(),{params:Promise.resolve({path:['maintenance']})})).status,404);
});
test('catalog writes require agent identity',async()=>{
 const l=loader(root,{AGENT_TOKEN:'test-secret'});const r=l.load('src/app/api/local-products/route.ts');
 const result=await r.POST({headers:new Headers(),json:async()=>{throw new Error('must reject before parsing');}});
 assert.equal(result.status,401);
});

test('employee workflow uses authenticated local proxy and cannot read private photos',async()=>{
 const calls=[];const l=loader(root,{AGENT_TOKEN:'test-secret'},{},{fetch:async(url,options)=>{calls.push({url,options});return {status:200,text:async()=>'{"ok":true}'};}});const r=l.load('src/app/api/machine/[...path]/route.ts');
 const req={method:'POST',headers:new Headers({host:'localhost:3000',origin:'http://localhost:3000'}),text:async()=>'{"id":"emp-test"}'};
 for(const action of ['prepare','start','finish','cancel'])assert.equal((await r.POST(req,{params:Promise.resolve({path:['employee',action]})})).status,200);
 assert.equal(calls.length,4);assert.ok(calls.every(c=>c.options.headers['x-agent-token']==='test-secret'));
 for(const action of ['photo','photos','config'])assert.equal((await r.POST(req,{params:Promise.resolve({path:['employee',action]})})).status,404);
});
