'use client';
import { useEffect,useState } from 'react';
import { CheckCircle,Loader2 } from 'lucide-react';
import type { CartItem } from '@/lib/types';
import type { SimulationReceipt } from '@/lib/simulation';
import { Button } from './ui/button';
import { ReceiptPrompt } from './receipt-prompt';
export function SimulatedCheckout({items,onDone}:{items:CartItem[];onDone:()=>void}) {
  const [receipt,setReceipt]=useState<SimulationReceipt|null>(null),[error,setError]=useState(''),[email,setEmail]=useState(false),[page,setPage]=useState(0);
  useEffect(()=>{
    let mounted=true;
    void (async()=>{try{
      const response=await fetch('/api/admin/simulate-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'purchase',items:items.map(item=>({productId:item.id,qty:item.orderQuantity}))})});
      const data=await response.json();if(!response.ok || !data.ok || data.simulated!==true)throw Error(data.error || 'Simulation indisponible');if(mounted)setReceipt(data.receipt);
    }catch(error){if(mounted)setError((error as Error).message);}})();
    return()=>{mounted=false;};
  },[items]);
  if(email&&receipt)return <ReceiptPrompt vendApiBase="/api/machine" sessionId={receipt.id} simulation onDone={()=>setEmail(false)}/>;
  return <div role="dialog" aria-label="Simulation de commande" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"><div className="flex w-full max-w-2xl flex-col gap-5 rounded-3xl bg-white p-8 text-slate-950 shadow-xl">
    <div className="flex items-center gap-3">{receipt?<CheckCircle className="h-10 w-10 text-green-600"/>:<Loader2 className="h-10 w-10 animate-spin"/>}<h2 className="text-2xl font-bold">{error?'Test non effectué':receipt?'Simulation réussie':'Préparation du test…'}</h2></div>
    <p className="rounded-xl bg-amber-50 p-4 text-amber-950">Aucun paiement effectué, aucune distribution réelle et aucun mouvement de stock.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {receipt&&<><div className="divide-y">{receipt.items.slice(page*5,page*5+5).map(item=><div key={item.productId} className="flex justify-between gap-4 py-2"><span>{item.qty} × {item.name}</span><strong>{(item.price*item.qty/100).toFixed(2)} $</strong></div>)}</div>{receipt.items.length>5&&<div className="flex items-center justify-between"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Précédent</Button><span>{page+1} / {Math.ceil(receipt.items.length/5)}</span><Button variant="outline" disabled={(page+1)*5>=receipt.items.length} onClick={()=>setPage(p=>p+1)}>Suivant</Button></div>}<p className="text-lg">Montant théorique : <strong>{(receipt.theoreticalCents/100).toFixed(2)} $</strong> · Montant débité : <strong>0,00 $</strong></p><Button variant="outline" onClick={()=>setEmail(true)}>Recevoir le reçu de test par courriel</Button></>}
    <Button onClick={onDone}>Terminer le test</Button>
  </div></div>;
}
