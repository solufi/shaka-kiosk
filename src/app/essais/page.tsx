'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PracticeInterac } from '@/components/practice-interac';
import { Input } from '@/components/ui/input';
import { productSellingCents } from '@/lib/cart-pricing';
import { newPracticeShop, addPracticeProduct, changePracticeCart, payPracticeCart } from '@/lib/practice-shop';

const dollars = (cents:number) => (cents/100).toLocaleString('fr-CA',{style:'currency',currency:'CAD'});

export default function PracticePage() {
  const [access,setAccess] = useState<'loading'|'admin'|'locked'>('loading');
  const [shop,setShop] = useState(newPracticeShop);
  const [terminal,setTerminal] = useState(false);
  const [adding,setAdding] = useState(false);
  const [error,setError] = useState('');
  const [showHistory,setShowHistory] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let mounted = true;
    async function verify() {
      try {
        const response = await fetch('/api/admin/session',{cache:'no-store'});
        const allowed = response.ok && (await response.json()).authenticated === true;
        if (mounted) setAccess(allowed ? 'admin' : 'locked');
      } catch { if (mounted) setAccess('locked'); }
    }
    if (typeof sessionStorage!=='undefined' && sessionStorage.getItem('shaka-practice-interac-pending')) setTerminal(true);
    void verify();
    const timer = setInterval(verify,30000);
    window.addEventListener('pageshow',verify);
    return () => { mounted=false; clearInterval(timer); window.removeEventListener('pageshow',verify); };
  },[]);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    try {
      setShop(addPracticeProduct(shop,String(fields.get('name')??''),String(fields.get('price')??''),String(fields.get('stock')??''),fields.has('deposit')));
      setError(''); setAdding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Article invalide'); }
  }
  function purchase() {
    if (pending.current) return;
    pending.current = true;
    try {setShop(payPracticeCart(shop));setError('');}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Vérifiez le panier');}
    finally {pending.current = false;}
  }
  const returnLink = <Button variant="outline" asChild><Link href={access==='admin'?'/dashboard':'/'} replace>Quitter le mode test</Link></Button>;
  if (access !== 'admin') return <main className="mx-auto grid max-w-lg gap-4 p-8"><h1 className="text-2xl font-bold">Mode test</h1><p>{access==='loading'?'Vérification de la session…':'Connectez-vous au menu Admin pour ouvrir les essais.'}</p>{returnLink}</main>;
  const items = shop.products.filter(p=>shop.cart[p.id]);
  const total = items.reduce((sum,p)=>sum+shop.cart[p.id]*productSellingCents(p),0);
  const last = shop.receipts[0];
  return <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400 bg-amber-100 p-4 text-amber-950">
      <div><h1 className="text-2xl font-bold">Mode test</h1><p>Articles, stock et transactions fictifs. La session se termine en quittant ou en rechargeant cet écran.</p></div>{returnLink}
    </header>
    {terminal ? <PracticeInterac amount={total} shop={shop} restore={setShop} close={()=>setTerminal(false)} approved={(original,reference)=>{
      const settled=payPracticeCart(original);
      settled.receipts[0]={...settled.receipts[0],terminalReference:reference};
      setShop(settled);
    }} /> : <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Articles fictifs</h2><Button variant="outline" onClick={()=>{setAdding(!adding);setError('');}}>{adding?'Annuler':'Créer un article'}</Button></div>
        {adding && <form onSubmit={add} className="grid gap-3 rounded-xl border p-4">
          <label>Nom<Input name="name" required maxLength={60} autoFocus /></label>
          <div className="grid grid-cols-2 gap-2"><label>Prix ($)<Input name="price" inputMode="decimal" defaultValue="1,00" required /></label><label>Stock fictif<Input name="stock" type="number" min="0" max="1000" defaultValue="5" required /></label></div>
          <label><input name="deposit" type="checkbox" /> Ajouter une consigne fictive de 0,10 $</label>
          <Button type="submit">Enregistrer l’article fictif</Button>
        </form>}
        <div className="grid gap-3 sm:grid-cols-2">{shop.products.map(p=><article key={p.id} className="grid content-start gap-2 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">{p.name}</h3><p>{dollars(Math.round(p.price*100))}{p.depositCents>0?' + 0,10 $ de consigne':''}</p>
          <p>{p.quantity===0?'Épuisé':p.quantity+' en stock'}</p>
          <Button aria-label={'Ajouter '+p.name} disabled={(shop.cart[p.id]||0)>=Math.min(p.quantity,100)} onClick={()=>setShop(s=>changePracticeCart(s,p.id,1))}>Ajouter au panier</Button>
        </article>)}</div>
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-xl font-semibold">Panier de test</h2>
        {!items.length && <p>Le panier est vide.</p>}
        {items.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><span>{shop.cart[p.id]} × {p.name}</span><Button size="sm" variant="outline" aria-label={'Retirer une unité de '+p.name} onClick={()=>setShop(s=>changePracticeCart(s,p.id,-1))}>−1</Button></div>)}
        <p>Total fictif <strong>{dollars(total)}</strong></p>
        <Button disabled={!items.length} onClick={purchase}>Simuler le paiement et la distribution</Button>
        <Button variant="outline" onClick={()=>setTerminal(true)}>Tester le terminal Interac</Button>
        {last && <p role="status" className="rounded-lg bg-emerald-100 p-3 text-emerald-950">Achat simulé de {dollars(last.theoreticalCents)}. Montant débité 0,00 $.</p>}
        {shop.receipts.length>0 && <Button variant="outline" onClick={()=>setShowHistory(!showHistory)}>{showHistory?'Masquer les transactions':'Transactions fictives'} ({shop.receipts.length})</Button>}
        {showHistory && <ol className="space-y-2">{shop.receipts.map(r=><li className="rounded-lg border p-3" key={r.id}><strong>{dollars(r.theoreticalCents)}</strong> · {new Date(r.createdAt).toLocaleTimeString('fr-CA')}{r.terminalReference && <p>Interac · {r.terminalReference}</p>}{r.items.map(i=><p key={i.productId}>{i.qty} × {i.name}</p>)}</li>)}</ol>}
      </section>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </main>;
}
