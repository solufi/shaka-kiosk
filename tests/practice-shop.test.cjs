const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const Renderer = require('react-test-renderer');
const {loader} = require('./loader.cjs');
const root = path.resolve(__dirname,'..');

test('paid, free and out-of-stock purchases affect only the current practice inventory',()=>{
  const api = loader(root,{}).load('src/lib/practice-shop.ts');
  const first = api.newPracticeShop();
  let shop = api.addPracticeProduct(first,'Canette fictive','5,49','1',true);
  const id = shop.products.at(-1).id;
  shop = api.changePracticeCart(shop,id,1);
  assert.equal(api.changePracticeCart(shop,id,1),shop);
  shop = api.payPracticeCart(shop);
  assert.equal(shop.receipts[0].theoreticalCents,559);
  assert.match(shop.receipts[0].id,/^TEST-/);
  assert.equal(shop.products.at(-1).quantity,0);
  assert.equal(api.payPracticeCart(shop),shop);
  assert.equal(api.changePracticeCart(shop,id,1),shop);
  shop = api.payPracticeCart(api.changePracticeCart(shop,'test-collation',1));
  assert.equal(shop.receipts[0].theoreticalCents,0);
  assert.equal(shop.receipts.length,2);
  assert.equal(shop.products.find(p=>p.id==='test-collation').quantity,2);
  assert.equal(first.products.length,5);
  assert.equal(api.newPracticeShop().receipts.length,0);
  assert.throws(()=>api.addPracticeProduct(shop,'Article','-1','3',false));
  assert.throws(()=>api.addPracticeProduct(shop,'Article','3','-1',false));
});

for (const authenticated of [false,true]) test('practice screen uses only the admin session endpoint, admin='+authenticated,async t=>{
  const requests=[];
  const button=({children,asChild,...props})=>asChild?children:React.createElement('button',props,children);
  const instance=loader(root,{},{
    'next/link':({children,...props})=>React.createElement('a',props,children),
    '@/components/ui/button':{Button:button},
    '@/components/ui/input':{Input:props=>React.createElement('input',props)},
  },{window:{addEventListener(){},removeEventListener(){}},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({authenticated})};}});
  const Page=instance.load('src/app/(app)/essais/page.tsx').default;
  let ui;await Renderer.act(async()=>{ui=Renderer.create(React.createElement(Page));});
  t.after(()=>Renderer.act(()=>ui.unmount()));
  const controls=()=>ui.root.findAllByType('button');
  const add=()=>controls().find(b=>b.props['aria-label']==='Ajouter Ghost Welch’s Grape');
  assert.equal(!!add(),authenticated);
  if(authenticated){
    await Renderer.act(async()=>add().props.onClick());
    await Renderer.act(async()=>controls().find(b=>b.props.children==='Simuler le paiement et la distribution').props.onClick());
    assert.match(JSON.stringify(ui.toJSON()),/Achat simulé/);
    assert.match(JSON.stringify(ui.toJSON()),/3 en stock/);
  }
  assert.deepEqual(requests,['/api/admin/session']);
});
