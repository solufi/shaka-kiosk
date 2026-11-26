const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {loader} = require('./loader.cjs');
const root = path.resolve(__dirname,'..');

test('Wi-Fi list and connection both require the local admin session',async()=>{
  const deny = loader(root, {}, {'@/lib/local-admin':{adminAuthorized:()=>false}},
    {fetch:()=>assert.fail('unauthorized request reached the Pi')}).load('src/app/api/admin/wifi/route.ts');
  for(const action of ['scan','connect']){
    assert.equal((await deny.POST({text:async()=>JSON.stringify({action})})).status,401);
  }
});

test('authenticated Wi-Fi requests reach only the local agent and errors hide credentials',async()=>{
  let calls = 0;
  const wifi = loader(root,{AGENT_TOKEN:'test-token'},{'@/lib/local-admin':{adminAuthorized:()=>true}},{
    fetch:async(url,options)=>{
      calls++;
      assert.equal(url,'http://127.0.0.1:5001/admin/wifi');
      assert.equal(options.headers['x-agent-token'],'test-token');
      throw new Error('private Wi-Fi password');
    }
  }).load('src/app/api/admin/wifi/route.ts');
  assert.equal((await wifi.POST({text:async()=>'{"action":"invalid"}'})).status,400);
  const response=await wifi.POST({text:async()=>'{"action":"connect"}'});
  assert.equal(calls,1);
  assert.equal(response.status,503);
  assert.doesNotMatch(JSON.stringify(response.body),/private Wi-Fi password/);
});
