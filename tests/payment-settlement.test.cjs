const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loader}=require('./loader.cjs');const root=path.resolve(__dirname,'..');
const api=()=>loader(root,{}, {}, {fetch:async()=>{throw Error('Unexpected fetch');}}).load('src/lib/payment-settlement.ts');
const reply=body=>({ok:true,json:async()=>body});
test('a pending refund keeps the same session until a confirmed settlement',async()=>{
 let calls=0,waits=0;const messages=[];
 const request=async(url,options)=>{
  assert.equal(url,'/api/machine/stripe/vend-result');assert.deepEqual(JSON.parse(options.body),{sessionId:'s1'});
  return ++calls===1?reply({ok:true,pending:true,message:'Présentez la même carte'}):reply({ok:true,pending:false,session:{settlement_complete:true}});
 };
 const result=await api().settlePayment('/api/machine','s1',m=>messages.push(m),request,()=>0,async()=>waits++);
 assert.equal(calls,2);assert.equal(waits,1);assert.equal(messages[0],'Présentez la même carte');assert.equal(result.session.settlement_complete,true);
});
test('missing identity or unconfirmed response never announces success',async()=>{
 await assert.rejects(api().settlePayment('','',()=>{}),/Session/);
 await assert.rejects(api().settlePayment('','s1',()=>{},async()=>reply({ok:true,pending:false})),/non confirmé/);
});
test('timeout and transport failure preserve the review requirement',async()=>{
 let clock=0;
 await assert.rejects(api().settlePayment('','s1',()=>{},async()=>reply({ok:true,pending:true}),()=>clock,async()=>{clock=200000;}),/Remboursement non confirmé/);
 let calls=0;
 await assert.rejects(api().settlePayment('','s1',()=>{},async()=>{calls++;throw Error('Response lost');}),/Response lost/);
 assert.equal(calls,1);
});
