const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const React=require('react'),Renderer=require('react-test-renderer'),{loader}=require('./loader.cjs'),root=path.resolve(__dirname,'..');
const wrapper=tag=>({children,...props})=>React.createElement(tag,props,children),icons=new Proxy({},{get:()=>wrapper('svg')});
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
async function mount(t,active){
 const calls=[];let purchases=0,clears=0;
 const fetch=async(url,options={})=>{calls.push({url,body:options.body?JSON.parse(options.body):null});if(url.endsWith('/employee/config'))return {ok:true,json:async()=>({ok:true,enabled:false})};if(url==='/api/placeholder-images')return {ok:true,json:async()=>[]};if(url.endsWith('/purchase/free'))return {ok:false,json:async()=>({ok:false,error:'Awaiting Fleet commissioning approval'})};if(url==='/api/admin/simulate-checkout')return {ok:true,json:async()=>({ok:true,simulated:true,receipt:{id:'TEST-fixture',createdAt:new Date().toISOString(),items:[{productId:'p1',name:'Produit canonique',qty:1,price:0}],theoreticalCents:0}})};throw Error('Forbidden unexpected request: '+url);};
 const x=loader(root,{}, {'next/image':wrapper('img'),'lucide-react':icons,'@/components/ui/button':{Button:wrapper('button')},'@/components/ui/card':Object.fromEntries(['Card','CardContent','CardFooter','CardHeader','CardTitle'].map(n=>[n,wrapper('div')])),'@/components/ui/separator':{Separator:wrapper('hr')},'./employee-cart-panel':{EmployeeCartPanel:()=>null},'./promo-input':{PromoInput:()=>null},'./test-mode':{useTestMode:()=>({active})},'@/lib/corporate-queue':{flushRedemptions:async()=>{},enqueueRedemption:()=>{throw Error('No redemption allowed');}}},{fetch});
 const {CartPanel}=x.load('src/components/cart-panel.tsx');let tree;
 await Renderer.act(async()=>{tree=Renderer.create(React.createElement(CartPanel,{cartItems:[{id:'p1',name:'Article gratuit',price:0,quantity:2,orderQuantity:1,imageId:'p1',location:'32',useRelay:false}],onUpdateQuantity(){},onRemoveItem(){},onPurchase(){purchases++;},onClearCart(){clears++;}}));});
 t.after(()=>Renderer.act(()=>tree.unmount()));
 return {tree,calls,purchases:()=>purchases,clears:()=>clears,button:label=>tree.root.findAllByType('button').find(n=>text(n).includes(label))};
}
test('commissioning blocks a real free order, without Stripe or falsely clearing the cart',async t=>{
 const x=await mount(t,false);await Renderer.act(async()=>{await x.button('Valider la commande gratuite').props.onClick();});
 const output=JSON.stringify(x.tree.toJSON());assert.match(output,/encore en configuration/);assert.match(output,/Aucun paiement/);assert.ok(!output.includes('statut de votre paiement sera vérifié'));assert.equal(x.purchases(),0);assert.equal(x.clears(),0);
 await Renderer.act(async()=>{await new Promise(r=>setTimeout(r,3200));});
 assert.equal(x.clears(),0);assert.equal(x.calls.filter(c=>/stripe|\/vend|fridge\/access/.test(c.url)).length,0);assert.equal(x.calls.filter(c=>c.url.endsWith('/purchase/free')).length,1);
});
test('admin simulation never enters physical dispensing or payment, and only clears the screen cart',async t=>{
 const x=await mount(t,true);await Renderer.act(async()=>{await x.button('Tester le panier').props.onClick();});
 assert.match(JSON.stringify(x.tree.toJSON()),/Simulation réussie/);assert.equal(x.calls.filter(c=>c.url==='/api/admin/simulate-checkout').length,1);assert.equal(x.calls.filter(c=>/stripe|purchase\/free|\/vend|fridge\/access|receipt/.test(c.url)).length,0);
 await Renderer.act(async()=>{x.button('Terminer le test').props.onClick();});assert.equal(x.purchases(),0);assert.equal(x.clears(),1);
});
