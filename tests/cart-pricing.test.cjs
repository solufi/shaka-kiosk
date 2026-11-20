const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loader}=require('./loader.cjs'),root=path.resolve(__dirname,'..');
test('checkout adds deposits only to marked containers and excludes them from promotional discounts',()=>{
 const p=loader(root,{}).load('src/lib/cart-pricing.ts'),items=[{id:'can',price:5.49,depositCents:10,orderQuantity:2},{id:'bar',price:3.49,orderQuantity:1}];
 let a=p.cartPricing(items);assert.equal(a.goodsSubtotalCents,1447);assert.equal(a.depositCents,20);assert.equal(a.totalCents,1467);
 a=p.cartPricing(items,{kind:'promo',discountType:'percent',discountValue:100});assert.equal(a.discountCents,1447);assert.equal(a.totalCents,20,'A free product promotion still requires payment for its deposit');
 a=p.cartPricing(items,{kind:'promo',discountType:'fixed',discountValue:1000});assert.equal(a.totalCents,20);
 assert.throws(()=>p.productDepositCents({depositCents:-10}));assert.throws(()=>p.productDepositCents({depositCents:'10'}));
});
test('corporate full funding includes deposits and partial subsidy uses the exact integer amount shown before payment',()=>{
 const p=loader(root,{}).load('src/lib/cart-pricing.ts'),items=[{id:'can',price:5.49,depositCents:10,orderQuantity:2}];
 assert.equal(p.cartPricing(items,null,true).totalCents,0);assert.equal(p.cartPricing(items,null,true).discountCents,1118);
 const a=p.cartPricing(items,{kind:'corporate',discountType:'percent',discountValue:38});assert.equal(a.discountCents,424);assert.equal(a.totalCents,694);assert.equal(p.productSellingCents(items[0]),559);
});
test('hardware-free checkout simulation uses the same complete price without changing stock',()=>{
 const x=loader(root,{}),catalog=[{id:'can',name:'Can',price:5.49,depositCents:10,quantity:4}],original=JSON.stringify(catalog),receipt=x.load('src/lib/simulation.ts').simulateCheckout([{productId:'can',qty:2}],catalog);
 assert.equal(receipt.theoreticalCents,1118);assert.equal(JSON.stringify(catalog),original);
});
