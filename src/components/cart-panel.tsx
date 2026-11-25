'use client';
import { settlePayment } from '@/lib/payment-settlement';
import {cartPricing,productSellingCents,productDepositCents} from '@/lib/cart-pricing';
import { ProductPhoto } from './product-photo';
import { useTestMode } from './test-mode';
import { SimulatedCheckout } from './simulated-checkout';
import {EmployeeCartPanel} from './employee-cart-panel';
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
import {VirtualKeyboard} from './virtual-keyboard';
import { flushRedemptions } from '@/lib/corporate-queue';

const MACHINE_ID =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MACHINE_ID) ||
  'default';

const PAYMENT_TIMEOUT_SECONDS = 120;
const REDEMPTION_FLUSH_INTERVAL_MS = 60000;
const PAYMENT_POLL_INTERVAL_MS = 1000;
const DOOR_POLL_INTERVAL_MS = 1000;
const SUCCESS_DISPLAY_MS = 8000;

function getVendApiBase(): string {
  return '/api/machine';
}

interface PlaceholderImage {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
}

export interface CartPanelProps {
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onPurchase: () => void;
}

type PaymentState =
  | 'idle'
  | 'starting'
  | 'checking_start'
  | 'waiting'
  | 'approved'
  | 'dispensing'
  | 'success_normal'
  | 'success_fridge'
  | 'vend_failed'
  | 'denied'
  | 'timeout';

