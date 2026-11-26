const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loader}=require('./loader.cjs');
const root=path.resolve(__dirname,'..');
function setup(){
 const calls=[];
 const x=loader(root,{AGENT_TOKEN:'private-agent-test',KIOSK_ADMIN_PIN:'123456'}, {},{fetch:async(url,options)=>{calls.push({url,options});return {status:200,text:async()=>'{"ok":true}'};}});
 const session=x.load('src/app/api/admin/session/route.ts'),relay=x.load('src/app/api/admin/relay-test/route.ts');
 const request=(body,extra={})=>({url:'http://localhost:3000/api/admin/session',headers:new Headers({host:'localhost:3000',origin:'http://localhost:3000',...extra}),text:async()=>JSON.stringify(body)});
 const login=async()=>{const r=await session.POST(request({pin:'123456'}));assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
 return {row:x.load('src/app/api/admin/vend-test/route.ts'),session,relay,request,login,calls,env:x.env,ctx:x.ctx};
}
test('relay test requires a server-verified admin login and keeps credentials out of the client',async()=>{
 const x=setup();const command={commandId:'admin-relay:test-123'};
 assert.equal((await x.relay.POST(x.request(command))).status,401);assert.equal(x.calls.length,0);
 assert.equal((await x.session.POST(x.request({pin:'000000'}))).status,401);
 const cookie=await x.login();assert.ok(!cookie.includes('private-agent-test'));
 const r=await x.relay.POST(x.request(command,{cookie}));assert.equal(r.status,200);assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].url,'http://127.0.0.1:5001/admin/relay-test');
 assert.deepEqual(JSON.parse(x.calls[0].options.body),command);
 assert.equal(x.calls[0].options.headers['x-agent-token'],'private-agent-test');
 assert.ok(!r.body.includes('private-agent-test'));
});
test('cross-site, nonlocal, forged and expired admin sessions cannot trigger the relay',async()=>{
 const x=setup();const cookie=await x.login();const command={commandId:'admin-relay:test-123'};
 for(const extra of [{cookie,origin:'https://evil.invalid'},{cookie,host:'evil.invalid'},{cookie,'sec-fetch-site':'cross-site'},{cookie:cookie+'0'}]){
  assert.equal((await x.relay.POST(x.request(command,extra))).status,401);
 }
 const original=Date.now;
 try{Date.now=()=>original()+16*60000;assert.equal((await x.relay.POST(x.request(command,{cookie}))).status,401);}finally{Date.now=original;}
 assert.equal(x.calls.length,0);
});
test('PIN guessing is bounded and a test cannot select arbitrary GPIOs or dispense through the public proxy',async()=>{
 const x=setup();for(let i=0;i<5;i++)assert.equal((await x.session.POST(x.request({pin:'000000'}))).status,401);
 assert.equal((await x.session.POST(x.request({pin:'123456'}))).status,401);
 const y=setup();const cookie=await y.login();assert.equal((await y.relay.POST(y.request({commandId:'purchase:p:0',pin:4},{cookie}))).status,400);
 const proxy=loader(root,{AGENT_TOKEN:'private-agent-test'}).load('src/app/api/machine/[...path]/route.ts');
 assert.equal((await proxy.POST({...y.request({}),method:'POST'},{params:Promise.resolve({path:['admin','relay-test']})})).status,404);
 assert.equal(y.calls.length,0);
});

test('row test accepts only a signed local admin session and a single slot',async()=>{
 const x=setup(), command={location:'31',commandId:'admin-vend:one'};
 assert.equal((await x.row.POST(x.request(command))).status,401);
 const cookie=await x.login();
 assert.equal((await x.row.POST(x.request(command,{cookie,origin:'https://other.invalid'}))).status,401);
 for(const body of [{...command,location:'3132'},{...command,seq:'31'},{...command,commandId:'session:1'}]){
  assert.equal((await x.row.POST(x.request(body,{cookie}))).status,400);
 }
 assert.equal(x.calls.length,0);
 assert.equal((await x.row.POST(x.request(command,{cookie}))).status,200);
 assert.equal(x.calls[0].url,'http://127.0.0.1:5001/admin/vend-test');
 assert.deepEqual(JSON.parse(x.calls[0].options.body),command);
 const proxy=loader(root,{AGENT_TOKEN:'private-agent-test'}).load('src/app/api/machine/[...path]/route.ts');
 assert.equal((await proxy.POST({...x.request(command),method:'POST'},{params:Promise.resolve({path:['admin','vend-test']})})).status,404);
});

test('admin polling cannot prolong access, a touch extends it, and neither expiry nor logout can be undone by a late touch',async()=>{
 const x=setup();
 const clock=Date.now;
 let now=clock();
 try{
   Date.now=()=>now;
   const cookie=await x.login(),req=x.request({},{cookie});
   const status=()=>x.session.GET(req).body;
   const start=now;
   now+=9*60000;
   assert.equal(status().expiresAt,start+600000);
   assert.equal(x.session.PUT(req).body.expiresAt,now+600000);
   now+=600000-1;
   assert.equal(status().authenticated,true);
   now++;
   assert.equal(status().authenticated,false);
   assert.equal(x.session.PUT(req).status,401);
   const next=x.request({},{cookie:await x.login()});
   x.session.DELETE(next);
   assert.equal(x.session.PUT(next).status,401);
 }finally{Date.now=clock;}
});
