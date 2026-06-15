'use client';
import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { CartItem, Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  MinusCircle,
  PlusCircle,
  Trash2,
  XCircle,
  Loader2,
  CheckCircle,
  DoorOpen,
  DoorClosed,
  Package,
} from 'lucide-react';
import { PromoInput, type AppliedPromo } from './promo-input';
import { ReceiptPrompt } from './receipt-prompt';
import { enqueueRedemption, flushRedemptions } from '@/lib/corporate-queue';

const MACHINE_ID =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MACHINE_ID) ||
  'default';

const PAYMENT_TIMEOUT_SECONDS = 120;
const REDEMPTION_FLUSH_INTERVAL_MS = 60000;
const PAYMENT_POLL_INTERVAL_MS = 1000;
const DOOR_POLL_INTERVAL_MS = 1000;
const SUCCESS_DISPLAY_MS = 8000;

function getVendApiBase(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:5001';
    }
    return `http://${hostname}:5001`;
  }
  return 'http://127.0.0.1:5001';
}

interface PlaceholderImage {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
}

interface CartPanelProps {
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onPurchase: () => void;
}

type PaymentState =
  | 'idle'
  | 'starting'
  | 'waiting'
  | 'approved'
  | 'dispensing'
  | 'success_normal'
  | 'success_fridge'
  | 'vend_failed'
  | 'denied'
  | 'timeout';

