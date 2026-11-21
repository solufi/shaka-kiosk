const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {loader}=require('./loader.cjs');
const root=path.resolve(__dirname,'..');
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shaka-interac-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const order=crypto.randomUUID(),calls=[];
  const reader={id:'tmr_one',device_type:'bbpos_wisepos_e',action:null,status:'online',livemode:false};
  const intent={id:'pi_one',amount:100,metadata:{shaka_practice:order},currency:'cad',livemode:false,status:'requires_payment_method'};
  const stripe=async(url,options)=>{
    assert.equal(new URL(url).origin,'https://api.stripe.com');
    assert.equal(options.headers.Authorization,'Bearer rk_test_demo');
    calls.push([url,options]);
    let data;
    if(url.endsWith('/terminal/readers/tmr_one'))data=reader;
    else if(url.endsWith('/payment_intents')) {
      assert.equal(options.body.get('payment_method_types[]'),'interac_present');assert.equal(options.body.get('capture_method'),'automatic');
      assert.equal(options.body.get('amount'),'100');assert.ok(options.headers['Idempotency-Key']);data=intent;
    }else if(url.includes('expand%5B%5D'))data=intent;
    else if(url.endsWith('/process_payment_intent')) {
      reader.action={status:'in_progress',process_payment_intent:{payment_intent:intent.id}};data=reader;
    }else if(url.endsWith('/cancel_action')){reader.action=null;data=reader;}
    else if(url.endsWith('/cancel')){intent.status='canceled';data=intent;}
    else assert.fail(url);
    return {ok:true,json:async()=>structuredClone(data)};
  };
  const instance=()=>loader(root,{AGENT_TOKEN:'local-fixture'},{'node:os':{homedir:()=>dir}},{fetch:stripe,URLSearchParams}).load('src/lib/practice-terminal.ts').practiceTerminal;
  const run=instance();
  const configure=(key='rk_test_demo')=>run({action:'configure',reader:reader.id,key});
  const start=()=>run({action:'start',amount:100,order});
  return {dir,run,instance,reader,intent,calls,configure,start,order};
}
test('only a physical sandbox reader can be paired; credentials never returned',async t=>{
  const f=fixture(t);
  await assert.rejects(f.configure('sk_live_invalid'));assert.equal(f.calls.length,0);
  f.reader.device_type='simulated_wisepos_e';await assert.rejects(f.configure());
  f.reader.device_type='bbpos_wisepos_e';f.reader.livemode=true;await assert.rejects(f.configure());
  f.reader.livemode=false;const known=await f.configure();
  assert.ok(!JSON.stringify(known).includes('rk_test'));assert.equal(known.configured,true);
  const stat=fs.statSync(path.join(f.dir,'.shaka-cache','terminal-essai','configuration.json'));assert.equal(stat.mode & 0o777,0o600);
});
test('repeated starts and a server restart recover one confirmed Interac payment',async t=>{
  const f=fixture(t);await f.configure();await Promise.all([f.start(),f.start()]);
  assert.equal(f.calls.filter(([url])=>url.endsWith('/process_payment_intent')).length,1);
  await assert.rejects(f.run({action:'start',amount:100,order:crypto.randomUUID()}));
  const again=f.instance();f.intent.status='succeeded';f.intent.amount_received=100;f.intent.latest_charge={payment_method_details:{type:'card_present'}};
  await assert.rejects(again({action:'poll',order:f.order}));
  f.intent.latest_charge.payment_method_details.type='interac_present';
  assert.equal((await again({action:'poll',order:f.order})).attempt.phase,'approved');
  assert.equal((await f.start()).attempt.phase,'approved');
});
test('decline, canceled attempt and offline reader never produce approval',async t=>{
  const f=fixture(t);await f.configure();f.reader.status='offline';await assert.rejects(f.start());
  assert.ok(!f.calls.some(([url])=>url.endsWith('/payment_intents')));
  f.reader.status='online';await f.start();f.reader.action.status='failed';
  assert.equal((await f.run({action:'poll',order:f.order})).attempt.phase,'declined');
  const other=fixture(t);await other.configure();await other.start();
  assert.equal((await other.run({action:'cancel',order:other.order})).attempt.phase,'canceled');
});
test('a local admin session is required to configure or use the reader',async()=>{
  const route=loader(root,{},{'@/lib/local-admin':{adminAuthorized:()=>false},'@/lib/practice-terminal':{practiceTerminal:()=>assert.fail()}}).load('src/app/api/admin/practice-terminal/route.ts');
  assert.equal((await route.POST({})).status,401);
});

for (const approved of [true,false]) test('kiosk cart through reader result and virtual inventory: '+(approved?'approved':'declined'),async t=>{
  const React=require('react'),Renderer=require('react-test-renderer');
  const f=fixture(t);await f.configure();
  const storage=new Map(), requests=[], timers=new Map();
  const stubButton=({children,asChild,...props})=>asChild?children:React.createElement('button',props,children);
  const globals={
    crypto:{randomUUID:()=>f.order},window:{addEventListener(){},removeEventListener(){}},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setInterval:(fn,ms)=>{timers.set(ms,fn);return ms;},clearInterval:ms=>timers.delete(ms),
    fetch:async (url,opts)=>{
      requests.push(url);
      const value=url==='/api/admin/session'?{authenticated:true}:await f.run(JSON.parse(opts.body));
      return {ok:true,json:async()=>JSON.parse(JSON.stringify(value))};
    }
  };
  const page=loader(root,{},{
    'next/link':({children,...props})=>React.createElement('a',props,children),
    '@/components/ui/button':{Button:stubButton},
    '@/components/ui/input':{Input:props=>React.createElement('input',props)}
  },globals).load('src/app/essais/page.tsx').default;
  let ui;const act=Renderer.act;
  await act(async()=>{ui=Renderer.create(React.createElement(page));});
  t.after(()=>act(()=>ui.unmount()));
  const click=async(label)=>{let b=ui.root.findAllByType('button').find(b=>b.props['aria-label']===label||b.props.children===label);assert.ok(b,label);assert.ok(!b.props.disabled);await act(async()=>{await b.props.onClick();});};
  await click('Ajouter Essai Interac · approbation');await click('Tester le terminal Interac');await click('Envoyer le panier au terminal');
  assert.match(JSON.stringify(ui.toJSON()),/En attente de la réponse/);
  if (approved) {f.intent.status='succeeded';f.intent.amount_received=100;f.intent.latest_charge={payment_method_details:{type:'interac_present'}};}
  else f.reader.action.status='failed';
  await act(async()=>{timers.get(2500)();await new Promise(r=>setImmediate(r));});
  assert.match(JSON.stringify(ui.toJSON()),approved?/Interac approuvé/:/Paiement de test refusé/);
  await click('Retour au panier fictif');
  const article=ui.root.findAllByType('article').find(el=>el.findByType('h3').props.children==='Essai Interac · approbation');
  assert.ok(article.findAllByType('p').some(p=>p.props.children===(approved?'4 en stock':'5 en stock')));
  const rendered=JSON.stringify(ui.toJSON());assert.equal(rendered.includes('Achat simulé'),approved);
  assert.deepEqual([...new Set(requests)],['/api/admin/session','/api/admin/practice-terminal']);
});