type FundingConfig={enabled:boolean;available?:boolean;identification?:'none'|'employee-number';companyName?:string};
function RetailCartPanel({
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onPurchase,funding,onBusyChange,
}: CartPanelProps&{funding?:FundingConfig;onBusyChange?:(busy:boolean)=>void}) {
  const testMode = useTestMode();
  const funded=!testMode.active&&funding?.enabled===true;
  const [employeeNumber,setEmployeeNumber]=useState(''),[numberOpen,setNumberOpen]=useState(false);
  const closeNumberPrompt=()=>{setNumberOpen(false);setEmployeeNumber('');};
  const needsNumber=funded&&funding?.identification==='employee-number';
  const [testCart,setTestCart] = useState<CartItem[] | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const amounts=cartPricing(cartItems,testMode.active?null:appliedPromo,funded);
  const subtotal=amounts.subtotalCents/100,discount=amounts.discountCents/100,total=amounts.totalCents/100,discountCents=amounts.discountCents;

  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  useEffect(()=>{onBusyChange?.(paymentState!=='idle');return()=>onBusyChange?.(false);},[paymentState,onBusyChange]);
  useEffect(()=>{if(!cartItems.length||!needsNumber){setEmployeeNumber('');setNumberOpen(false);}},[cartItems.length,needsNumber]);
  const [countdown, setCountdown] = useState(PAYMENT_TIMEOUT_SECONDS);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [doorClosed, setDoorClosed] = useState(false);
  const [dispensingItem, setDispensingItem] = useState<string>('');
  const [placeholderImages, setPlaceholderImages] = useState<PlaceholderImage[]>([]);
  const [receiptDismissed, setReceiptDismissed] = useState(false);
  const handledRef = useRef(false);
  const startingRequest = useRef('');
  const startingPayment = useRef(false);
  const purchaseIdRef = useRef('');
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
    void flushRedemptions().catch(() => console.error('La reprise des anciennes consommations reste à vérifier'));
    const interval = setInterval(() => {
      void flushRedemptions().catch(() => console.error('La reprise des anciennes consommations reste à vérifier'));
    }, REDEMPTION_FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const hasRelayItem = (items: CartItem[]) =>
    items.some((item) => item.useRelay);

  const resetPayment = useCallback(() => {
    startingRequest.current = '';
    startingPayment.current = false;
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

  const handlePaymentFailed = useCallback(async () => {
    if (freeVendRef.current) {resetPayment();return;}
    try {
      const response = await fetch(`${getVendApiBase()}/stripe/reset`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:purchaseIdRef.current})});
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('Règlement à vérifier');
    } catch {
      setPaymentError('Paiement à vérifier avant un nouvel achat. Veuillez contacter le service client.');
      setPaymentState('vend_failed');
      return;
    }
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

    const delivered: typeof cartItems = [];
    for (const item of cartItems.filter(item => !item.useRelay)) {
      let deliveredQuantity = 0;
      for (let q = 0; q < item.orderQuantity; q++) {
        setDispensingItem(item.name);

        try {
          const vendPayload: Record<string, any> = {
            machineId: MACHINE_ID,
            productId: item.id,
            commandId: `${purchaseIdRef.current}:${item.id}:${q}`,
            sessionId: purchaseIdRef.current,
            free: freeVendRef.current,
            useRelay: item.useRelay || false,
          };

          if (item.useRelay) {
            vendPayload.useRelay = true;
          } else if (item.location) {
            vendPayload.location = item.location;
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
                vendError = freeVendRef.current?`Produit non détecté : ${item.name}. Aucun paiement effectué.`:`Produit non détecté : ${item.name}. Le paiement sera vérifié.`;
              } else {
                vendError = `Erreur distributeur: ${item.name}`;
              }
            }
          }
          if (result.ok && result.dropDetected === true) deliveredQuantity++;
        } catch (err) {
          allDropsOk = false;
          vendError = `Erreur de communication: ${item.name}`;
        }

        if (!allDropsOk) break;
      }
      if (deliveredQuantity) delivered.push({ ...item, orderQuantity: deliveredQuantity });
      if (!allDropsOk) break;
    }

    const fridgeItems = cartItems.filter(item => item.useRelay);
    if (allDropsOk && fridgeItems.length) {
      setDispensingItem('Ouvrez le frigo, prenez les articles sélectionnés puis refermez la porte.');
      try {
        const response = await fetch(`${base}/fridge/access`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: purchaseIdRef.current, paid: !freeVendRef.current,
            items: fridgeItems.map(item => ({ productId: item.id, qty: item.orderQuantity })) }),
        });
        const started = await response.json();
        if (!response.ok || !started.ok) throw new Error(started.error || 'Ouverture indisponible');
        const deadline = Date.now() + 240000;
        let complete = false;
        while (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const res = await fetch(`${base}/fridge/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: purchaseIdRef.current }) });
          const status = await res.json();
          if (status.pending) continue;
          if (!res.ok || !status.ok || !status.accessCompleted) throw new Error(status.error || 'Fermeture à vérifier');
          complete = true; break;
        }
        if (!complete) throw new Error('Fermeture non confirmée');
        delivered.push(...fridgeItems);
        setDoorClosed(true);
      } catch (err) {
        allDropsOk = false;
        vendError = 'Accès au frigo à vérifier. Veuillez contacter le service client.';
      }
    }

    // Confirmed delivery and employer usage are journaled by the agent.
    // Browser storage or a lost vend response cannot gate bank settlement.

    // A free vend has no Stripe Terminal session to capture/cancel.
    if (!freeVendRef.current) {
      try {
        await settlePayment(base, purchaseIdRef.current, setDispensingItem);
      } catch (err) {
        setPaymentError('Votre paiement doit être vérifié. Veuillez contacter le service client.');
        setPaymentState('vend_failed');
        return;
      }
    }

    if (allDropsOk) {
      onPurchase();
      setPaymentState('success_normal');
    } else {
      setPaymentError(vendError || (freeVendRef.current?'Le produit gratuit n’a pas été distribué. Aucun paiement effectué.':'Le produit n’a pas été distribué. Le paiement sera vérifié.'));
      setPaymentState('vend_failed');
    }
  }, [onPurchase, cartItems, appliedPromo, subtotal]);

  const cancelPayment = useCallback(async () => {
    try {
      const base = getVendApiBase();
      const response = await fetch(`${base}/stripe/cancel`, { method: 'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:purchaseIdRef.current}) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Annulation non confirmée');
    } catch (e) {
      setPaymentError('Annulation non confirmée. Veuillez contacter le service client.');
      setPaymentState('vend_failed');
      return;
    }
    setPaymentError('Paiement annulé');
    setPaymentState('denied');
  }, []);

  const startPayment = async (confirmedNumber?:string) => {
    if (!cartItems.length || paymentState!=='idle' || (confirmedNumber && !needsNumber)) return;
    if (testMode.active) {setTestCart([...cartItems]);return;}
    if(funded&&funding?.available===false){setPaymentError('Prise en charge entreprise indisponible');return;}
    if(needsNumber&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(confirmedNumber||'')){setNumberOpen(true);return;}
    if (startingPayment.current) return;
    startingPayment.current = true;
    freeVendRef.current = total <= 0;
    setPaymentState('starting');
    setPaymentError(null);
    setCountdown(PAYMENT_TIMEOUT_SECONDS);
    handledRef.current = false;
    purchaseIdRef.current = crypto.randomUUID();

    if (appliedPromo && !funded) {
      try {
        const response = await fetch(`${getVendApiBase()}/corporate/validate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: appliedPromo.code, redeem: false, quantity: cartItems.reduce((sum, item) => sum + item.orderQuantity, 0) }),
        });
        const result = await response.json();
        if (!response.ok || !result.valid || result.discountValue !== appliedPromo.discountValue) throw new Error(result.error || 'Le code a changé; veuillez le saisir à nouveau.');
      } catch (err) {
        setPaymentError(err instanceof Error ? err.message : 'Code indisponible');
        setPaymentState('denied');
        return;
      }
    }

    // Fully subsidized vend (total = 0, e.g. 100% corporate code): no card
    // payment is possible/needed. Go straight to dispensing.
    if (total <= 0) {
      try {
        const response = await fetch(`${getVendApiBase()}/purchase/free`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          items:cartItems.map(item=>({productId:item.id,price:productSellingCents(item),qty:item.orderQuantity})),promoCode:funded?undefined:appliedPromo?.code,...(funded?{corporateFunded:true,employeeNumber:needsNumber?confirmedNumber:undefined}:{})
        })});
        const grant=await response.json();
        if(!response.ok || !grant.ok)throw new Error(grant.error || 'Autorisation refusée');
        purchaseIdRef.current=grant.sessionId;
      } catch(error) {
        const message=error instanceof Error?error.message:'Autorisation indisponible';
        setPaymentError(/commissioning|fleet.*approval/i.test(message)?'Cette machine est encore en configuration. Utilisez les essais sans matériel dans le menu Admin.':message);setPaymentState('denied');return;
      }
      freeVendRef.current = true;
      setPaymentState('approved');
      return;
    }
    freeVendRef.current = false;

    const requestId = crypto.randomUUID();
    startingRequest.current = requestId;
    const slowStart = setTimeout(() => {
      if (startingRequest.current === requestId) setPaymentState('checking_start');
    }, 4000);
    try {
      const items = cartItems.map((item) => ({
        productId: item.id,
        code: /^\d+$/.test(item.location) ? Number(item.location) : 0,
        location: item.location, useRelay: !!item.useRelay,
        name: item.name,
        price: productSellingCents(item),
        qty: item.orderQuantity,
        quantity: item.orderQuantity, // older agents/kiosks accept either spelling
      }));

      const base = getVendApiBase();
      const res = await fetch(`${base}/stripe/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          checkoutRequestId: requestId,
          machineId: MACHINE_ID,
          discountCents: discountCents > 0 ? discountCents : undefined,
          promoCode: appliedPromo?.code,
          promoId: appliedPromo?.promoId,
        }),
      });

      const data = await res.json();
      if (startingRequest.current !== requestId) return;
      if (!res.ok || !data.ok || !data.session?.session_id) {
        if (data.startDeclined || (res.status >= 400 && res.status < 500)) {
          startingRequest.current = '';
          setPaymentError(data.error || 'Paiement refusé');
          setPaymentState('denied');
        } else {
          setPaymentState('checking_start');
        }
        return;
      }
      startingRequest.current = '';
      purchaseIdRef.current = data.session.session_id;
      setPaymentState('waiting');
    } catch {
      if (startingRequest.current === requestId) setPaymentState('checking_start');
    } finally {
      clearTimeout(slowStart);
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
    if (paymentState !== 'checking_start') return;
    const requestId = startingRequest.current;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function verify() {
      try {
        const response = await fetch(`${getVendApiBase()}/stripe/status`, {
          cache: 'no-store', signal: AbortSignal.timeout(6000),
        });
        const status = await response.json();
        if (!active || startingRequest.current !== requestId) return;
        const session = status.session;
        if (response.ok && session?.checkout_request_id === requestId && session.session_id &&
            !session.recovery_required && !session.settlement_complete && session.settlement_target == null &&
            ['waiting_payment', 'authorizing', 'payment_authorized'].includes(status.state)) {
          startingRequest.current = '';
          purchaseIdRef.current = session.session_id;
          setPaymentState('waiting');
          return;
        }
        if (response.ok && session?.checkout_request_id === requestId && session.session_id &&
            !session.recovery_required && ['denied', 'cancelled', 'timeout'].includes(session.payment_result)) {
          startingRequest.current = '';
          purchaseIdRef.current = session.session_id;
          setPaymentError('Le terminal a confirmé la fin du paiement.');
          setPaymentState('denied');
          return;
        }
      } catch {
        // A missing response cannot authorize a second payment.
      }
      if (active) timer = setTimeout(verify, 2500);
    }
    void verify();
    return () => { active = false; clearTimeout(timer); };
  }, [paymentState]);

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

    let active = true;
    let polling = false;
    const pollInterval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch(`${getVendApiBase()}/stripe/status`, {
          cache: 'no-store', signal: AbortSignal.timeout(6000),
        });
        const data = await response.json();
        const session = data.session;
        if (!active || !response.ok || !session || session.session_id !== purchaseIdRef.current) return;
        if (session.recovery_required || session.settlement_complete || session.settlement_target != null) {
          setPaymentError('Paiement à vérifier. Veuillez contacter le service client.');
          setPaymentState('vend_failed');
        } else if (['authorized', 'captured'].includes(session.payment_result)) {
          setPaymentState('approved');
        } else if (['denied', 'cancelled', 'timeout'].includes(session.payment_result) || data.state === 'error') {
          setPaymentError(session.error || 'Paiement refusé');
          setPaymentState('denied');
        }
      } catch {
        // Keep waiting for the status of this purchase.
      } finally {
        polling = false;
      }
    }, PAYMENT_POLL_INTERVAL_MS);

    return () => {
      active = false;
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
      {testCart && <SimulatedCheckout items={testCart} onDone={()=>{setTestCart(null);onClearCart();resetPayment();}}/>}
      {(paymentState === 'starting' || paymentState === 'checking_start') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-6 text-white">
            <Loader2 className="h-24 w-24 animate-spin" />
            <p className="text-3xl font-bold">
              {paymentState === 'checking_start' ? 'Vérification auprès du terminal…' : freeVendRef.current ? 'Vérification de la commande gratuite…' : 'Initialisation du paiement…'}
            </p>
            {paymentState === 'checking_start' && <p role="status" className="max-w-lg text-center text-xl">
              Suivez les instructions du lecteur. Si l’attente se prolonge, contactez le service client avant de recommencer.
            </p>}
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
              {hasRelayItem(cartSnapshotRef.current) ? 'Merci d’avoir refermé le frigo.' : 'Récupérez votre achat au bas de la machine'}
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
            sessionId={purchaseIdRef.current}
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
                {freeVendRef.current?'Aucun paiement n’a été effectué.':'Le statut de votre paiement sera vérifié'}
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
              {freeVendRef.current && <span className="block">Aucun paiement n’a été effectué.</span>}
              Retour à l&​apos;accueil...
            </p>
          </div>
        </div>
      )}

      {needsNumber&&numberOpen&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Numéro d’employé" onKeyDown={event=>{
        if(event.key==='Escape')closeNumberPrompt();
        if(event.key==='Tab'){const fields=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input,button:not([disabled])'));const first=fields[0],last=fields.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
      }}><div className="w-full max-w-4xl space-y-4 rounded-2xl bg-slate-900 p-5 text-white"><h2 className="text-2xl font-semibold">Votre numéro d’employé</h2><p className="text-sm text-slate-300">Il servira uniquement à attribuer les articles à votre numéro pour le suivi de l’entreprise.</p><input autoFocus aria-label="Numéro d’employé" value={employeeNumber} maxLength={40} onChange={e=>setEmployeeNumber(e.target.value.toUpperCase())} className="w-full rounded-xl bg-slate-950 p-3 text-2xl"/><div className="[&_button]:min-w-0 [&_button]:h-11 [&_button]:text-lg"><VirtualKeyboard value={employeeNumber} onChange={value=>setEmployeeNumber(value.slice(0,40).toUpperCase())} uppercase/></div><div className="flex gap-3"><button type="button" onClick={closeNumberPrompt} className="flex-1 rounded-xl border border-white/20 p-3">Annuler</button><button type="button" disabled={!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(employeeNumber.trim())} onClick={()=>{closeNumberPrompt();return startPayment(employeeNumber.trim().toUpperCase());}} className="flex-1 rounded-xl bg-blue-600 p-3 disabled:opacity-50">Confirmer et prendre les articles</button></div></div></div>}
      <Card className="sticky top-6 flex h-[calc(100vh-3.5rem-3rem)] max-h-[calc(100vh-3.5rem-3rem)] flex-col">
        <CardHeader>
          <CardTitle>Votre Commande</CardTitle>
          {funded&&<p className="text-sm text-muted-foreground">Gratuit pour vous · pris en charge à 100 % par {funding?.companyName||'votre entreprise'}</p>}
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
                      <ProductPhoto imageId={item.imageId} name={item.name} className="object-contain" sizes="64px" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        ${item.price.toFixed(2)}{productDepositCents(item)>0&&<span> + ${(productDepositCents(item)/100).toFixed(2)} de consigne</span>}
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
                          disabled={paymentState !== 'idle' || item.orderQuantity <= 1}
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
                          disabled={paymentState !== 'idle' || item.orderQuantity >= item.quantity}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={paymentState !== 'idle'} onClick={() => onRemoveItem(item.id)}
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
              {!funded&&<PromoInput
                machineId={MACHINE_ID}
                applied={appliedPromo}
                onApply={setAppliedPromo}
                onRemove={() => setAppliedPromo(null)}
                disabled={paymentState !== 'idle' || testMode.active}
              />}
              {funded&&<div className="w-full space-y-2 text-sm"><p>Valeur portée à la facture de l’entreprise : ${subtotal.toFixed(2)}</p>{funding?.available===false&&<p role="alert" className="text-amber-600">Prise en charge suspendue. Veuillez contacter votre responsable.</p>}{needsNumber?<p>Votre numéro d’employé sera demandé à la confirmation.</p>:<p>Prise suivie sans identification individuelle.</p>}</div>}
              {amounts.depositCents>0&&<div className="w-full space-y-1 text-sm"><div className="flex justify-between"><span>Articles</span><span>${(amounts.goodsSubtotalCents/100).toFixed(2)}</span></div><div className="flex justify-between"><span>Consigne (non taxable)</span><span>${(amounts.depositCents/100).toFixed(2)}</span></div></div>}
              {appliedPromo && !funded && (
                <div className="flex w-full flex-col gap-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sous-total</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>{appliedPromo.kind==='corporate'?'Prise en charge':'Rabais'} ({appliedPromo.code})</span>
                    <span>−${discount.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div className="flex w-full justify-between font-bold text-xl">
                <span>{funded?'À payer par vous':'Total'}</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={()=>startPayment()}
                disabled={paymentState !== 'idle'||(funded&&funding?.available===false)}
              >
                {testMode.active?'Tester le panier':funded?'Prendre les articles · pris en charge':total<=0?'Valider la commande gratuite':'Passer au paiement'}
              </Button>
              <Button variant="outline" onClick={onClearCart} disabled={paymentState !== 'idle'}>
                Vider le panier
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </>
  );
}

export function CartPanel(props:CartPanelProps){
 const testMode=useTestMode(),busy=useRef(false);
 const onBusyChange=useCallback((value:boolean)=>{busy.current=value;},[]);
 const [config,setConfig]=useState<any>(null),[error,setError]=useState('');
 const hasItems=props.cartItems.length>0;
 const load=useCallback(async()=>{try{const response=await fetch('/api/machine/employee/config',{cache:'no-store'}),d=await response.json();if(!response.ok||!d.ok)throw Error(d.error||'Configuration indisponible');if(!busy.current){setConfig(d);setError('');}}catch(e){if(!busy.current)setError((e as Error).message);}},[]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(!busy.current)void load();},30000);return()=>clearInterval(timer);},[load,hasItems]);
 if(testMode.active)return <RetailCartPanel {...props}/>;
 if(!config||error)return <div className="rounded-xl border p-5"><p>{error||'Chargement de la machine…'}</p>{error&&<button className="mt-4 underline" onClick={()=>void load()}>Réessayer</button>}</div>;
 return config.enabled?<EmployeeCartPanel {...props} config={config}/>:<RetailCartPanel {...props} funding={config.funding} onBusyChange={onBusyChange}/>;
}
