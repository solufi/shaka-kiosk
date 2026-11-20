import { NextRequest,NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { adminAuthorized } from '@/lib/local-admin';
import { simulateCheckout,type SimulationReceipt } from '@/lib/simulation';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const receipts=new Map<string,{receipt:SimulationReceipt;expires:number;emailAttempted:boolean}>();
export async function POST(request:NextRequest) {
  if (!adminAuthorized(request)) return NextResponse.json({ok:false,error:'Reconnectez-vous au menu Admin pour faire un test.'},{status:401});
  try {
    const text=await request.text();
    if (Buffer.byteLength(text)>16000) return NextResponse.json({ok:false},{status:413});
    const body=JSON.parse(text);
    for (const [id,value] of receipts) if (value.expires<Date.now()) receipts.delete(id);
    if (body.action==='email') {
      const test=receipts.get(body.sessionId);
      if (!test) return NextResponse.json({ok:false,error:'Ce test a expiré. Relancez une simulation.'},{status:400});
      if (typeof body.email!=='string' || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return NextResponse.json({ok:false,error:'Adresse courriel invalide'},{status:400});
      if (test.emailAttempted) return NextResponse.json({ok:false,error:'Un envoi a déjà été tenté. Vérifiez votre boîte de réception.'},{status:409});
      const token=process.env.AGENT_TOKEN,machine=process.env.MACHINE_ID || process.env.NEXT_PUBLIC_MACHINE_ID;
      if (!token || !machine) return NextResponse.json({ok:false,error:'Identité machine non configurée'},{status:503});
      test.emailAttempted=true;
      const response=await fetch(new URL('/api/receipt',process.env.FLEET_URL || process.env.NEXT_PUBLIC_FLEET_URL || 'https://fleet.shakadistribution.ca'),{
        method:'POST',headers:{'Content-Type':'application/json','x-agent-token':token,'x-machine-id':machine},signal:AbortSignal.timeout(20000),redirect:'error',
        body:JSON.stringify({email:body.email.trim(),receipt:{machineName:'TEST — AUCUNE VENTE — '+machine,sessionId:test.receipt.id,transactionId:test.receipt.id,date:test.receipt.createdAt,paymentMethod:'free',
          items:test.receipt.items.map(item=>({name:'[SIMULATION] '+item.name,qty:item.qty,price:item.price})),totalCents:0,discountCents:test.receipt.theoreticalCents}}),
      });
      const result=await response.json();
      if (!response.ok || result.ok!==true) return NextResponse.json({ok:false,error:result.error || 'Envoi du reçu de test à vérifier'},{status:502});
      return NextResponse.json({ok:true,simulated:true});
    }
    if (body.action!==undefined && body.action!=='purchase') return NextResponse.json({ok:false},{status:400});
    const catalog=JSON.parse(await fs.readFile(path.join(process.env.HOME || '/tmp','.shaka-cache/products.json'),'utf8'));
    if (!Array.isArray(catalog)) throw new Error('Catalogue local indisponible');
    const receipt=simulateCheckout(body.items,catalog);
    if (receipts.size>=100) receipts.delete(receipts.keys().next().value!);
    receipts.set(receipt.id,{receipt,expires:Date.now()+15*60*1000,emailAttempted:false});
    return NextResponse.json({ok:true,simulated:true,paymentTaken:false,inventoryChanged:false,receipt},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Test indisponible'},{status:400});
  }
}
