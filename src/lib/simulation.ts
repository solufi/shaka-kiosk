import {productSellingCents} from './cart-pricing';
export interface SimulationReceipt { id:string; createdAt:string; items:{productId:string;name:string;qty:number;price:number}[]; theoreticalCents:number; }
export function simulateCheckout(input:unknown,catalog:any[]):SimulationReceipt {
  if (!Array.isArray(input) || !input.length || input.length>100) throw new Error('Panier de test invalide');
  const seen=new Set<string>();
  const items=input.map(value=>{
    if (!value || typeof value.productId!=='string' || seen.has(value.productId) || !Number.isInteger(value.qty) || value.qty<1 || value.qty>100) throw new Error('Quantité de test invalide');
    seen.add(value.productId);
    const product=catalog.find(p=>p.id===value.productId);
    if (!product || product.stockUnavailable || !Number.isFinite(product.price) || product.price<0 || value.qty>product.quantity) throw new Error('Produit indisponible pour ce test');
    return {productId:product.id,name:String(product.name),qty:value.qty,price:productSellingCents(product)};
  });
  return {id:'TEST-'+crypto.randomUUID(),createdAt:new Date().toISOString(),items,theoreticalCents:items.reduce((sum,item)=>sum+item.qty*item.price,0)};
}
