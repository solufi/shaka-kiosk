const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const React=require('react'),Renderer=require('react-test-renderer'),{loader}=require('./loader.cjs'),root=path.resolve(__dirname,'..');
const wrapper=tag=>({children,...props})=>React.createElement(tag,props,children),icons=new Proxy({},{get:()=>wrapper('svg')});
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function setup(t,identification='none',reject=false){
 const calls=[];let buys=0;
 const reply=(body,status=200)=>({ok:status===200,status,json:async()=>body});
 const fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):undefined;calls.push({url,body});
  if(url.endsWith('/employee/config'))return reply({ok:true,enabled:false,funding:{enabled:true,available:true,identification,companyName:'Test'}});
  if(url==='/api/placeholder-images')return reply([]);
  if(url.endsWith('/purchase/free'))return reject?reply({ok:false,error:'Numéro non reconnu'},409):reply({ok:true,sessionId:'funded-session'});
  if(url.endsWith('/vend'))return reply({ok:true,dropDetected:true});
  throw Error('Unexpected request: '+url);
 };
 const x=loader(root,{}, {'next/image':wrapper('img'),'lucide-react':icons,'@/components/ui/button':{Button:wrapper('button')},'@/components/ui/card':Object.fromEntries(['Card','CardContent','CardFooter','CardHeader','CardTitle'].map(n=>[n,wrapper('div')])),'@/components/ui/separator':{Separator:wrapper('hr')},'./employee-cart-panel':{EmployeeCartPanel:()=>null},'./promo-input':{PromoInput:()=>React.createElement('div',{'data-promo':true})},'./virtual-keyboard':{VirtualKeyboard:()=>null},'@/lib/corporate-queue':{flushRedemptions:async()=>{},enqueueRedemption:()=>assert.fail('Browser must never bill the company')}},{fetch});
 const {CartPanel}=x.load('src/components/cart-panel.tsx'),{ReceiptPrompt}=x.load('src/components/receipt-prompt.tsx');let tree;
 const props={cartItems:[{id:'p',name:'Snack',price:5.49,quantity:4,orderQuantity:1,location:'32',imageId:'photo'}],onUpdateQuantity(){},onRemoveItem(){},onPurchase(){buys++;},onClearCart(){}};
 await Renderer.act(async()=>{tree=Renderer.create(React.createElement(CartPanel,props));});t.after(()=>Renderer.act(()=>tree.unmount()));
 const button=label=>tree.root.findAllByType('button').find(n=>text(n).includes(label));
 return {tree,calls,button,ReceiptPrompt,buys:()=>buys,props,CartPanel};
}
async function waitForReceipt(f){const deadline=Date.now()+4000;while(!f.tree.root.findAllByType(f.ReceiptPrompt).length&&Date.now()<deadline)await Renderer.act(async()=>{await delay(50);});assert.equal(f.tree.root.findAllByType(f.ReceiptPrompt).length,1);}
test('anonymous company-funded checkout keeps catalog value, dispenses once and never requests Stripe or a promo',async t=>{
 const f=await setup(t);assert.ok(JSON.stringify(f.tree.toJSON()).includes('Gratuit pour vous'));assert.equal(f.tree.root.findAllByProps({'data-promo':true}).length,0);
 await Renderer.act(async()=>{await f.button('Prendre les articles').props.onClick();});await waitForReceipt(f);
 const request=f.calls.find(c=>c.url.endsWith('/purchase/free')).body;assert.equal(request.corporateFunded,true);assert.equal(request.items[0].price,549);assert.equal(request.employeeNumber,undefined);assert.equal(request.promoCode,undefined);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/vend')).length,1);assert.equal(f.buys(),1);assert.ok(f.calls.every(c=>!c.url.includes('/stripe/')));
});
test('tracking mode requires the employee number and submits it without a personal payment',async t=>{
 const f=await setup(t,'employee-number');assert.equal(f.button('Prendre les articles').props.disabled,true);
 await Renderer.act(async()=>f.button('Saisir mon numéro').props.onClick());
 await Renderer.act(async()=>f.tree.root.findByProps({'aria-label':'Numéro d’employé',maxLength:40}).props.onChange({target:{value:'001'}}));
 await Renderer.act(async()=>f.button('Utiliser ce numéro').props.onClick());assert.equal(f.button('Prendre les articles').props.disabled,false);
 await Renderer.act(async()=>{await f.button('Prendre les articles').props.onClick();});await waitForReceipt(f);
 assert.equal(f.calls.find(c=>c.url.endsWith('/purchase/free')).body.employeeNumber,'001');assert.ok(f.calls.every(c=>!c.url.includes('/stripe/')));
});
test('unknown employee number fails before requesting distribution',async t=>{
 const f=await setup(t,'employee-number',true);
 await Renderer.act(async()=>f.button('Saisir mon numéro').props.onClick());await Renderer.act(async()=>f.tree.root.findByProps({'aria-label':'Numéro d’employé',maxLength:40}).props.onChange({target:{value:'WRONG'}}));await Renderer.act(async()=>f.button('Utiliser ce numéro').props.onClick());
 await Renderer.act(async()=>{await f.button('Prendre les articles').props.onClick();});assert.ok(JSON.stringify(f.tree.toJSON()).includes('Numéro non reconnu'));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/vend')).length,0);assert.ok(f.calls.every(c=>!c.url.includes('/stripe/')));
});