export function CartPanel({
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onPurchase,
}: CartPanelProps) {
  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.price * item.orderQuantity,
    0
  );

  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);

  // Compute discount in dollars (subtotal is in dollars)
  const discount = appliedPromo
    ? appliedPromo.discountType === 'percent'
      ? Math.min(subtotal, (subtotal * appliedPromo.discountValue) / 100)
      : Math.min(subtotal, appliedPromo.discountValue / 100) // discountValue is in cents
    : 0;

  const total = Math.max(0, subtotal - discount);
  const discountCents = Math.round(discount * 100);

  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [countdown, setCountdown] = useState(PAYMENT_TIMEOUT_SECONDS);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [doorClosed, setDoorClosed] = useState(false);
  const [dispensingItem, setDispensingItem] = useState<string>('');
  const [placeholderImages, setPlaceholderImages] = useState<PlaceholderImage[]>([]);
  const [receiptDismissed, setReceiptDismissed] = useState(false);
  const handledRef = useRef(false);
  const cartSnapshotRef = useRef<CartItem[]>([]);
  // True when the current vend is fully employer-subsidized (total = 0): no
  // Stripe Terminal payment is taken, we dispense directly.
  const freeVendRef = useRef(false);

  // Load placeholder images dynamically
  useEffect(() => {
    fetch('/api/placeholder-images')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPlaceholderImages(data);
      })
      .catch(() => {});
  }, []);

  // Retry any corporate redemptions that couldn't reach the Fleet Manager
  // (e.g. a network blip at vend time) — on mount and on an interval.
  useEffect(() => {
    void flushRedemptions();
    const interval = setInterval(() => {
      void flushRedemptions();
    }, REDEMPTION_FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const hasRelayItem = (items: CartItem[]) =>
    items.some((item) => item.useRelay);

  const resetPayment = useCallback(() => {
    setPaymentState('idle');
    setCountdown(PAYMENT_TIMEOUT_SECONDS);
    setPaymentError(null);
    setDoorClosed(false);
    setDispensingItem('');
    setReceiptDismissed(false);
    setAppliedPromo(null);
    handledRef.current = false;
    cartSnapshotRef.current = [];
    freeVendRef.current = false;
  }, []);

  const handlePaymentFailed = useCallback(() => {
    fetch(`${getVendApiBase()}/stripe/reset`, { method: 'POST' }).catch(
      () => {}
    );
    onClearCart();
    resetPayment();
  }, [onClearCart, resetPayment]);

  const handlePaymentSuccess = useCallback(async () => {
    if (handledRef.current) return;
    handledRef.current = true;

    cartSnapshotRef.current = [...cartItems];
    const isFridge = hasRelayItem(cartItems);
    const base = getVendApiBase();

    setPaymentState('dispensing');

    let allDropsOk = true;
    let vendError = '';

    for (const item of cartItems) {
      for (let q = 0; q < item.orderQuantity; q++) {
        setDispensingItem(item.name);

        try {
          const vendPayload: Record<string, any> = {
            machineId: 'default',
            useRelay: item.useRelay || false,
          };

          if (item.useRelay) {
            vendPayload.useRelay = true;
          } else if (item.location) {
            vendPayload.seq = item.location;
          } else {
            allDropsOk = false;
            vendError = `Aucun emplacement configuré pour ${item.name}`;
            continue;
          }

          const res = await fetch(`${base}/vend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vendPayload),
          });

          const result = await res.json();

          if (item.useRelay) {
            if (!result.ok) {
              allDropsOk = false;
              vendError = `Erreur distributeur: ${item.name}`;
            }
          } else {
            if (!result.ok || result.dropDetected !== true) {
              allDropsOk = false;
              if (result.dropDetected === false) {
                vendError = `Produit non détecté: ${item.name}. Aucun frais appliqué.`;
              } else {
                vendError = `Erreur distributeur: ${item.name}`;
              }
            }
          }
        } catch (err) {
          allDropsOk = false;
          vendError = `Erreur de communication: ${item.name}`;
        }

        if (!allDropsOk) break;
      }
      if (!allDropsOk) break;
    }

    // A free vend has no Stripe Terminal session to capture/cancel.
    if (!freeVendRef.current) {
      try {
        await fetch(`${base}/stripe/vend-result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: allDropsOk }),
        });
      } catch (err) {
        console.error('Vend result report failed:', err);
      }
    }

    if (allDropsOk) {
      // Record the corporate redemption(s) so the employer is invoiced for
      // its subsidized share. One CorporateUsage row per dispensed unit.
      // The customer has already paid the employee share via the discounted
      // Stripe total (or nothing, for a 100% free vend).
      //
      // Each redemption is queued with a stable idempotency key first, then
      // flushed — so a network blip can't lose (or duplicate) the billing.
      if (appliedPromo?.kind === 'corporate') {
        for (const item of cartSnapshotRef.current) {
          for (let q = 0; q < item.orderQuantity; q++) {
            enqueueRedemption({
              code: appliedPromo.code,
              machineId: MACHINE_ID,
              machineName: MACHINE_ID,
              productName: item.name,
              productPrice: item.price,
            });
          }
        }
        void flushRedemptions();
      }
      onPurchase();
      if (isFridge) {
        setPaymentState('success_fridge');
      } else {
        setPaymentState('success_normal');
      }
    } else {
      setPaymentError(vendError || 'Le produit n\'a pas été distribué. Aucun frais appliqué.');
      setPaymentState('vend_failed');
    }
  }, [onPurchase, cartItems, appliedPromo]);

  const cancelPayment = useCallback(async () => {
    try {
      const base = getVendApiBase();
      await fetch(`${base}/stripe/cancel`, { method: 'POST' });
    } catch (e) {
      console.error('Cancel failed:', e);
    }
    setPaymentError('Paiement annulé');
    setPaymentState('denied');
  }, []);

  const startPayment = async () => {
    setPaymentState('starting');
    setPaymentError(null);
    setCountdown(PAYMENT_TIMEOUT_SECONDS);
    handledRef.current = false;

    // Fully subsidized vend (total = 0, e.g. 100% corporate code): no card
    // payment is possible/needed. Go straight to dispensing.
    if (total <= 0) {
      freeVendRef.current = true;
      setPaymentState('approved');
      return;
    }
    freeVendRef.current = false;

    try {
      const items = cartItems.map((item) => ({
        name: item.name,
        price: Math.round(item.price * 100),
        quantity: item.orderQuantity,
      }));

      const base = getVendApiBase();
      const res = await fetch(`${base}/stripe/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          machineId: MACHINE_ID,
          discountCents: discountCents > 0 ? discountCents : undefined,
          promoCode: appliedPromo?.code,
          promoId: appliedPromo?.promoId,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setPaymentError(
          data.error || 'Erreur lors du démarrage du paiement'
        );
        setPaymentState('denied');
        return;
      }

      setPaymentState('waiting');
    } catch (error) {
      console.error('Start payment failed:', error);
      setPaymentError('Impossible de contacter le terminal');
      setPaymentState('denied');
    }
  };

  useEffect(() => {
    if (paymentState !== 'success_normal') return;
    // Don't auto-clear until customer has answered the receipt prompt
    if (!receiptDismissed) return;
    const timer = setTimeout(() => {
      onClearCart();
      resetPayment();
    }, SUCCESS_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [paymentState, onClearCart, resetPayment, receiptDismissed]);

  useEffect(() => {
    if (paymentState !== 'vend_failed') return;
    const timer = setTimeout(() => {
      onClearCart();
      resetPayment();
    }, 6000);
    return () => clearTimeout(timer);
  }, [paymentState, onClearCart, resetPayment]);

  useEffect(() => {
    if (paymentState !== 'success_fridge') return;
    // Wait for receipt prompt to be dismissed before allowing door-close to clear cart
    if (!receiptDismissed) return;

    const pollDoor = async () => {
      try {
        const res = await fetch(`${getVendApiBase()}/door-status`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.isClosed) {
            setDoorClosed(true);
            setTimeout(() => {
              onClearCart();
              resetPayment();
            }, 2000);
          } else {
            setDoorClosed(false);
          }
        }
      } catch {
        // ignore
      }
    };

    pollDoor();
    const interval = setInterval(pollDoor, DOOR_POLL_INTERVAL_MS);

    const safetyTimeout = setTimeout(() => {
      onClearCart();
      resetPayment();
    }, 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimeout);
    };
  }, [paymentState, onClearCart, resetPayment, receiptDismissed]);

  useEffect(() => {
    if (paymentState !== 'waiting') return;

    const countdownInterval = setInterval(() => {
      setCountdown((prev: number) => {
        if (prev <= 1) {
          setPaymentState('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const pollInterval = setInterval(async () => {
      try {
        const base = getVendApiBase();
        const res = await fetch(`${base}/stripe/status`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          const session = data.session;
          const state = data.state;

          if (session) {
            const result = session.payment_result;
            if (result === 'authorized' || result === 'captured') {
              setPaymentState('approved');
              return;
            } else if (result === 'denied' || result === 'cancelled') {
              setPaymentError(session.error || 'Paiement refusé');
              setPaymentState('denied');
              return;
            }
          }

          if (
            state === 'payment_authorized' ||
            state === 'session_complete'
          ) {
            const result = session?.payment_result;
            if (result === 'authorized' || result === 'captured') {
              setPaymentState('approved');
              return;
            }
          } else if (state === 'error') {
            setPaymentError(session?.error || 'Erreur du terminal');
            setPaymentState('denied');
            return;
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, PAYMENT_POLL_INTERVAL_MS);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(pollInterval);
    };
  }, [paymentState]);

  useEffect(() => {
    if (paymentState === 'approved') {
      handlePaymentSuccess();
    } else if (paymentState === 'denied' || paymentState === 'timeout') {
      const timer = setTimeout(() => {
        handlePaymentFailed();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [paymentState, handlePaymentSuccess, handlePaymentFailed]);

  return (
    <>
      {paymentState === 'starting' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-6 text-white">
            <Loader2 className="h-24 w-24 animate-spin" />
            <p className="text-3xl font-bold">
              Initialisation du paiement...
            </p>
          </div>
        </div>
      )}

      {paymentState === 'waiting' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-6 text-white">
            <ArrowRight className="h-32 w-32 animate-pulse" />
            <p className="text-3xl font-bold">Présentez votre carte</p>
            <p className="text-xl">au terminal de paiement</p>
            <div className="mt-4 flex items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-4xl font-mono font-bold">
                {countdown}s
              </span>
            </div>
            <p className="text-lg text-white/70">
              Total: ${total.toFixed(2)}
            </p>
            <button
              onClick={cancelPayment}
              className="mt-6 rounded-2xl border-2 border-red-500 bg-red-500/20 px-10 py-4 text-xl font-bold text-red-400 transition hover:bg-red-500/40 active:scale-95"
            >
              Annuler
            </button>
          </div>
          <div className="absolute top-8 right-8">
            <ArrowRight className="h-24 w-24 text-white animate-bounce" />
          </div>
        </div>
      )}

      {paymentState === 'dispensing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-6 text-white">
            <Package className="h-24 w-24 animate-pulse text-blue-400" />
            <p className="text-3xl font-bold">Distribution en cours...</p>
            {dispensingItem && (
              <p className="text-xl text-white/80">{dispensingItem}</p>
            )}
            <Loader2 className="h-10 w-10 animate-spin text-blue-400 mt-4" />
          </div>
        </div>
      )}

      {paymentState === 'success_normal' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
          <div className="flex flex-col items-center gap-6 text-white">
            <CheckCircle className="h-24 w-24 text-green-500" />
            <p className="text-4xl font-bold text-green-400">
              Transaction réussie !
            </p>
            <p className="text-xl text-white/80">Merci pour votre achat</p>
          </div>
          <div className="mt-12 flex flex-col items-center gap-4 text-white">
            <p className="text-2xl font-semibold">
              Récupérez votre achat au bas de la machine
            </p>
            <ArrowDown className="h-32 w-32 text-green-400 animate-bounce" />
          </div>
        </div>
      )}

      {paymentState === 'success_fridge' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
          <div className="flex flex-col items-center gap-6 text-white">
            <CheckCircle className="h-24 w-24 text-green-500" />
            <p className="text-4xl font-bold text-green-400">
              Transaction réussie !
            </p>
            <p className="text-xl text-white/80">Merci pour votre achat</p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-4 text-white">
            <ArrowUp className="h-32 w-32 text-blue-400 animate-bounce" />
            <p className="text-2xl font-semibold text-center">
              Récupérez votre achat dans la section du haut
            </p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-3">
            {doorClosed ? (
              <div className="flex items-center gap-3 rounded-2xl bg-green-900/60 px-8 py-4 border border-green-500">
                <DoorClosed className="h-10 w-10 text-green-400" />
                <p className="text-2xl font-bold text-green-400">
                  Porte fermée
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl bg-orange-900/60 px-8 py-4 border border-orange-500 animate-pulse">
                <DoorOpen className="h-10 w-10 text-orange-400" />
                <p className="text-2xl font-bold text-orange-400">
                  Veuillez fermer la porte
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {(paymentState === 'success_normal' || paymentState === 'success_fridge') &&
        !receiptDismissed && (
          <ReceiptPrompt
            vendApiBase={getVendApiBase()}
            onDone={() => setReceiptDismissed(true)}
          />
        )}

      {paymentState === 'vend_failed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="flex flex-col items-center gap-6 text-white">
            <XCircle className="h-24 w-24 text-orange-500" />
            <p className="text-3xl font-bold text-orange-400">
              Distribution échouée
            </p>
            {paymentError && (
              <p className="text-xl text-center text-orange-300 max-w-lg">
                {paymentError}
              </p>
            )}
            <div className="mt-4 rounded-2xl bg-green-900/40 px-8 py-4 border border-green-600">
              <p className="text-xl font-semibold text-green-400 text-center">
                Votre carte n&​apos;a pas été chargée
              </p>
            </div>
            <p className="text-lg text-white/60 mt-2">
              Retour à l&​apos;accueil...
            </p>
          </div>
        </div>
      )}

      {(paymentState === 'denied' || paymentState === 'timeout') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-6 text-white">
            <XCircle className="h-24 w-24 text-red-500" />
            <p className="text-3xl font-bold text-red-500">
              {paymentState === 'timeout'
                ? 'Délai expiré'
                : 'Transaction échouée'}
            </p>
            {paymentError && (
              <p className="text-lg text-red-300">{paymentError}</p>
            )}
            <p className="text-xl text-white/70">
              Retour à l&​apos;accueil...
            </p>
          </div>
        </div>
      )}

      <Card className="sticky top-6 flex h-[calc(100vh-3.5rem-3rem)] max-h-[calc(100vh-3.5rem-3rem)] flex-col">
        <CardHeader>
          <CardTitle>Votre Commande</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {cartItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <p className="text-lg font-medium">Votre panier est vide</p>
              <p>Sélectionnez des produits pour commencer.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {cartItems.map((item) => {
                const placeholder = placeholderImages.find(
                  (p) => p.id === item.imageId
                );
                return (
                  <div key={item.id} className="flex items-center gap-4">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md">
                      {placeholder && (
                        <Image
                          src={placeholder.imageUrl}
                          alt={item.name}
                          data-ai-hint={placeholder.imageHint}
                          fill
                          className="object-contain"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        ${item.price.toFixed(2)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            onUpdateQuantity(
                              item.id,
                              item.orderQuantity - 1
                            )
                          }
                          disabled={item.orderQuantity <= 1}
                        >
                          <MinusCircle className="h-4 w-4" />
                        </Button>
                        <span className="w-6 text-center font-bold">
                          {item.orderQuantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            onUpdateQuantity(
                              item.id,
                              item.orderQuantity + 1
                            )
                          }
                          disabled={item.orderQuantity >= item.quantity}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        {cartItems.length > 0 && (
          <>
            <Separator />
            <CardFooter className="flex flex-col gap-3 p-4">
              <PromoInput
                machineId={MACHINE_ID}
                applied={appliedPromo}
                onApply={setAppliedPromo}
                onRemove={() => setAppliedPromo(null)}
                disabled={paymentState !== 'idle'}
              />
              {appliedPromo && (
                <div className="flex w-full flex-col gap-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sous-total</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>Rabais ({appliedPromo.code})</span>
                    <span>−${discount.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div className="flex w-full justify-between font-bold text-xl">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={startPayment}
                disabled={paymentState !== 'idle'}
              >
                Passer au paiement
              </Button>
              <Button variant="outline" onClick={onClearCart}>
                Vider le panier
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </>
  );
}
