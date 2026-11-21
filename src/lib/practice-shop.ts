import { simulateCheckout, type SimulationReceipt } from './simulation';

export interface PracticeProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  depositCents: number;
}

export interface PracticeShop {
  products: PracticeProduct[];
  cart: Record<string, number>;
  receipts: SimulationReceipt[];
}

export function newPracticeShop(): PracticeShop {
  return {products:[
    {id:'test-interac-ok',name:'Essai Interac · approbation',price:1,quantity:5,depositCents:0},
    {id:'test-interac-refus',name:'Essai Interac · refus',price:1.05,quantity:5,depositCents:0},
    {id:'test-barre',name:'Barre protéinée',price:2.50,quantity:5,depositCents:0},
    {id:'test-boisson',name:'Boisson énergisante',price:3,quantity:4,depositCents:10},
    {id:'test-collation',name:'Échantillon gratuit',price:0,quantity:3,depositCents:0},
  ],cart:{},receipts:[]};
}

export function addPracticeProduct(shop: PracticeShop, name: string, price: string, stock: string, deposit: boolean): PracticeShop {
  const amount = price.trim().replace(',', '.');
  const quantity = Number(stock);
  if (!name.trim() || name.trim().length > 60 || !/^\d{1,4}([.]\d{1,2})?$/.test(amount) ||
      !/^\d+$/.test(stock) || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000) {
    throw Error('Vérifiez le nom, le prix et la quantité (0 à 1 000 unités).');
  }
  const product = {id:'test-'+crypto.randomUUID(),name:name.trim(),price:Number(amount),quantity,depositCents:deposit ? 10 : 0};
  return {...shop,products:[...shop.products,product]};
}

export function changePracticeCart(shop: PracticeShop, id: string, delta: 1 | -1): PracticeShop {
  const product = shop.products.find(p => p.id === id);
  if (!product) return shop;
  const quantity = (shop.cart[id] || 0) + delta;
  if (quantity < 0 || quantity > Math.min(product.quantity,100)) return shop;
  const cart = {...shop.cart};
  if (quantity) cart[id] = quantity;
  else delete cart[id];
  return {...shop,cart};
}

export function payPracticeCart(shop: PracticeShop): PracticeShop {
  const items = Object.entries(shop.cart).map(([productId,qty]) => ({productId,qty}));
  if (!items.length) return shop;
  const receipt = simulateCheckout(items,shop.products);
  return {
    products:shop.products.map(p => ({...p,quantity:p.quantity-(shop.cart[p.id]||0)})),
    cart:{}, receipts:[receipt,...shop.receipts],
  };
}
