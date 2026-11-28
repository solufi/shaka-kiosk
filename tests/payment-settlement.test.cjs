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
test('the refund screen uses the bank difference in both languages until the card is read',async()=>{
 const session={refund_amount:199,is_interac:true,reader_location:'machine de gauche'};
 const results=[{ok:true,pending:true,session},{ok:true,pending:true,session:{...session,refund_card_presented:true}},{ok:true,pending:false,session:{...session,settlement_complete:true}}];
 const messages=[];
 const result=await api().settlePayment('','s1',msg=>messages.push(msg),async()=>reply(results.shift()),()=>0,async()=>{});
 assert.match(messages[0],/1,99 \$/);assert.match(messages[0],/\$1\.99/);
 assert.match(messages[0],/carte utilisée/);assert.match(messages[0],/card you used/);
 assert.match(messages[0],/machine de gauche/);assert.match(messages[0],/to your left/);
 assert.match(messages[1],/being processed/);assert.doesNotMatch(messages[1],/again/);
 assert.match(api().refundMessage(result.session),/Refund of \$1\.99 confirmed/);
 assert.doesNotMatch(api().refundMessage({refund_amount:448,is_interac:false}),/again/);
 assert.equal(api().refundMessage({refund_amount:0}),'');
});
