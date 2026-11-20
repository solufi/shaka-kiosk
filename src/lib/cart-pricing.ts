import type { CartItem, Product } from './types';
export function productDepositCents(product: Pick<Product, 'depositCents'>) {
  const value = product.depositCents ?? 0;
  if (![0, 10, 25].includes(value) || !Number.isSafeInteger(value)) throw Error('Consigne invalide; actualisez les produits');
  return value;
}
export function productSellingCents(product: Pick<Product, 'price' | 'depositCents'>) {
  return Math.round(product.price * 100) + productDepositCents(product);
}
export function cartPricing(items: CartItem[], promo?: { kind?: string; discountType: 'percent' | 'fixed'; discountValue: number } | null, funded = false) {
  const goodsSubtotalCents = items.reduce((n, i) => n + Math.round(i.price * 100) * i.orderQuantity, 0);
  const depositCents = items.reduce((n, i) => n + productDepositCents(i) * i.orderQuantity, 0), subtotalCents = goodsSubtotalCents + depositCents;
  let discountCents = 0;
  if (funded) discountCents = subtotalCents;
  else if (promo?.kind === 'corporate') discountCents = items.reduce((n, i) => n + Math.round(productSellingCents(i) * promo.discountValue / 100) * i.orderQuantity, 0);
  else if (promo) discountCents = Math.min(goodsSubtotalCents, promo.discountType === 'percent' ? Math.round(goodsSubtotalCents * promo.discountValue / 100) : Math.round(promo.discountValue * 100));
  if (!Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > subtotalCents) throw Error('Rabais invalide; saisissez le code à nouveau');
  return { goodsSubtotalCents, depositCents, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}
