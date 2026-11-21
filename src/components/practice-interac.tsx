'use client';
import {useEffect,useState,useRef, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import type {PracticeShop} from '@/lib/practice-shop';

type Attempt={order:string;amount:number;phase:'pending'|'approved'|'canceled'|'declined';reference?:string};
type Result={configured:boolean;reader?:string;attempt?:Attempt};
const storage='shaka-practice-interac-pending';
async function request(values:Record<string,unknown>):Promise<Result> {
  const response=await fetch('/api/admin/practice-terminal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values),cache:'no-store'});
  const data=await response.json();
  if (!response.ok) throw Error(data.error || 'Le lecteur n’a pas répondu.');
  return data;
}
export function PracticeInterac({amount,shop,approved,restore,close}:{amount:number;shop:PracticeShop;approved:(order:PracticeShop,reference:string)=>void;restore:(shop:PracticeShop)=>void;close:()=>void}) {
  const [result,setResult]=useState<Result>();
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const locked=useRef(false);
  const mounted=useRef(true);
  const apply=useRef(approved);
  apply.current=approved;
  const recover=useRef(restore);recover.current=restore;
  function receive(data:Result) {
    if (!mounted.current) return;
    const a=data.attempt;
    const saved=JSON.parse(sessionStorage.getItem(storage)||'null');
    if (saved?.shop && (!a || saved.order===a.order || a.phase!=='pending')) recover.current(saved.shop);
    if (a && a.phase!=='pending') {
      if (saved?.order===a.order) {
        if (a.phase==='approved' && a.amount===saved.amount && a.reference) apply.current(saved.shop,a.reference);
        sessionStorage.removeItem(storage);
      }
    }
    setResult(data);setError('');
  }
  async function send(values:Record<string,unknown>) {
    if (locked.current) return;
    locked.current=true;setBusy(true);
    try {receive(await request(values));}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Communication interrompue.');}
    finally{locked.current=false;if(mounted.current)setBusy(false);}
  }
  useEffect(()=>{
    mounted.current=true;void send({action:'info'});
    return ()=>{mounted.current=false;};
  },[]);
  const a=result?.attempt;
  useEffect(()=>{
    if (a?.phase!=='pending' || error) return;
    const id=setInterval(()=>void send({action:'poll',order:a.order}),2500);
    return ()=>clearInterval(id);
  },[a?.phase,a?.order,error]);
  async function start() {
    if (locked.current) return;
    const saved=JSON.parse(sessionStorage.getItem(storage)||'null');
    const order=saved?.order && saved.amount===amount && JSON.stringify(shop)===JSON.stringify(saved.shop)?saved.order:crypto.randomUUID();
    sessionStorage.setItem(storage,JSON.stringify({order,amount,shop}));
    await send({action:'start',order,amount});
  }
  async function configure(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form=e.currentTarget, values=new FormData(form);
    form.reset();
    await send({action:'configure',key:values.get('key'),reader:values.get('reader'),account:values.get('account')});
    setEditing(false);
  }
  return <section className="space-y-3 rounded-xl border p-4">
    <h2 className="text-xl font-semibold">Essai Interac sur le terminal</h2>
    <p>Insérez la carte de test Interac dans le lecteur. La distribution et le reçu restent fictifs.</p>
    {error && <p role="alert">{error}</p>}
    {result && (!result.configured || editing) && <form className="grid gap-3" onSubmit={configure}>
      <label>Clé Stripe de test<Input type="password" name="key" autoComplete="off" required /></label>
      <label>Identifiant du lecteur de test<Input name="reader" placeholder="tmr_…" required /></label>
      <label>Compte Connect de test (facultatif)<Input name="account" placeholder="acct_…" /></label>
      <Button type="submit" disabled={busy}>Associer à cette machine</Button>
    </form>}
    {result?.configured && !editing && <>
      <p>Lecteur associé à cette machine · {result.reader}</p>
      {a && <p role="status">{a.phase==='approved'?'Interac approuvé en test':a.phase==='declined'?'Paiement de test refusé':a.phase==='canceled'?'Essai annulé':'En attente de la réponse du terminal'} · {(a.amount/100).toLocaleString('fr-CA',{style:'currency',currency:'CAD'})}{a.reference?' · '+a.reference:''}</p>}
      {a?.phase==='pending'?<Button variant="outline" disabled={busy} onClick={()=>send({action:'cancel',order:a.order})}>Annuler sur le terminal</Button>:<>
        <Button disabled={busy || amount<50 || !!error} onClick={start}>Envoyer le panier au terminal</Button>
        {amount<50 && <p>Ajoutez au moins 0,50 $ d’articles fictifs au panier.</p>}
        <Button variant="outline" disabled={busy} onClick={()=>setEditing(true)}>Changer de lecteur de test</Button>
      </>}
    </>}
    {error && <Button disabled={busy} onClick={()=>send(a?.phase==='pending'?{action:'poll',order:a.order}:{action:'info'})}>Reprendre le suivi</Button>}
    <Button variant="outline" disabled={busy || a?.phase==='pending'} onClick={close}>Retour au panier fictif</Button>
  </section>;
}
