const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const React=require('react'),Renderer=require('react-test-renderer');
const {loader}=require('./loader.cjs');
const root=path.resolve(__dirname,'..');
const wrapper=tag=>({children,...props})=>React.createElement(tag,props,children);
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const icons=new Proxy({},{get:()=>wrapper('svg')});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('zero-price fridge checkout retains its purchase identity through closing and emailing the receipt',async t=>{
 const calls=[];let clears=0;
 const reply=body=>({ok:true,status:200,json:async()=>body});
 const fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):undefined;calls.push({url,body});
  if(url.endsWith('/employee/config'))return reply({ok:true,enabled:false});
  if(url==='/api/placeholder-images')return reply([]);
  if(url.endsWith('/purchase/free'))return reply({ok:true,sessionId:'free-fridge-123'});
  if(url.endsWith('/fridge/access'))return reply({ok:true,pending:true});
  if(url.endsWith('/fridge/status'))return reply({ok:true,accessCompleted:true});
  if(url.endsWith('/receipt/send'))return reply({ok:true});
  throw Error('Unexpected request: '+url);
 };
 const x=loader(root,{}, {
  'next/image':{default:wrapper('img')}, 'lucide-react':icons,
  '@/components/ui/button':{Button:wrapper('button')},
  '@/components/ui/card':Object.fromEntries(['Card','CardContent','CardFooter','CardHeader','CardTitle'].map(n=>[n,wrapper('div')])),
  '@/components/ui/separator':{Separator:wrapper('hr')},
  './employee-cart-panel':{EmployeeCartPanel:()=>null},
  './promo-input':{PromoInput:()=>null},
  './virtual-keyboard':{VirtualKeyboard:({value,onChange})=>React.createElement('input',{value,onChange:e=>onChange(e.target.value)})},
  '@/lib/corporate-queue':{flushRedemptions:async()=>{},enqueueRedemption:()=>{throw Error('No corporate code used');}},
 },{fetch});
 const {CartPanel}=x.load('src/components/cart-panel.tsx');
 const {ReceiptPrompt}=x.load('src/components/receipt-prompt.tsx');
 let tree;
 await Renderer.act(async()=>{tree=Renderer.create(React.createElement(CartPanel,{
  cartItems:[{id:'free-product',name:'Article gratuit',price:0,quantity:5,orderQuantity:1,location:'10',useRelay:true,imageUrl:'/product.png'}],
  onUpdateQuantity(){},onRemoveItem(){},onPurchase(){},onClearCart(){clears++;},
 }));});
 t.after(()=>Renderer.act(()=>tree.unmount()));
 const button=label=>tree.root.findAllByType('button').find(n=>text(n).includes(label));
 await Renderer.act(async()=>{await button('Valider la commande gratuite').props.onClick();});
 const deadline=Date.now()+6000;
 while(!tree.root.findAllByType(ReceiptPrompt).length && Date.now()<deadline){await Renderer.act(async()=>{await delay(100);});}
 assert.equal(tree.root.findAllByType(ReceiptPrompt).length,1,'Receipt offered after a confirmed door cycle');
 assert.equal(clears,0,'Cart must survive until the receipt question is answered');
 assert.equal(calls.filter(c=>c.url.endsWith('/stripe/pay')).length,0);
 assert.equal(calls.find(c=>c.url.endsWith('/fridge/access')).body.sessionId,'free-fridge-123');
 await Renderer.act(async()=>{button('Oui, par courriel').props.onClick();});
 await Renderer.act(async()=>{tree.root.findByType('input').props.onChange({target:{value:'client@example.invalid'}});});
 await Renderer.act(async()=>{await button('Envoyer le reçu').props.onClick();});
 assert.deepEqual(calls.find(c=>c.url.endsWith('/receipt/send')).body,{email:'client@example.invalid',sessionId:'free-fridge-123'});
 assert.ok(JSON.stringify(tree.toJSON()).includes('Demande de reçu enregistrée'));
});

test('an HTTP failure never displays receipt sent even if the body says ok',async t=>{
 const x=loader(root,{}, {'lucide-react':icons,'./virtual-keyboard':{VirtualKeyboard:({onChange})=>React.createElement('input',{onChange:e=>onChange(e.target.value)})}},
  {fetch:async()=>({ok:false,json:async()=>({ok:true,error:'SMTP indisponible'})})});
 const {ReceiptPrompt}=x.load('src/components/receipt-prompt.tsx');let tree;
 await Renderer.act(async()=>{tree=Renderer.create(React.createElement(ReceiptPrompt,{vendApiBase:'/api/machine',sessionId:'s1',onDone(){}}));});
 t.after(()=>Renderer.act(()=>tree.unmount()));
 const button=label=>tree.root.findAllByType('button').find(n=>text(n).includes(label));
 await Renderer.act(async()=>{button('Oui, par courriel').props.onClick();});
 await Renderer.act(async()=>{tree.root.findByType('input').props.onChange({target:{value:'client@example.invalid'}});});
 await Renderer.act(async()=>{await button('Envoyer le reçu').props.onClick();});
 assert.ok(JSON.stringify(tree.toJSON()).includes('SMTP indisponible'));
 assert.ok(!JSON.stringify(tree.toJSON()).includes('Demande de reçu enregistrée'));
});
