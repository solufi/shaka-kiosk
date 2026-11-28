/** Executes the exact checkout callback from production source with isolated I/O. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'node_modules/typescript'));
const source=ts.createSourceFile('cart.tsx',fs.readFileSync(path.join(root,'src/components/cart-panel.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='handlePaymentSuccess')callback=node.initializer.arguments[0];ts.forEachChild(node,visit);}visit(source);assert.ok(callback);
const code=ts.transpileModule('module.exports='+ts.createPrinter().printNode(ts.EmitHint.Expression,callback,source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(overrides={}){
 const states=[],redemptions=[],settlements=[];
 const {refundMessage}=require('./loader.cjs').loader(root).load('src/lib/payment-settlement.ts');
 const context={refundMessage,setSettlementMessage(){},module:{exports:{}},cartItems:[{id:'p',name:'Audit fixture',price:10,orderQuantity:1,location:'10'}],appliedPromo:{kind:'corporate',code:'AUDIT',discountValue:50},subtotal:10,
 handledRef:{current:false},cartSnapshotRef:{current:[]},purchaseIdRef:{current:'audit-session'},freeVendRef:{current:false},MACHINE_ID:'audit',hasRelayItem:()=>false,getVendApiBase:()=>'/fixture',
 setPaymentState:s=>states.push(s),setDispensingItem(){},setDoorClosed(){},setPaymentError(){},onPurchase(){},
 fetch:async()=>({ok:true,json:async()=>({ok:true,dropDetected:true})}),
 enqueueRedemption:x=>redemptions.push(x),flushRedemptions:async()=>{},settlePayment:async()=>{settlements.push({confirmedDelivery:1});return {ok:true,session:{settlement_complete:true}};},...overrides};
 vm.runInNewContext(code,context);return {run:context.module.exports,states,redemptions,settlements};
}
test('D03: browser storage failure cannot interrupt settlement after delivery',async()=>{
 const f=fixture({enqueueRedemption(){throw Error('LocalStorage quota exceeded');}});
 await f.run();assert.equal(f.settlements.length,1);assert.equal(f.states.at(-1),'success_normal');assert.equal(f.redemptions.length,0);
});
test('D03: lost vend response still reconciles payment using agent journal without browser usage',async()=>{
 const f=fixture({fetch:async()=>{throw Error('Physical delivery completed but HTTP response lost');}});
 await f.run();assert.equal(f.settlements.length,1);assert.equal(f.redemptions.length,0);assert.equal(f.states.at(-1),'vend_failed');
});
