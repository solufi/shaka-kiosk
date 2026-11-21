'use client';
import { useState, useEffect, useRef } from 'react';
import type { Product, CartItem } from '@/lib/types';
import { ProductCard } from '@/components/product-card';
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { CartPanel } from '@/components/cart-panel';
import { useTestMode } from './test-mode';
import { DoorAlert, useDoorAlert } from '@/components/door-alert';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from './ui/skeleton';
import { Card, CardContent, CardFooter } from './ui/card';
import { cn } from '@/lib/utils';
import { Screensaver } from './screensaver';
import { useIdle } from '@/hooks/use-idle';
import { useDisplayLayout } from '@/hooks/use-display-layout';
import { ProductBrowser } from './product-browser';

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

const OFFLINE_PRODUCTS_LS_KEY = 'shaka:offlineProducts';

export function VendingMachine() {
  const testMode=useTestMode();
  const { doorAlert, showDoorAlert, hideDoorAlert } = useDoorAlert();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [employeeConfig,setEmployeeConfig]=useState<any>(null);
  useEffect(()=>{let active=true;const load=()=>fetch('/api/machine/employee/config',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(active&&d.ok)setEmployeeConfig(d);}).catch(()=>{});void load();const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer);};},[]);

  const [verifiedProducts,setVerifiedProducts] = useState<Product[]>([]);
  const inventoryRequest=useRef(0);
  useEffect(()=>{
    try {
      const cached=JSON.parse(safeStorageGet(OFFLINE_PRODUCTS_LS_KEY)||'null');
      if(Array.isArray(cached)) {setProducts(cached);setProductsLoading(false);}
    } catch { /* A damaged display cache is refreshed from the local agent. */ }
  },[]);

  const loadProducts = async () => {
    const sequence=++inventoryRequest.current;
    // 2) Background refresh from API (fast, 2 attempts max)
    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(`/api/local-products?v=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        const json = (await res.json()) as { ok?: boolean; data?: Product[] };
        if (sequence !== inventoryRequest.current) return;
        if (res.ok && json?.ok && Array.isArray(json.data)) {
          setVerifiedProducts(json.data);
          setProducts(json.data);
          safeStorageSet(OFFLINE_PRODUCTS_LS_KEY, JSON.stringify(json.data));
          setProductsLoading(false);
          return;
        }
      } catch {
        // ignore and retry
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (sequence===inventoryRequest.current) {setVerifiedProducts([]);setProductsLoading(false);}
  };


  useEffect(() => {
    // When navigating back from admin, the page may be kept alive.
    // Re-load cache when tab becomes visible or window regains focus.
    const onFocus = () => {
      void loadProducts();
      // Wake up immediately when returning from admin
      setIsPersonNearby(true);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void loadProducts();
        // Wake up immediately when tab becomes visible
        setIsPersonNearby(true);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Check if we're coming back from admin (recent navigation)
  useEffect(() => {
    // If page loads and there was recent admin activity, show products immediately
    try {
      const lastAdminLogout = window.sessionStorage.getItem('shaka:lastAdminLogout');
      if (lastAdminLogout) {
        const logoutTime = parseInt(lastAdminLogout, 10);
        // If logout was within last 5 seconds, show products immediately
        if (Date.now() - logoutTime < 5000) {
          setIsPersonNearby(true);
        }
        window.sessionStorage.removeItem('shaka:lastAdminLogout');
      }
    } catch {
      // ignore
    }
  }, []);
  
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  useEffect(() => {
    if (cartItems.length) return;
    void loadProducts();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void loadProducts(); }, 15000);
    return () => clearInterval(timer);
  }, [cartItems.length]);
  const [isPersonNearby, setIsPersonNearby] = useState(false);
  const [employeePending,setEmployeePending]=useState(false);
  useEffect(()=>{const update=()=>{const pending=!!sessionStorage.getItem('shaka.employee.pending');setEmployeePending(pending);if(pending)setIsPersonNearby(true);};update();window.addEventListener('shaka:employee-session',update);return()=>window.removeEventListener('shaka:employee-session',update);},[]);

  const handleIdle = () => {
    if(testMode.active || sessionStorage.getItem('shaka.employee.pending') || document.querySelector('dialog[open]'))return;
    setIsPersonNearby(false);
    handleClearCart();
  };

  useIdle({ onIdle: handleIdle, idleTime: 120000 });

  const handleInteraction = () => {
    if (!isPersonNearby) {
      setIsPersonNearby(true);

      // Reload products when waking from screensaver
      void loadProducts();
    }
  };

  const handleAddToCart = (product: Product) => {
    handleInteraction();
    if (product.quantity <= 0) return;
    const policy=!testMode.active&&employeeConfig?.enabled?employeeConfig.policies?.find((p:any)=>p.productId===product.id):null;
    if(!testMode.active&&employeeConfig?.enabled&&(!policy||policy.mode==='blocked'))return;
    const maximum=Math.min(product.quantity,policy?.maxQuantity||product.quantity);

    setCartItems((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        if (existingItem.orderQuantity < maximum) {
          return prevCart.map((item) =>
            item.id === product.id
              ? { ...item, orderQuantity: item.orderQuantity + 1 }
              : item
          );
        }
        return prevCart;
      }
      return [...prevCart, { ...product, orderQuantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    handleInteraction();
    if (newQuantity <= 0) {
      handleRemoveItem(productId);
      return;
    }

    setCartItems((prevCart) =>
      prevCart.map((item) =>
        item.id === productId ? { ...item, orderQuantity: newQuantity } : item
      )
    );
  };
  
  const handleRemoveItem = (productId: string) => {
    handleInteraction();
    setCartItems((prevCart) => prevCart.filter((item) => item.id !== productId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handlePurchase = async () => {
    handleInteraction();
    await loadProducts();
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
    // Product updates are handled in admin dashboard, not here
    toast({
      title: 'Produit mis à jour',
      description: `${updatedProduct.name} a été mis à jour.`,
    });
  };

  const handleDeleteProduct = async (productId: string) => {
    // Product deletion is handled in admin dashboard
    toast({
      variant: 'destructive',
      title: 'Produit Supprimé',
      description: `Le produit a été supprimé.`,
    });
  };

  const handleMoveProduct = async (productId: string, direction: 'up' | 'down') => {
    // Product reordering is handled in admin dashboard
  };

  
  const isCartVisible = cartItems.length > 0 || employeePending;
  const display = useDisplayLayout(isCartVisible || doorAlert.isOpen, isPersonNearby && !productsLoading);
  const displayedProducts = products ?? [];

  if (!isPersonNearby && !testMode.active) {
    const allowed=employeeConfig?.enabled && !employeeConfig?.funding?.enabled
      ? verifiedProducts.filter(p=>employeeConfig.policies?.some((rule:{productId:string;mode:string})=>rule.productId===p.id && rule.mode!=='blocked'))
      : verifiedProducts;
    return <Screensaver products={allowed} layout={display} included={!!employeeConfig?.funding?.enabled} onInteraction={handleInteraction} />;
  }

  if (productsLoading && !products) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" onClick={handleInteraction}>
        <div className='lg:col-span-2'>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <Skeleton className="aspect-square w-full" />
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-8 w-1/2" />
                </CardContent>
                <CardFooter className="p-4 pt-0">
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
            </div>
        </div>
         <div className="lg:col-span-1">
             <Card className="sticky top-6 flex h-[calc(100vh-3.5rem-3rem)] max-h-[calc(100vh-3.5rem-3rem)] flex-col">
                <CardContent className="p-4">
                    <Skeleton className="h-8 w-1/2 mb-6" />
                    <div className="flex flex-col gap-4">
                         <div className="flex items-center gap-4">
                            <Skeleton className="h-16 w-16" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/4" />
                            </div>
                         </div>
                         <div className="flex items-center gap-4">
                            <Skeleton className="h-16 w-16" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/4" />
                            </div>
                         </div>
                    </div>
                </CardContent>
             </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("grid grid-cols-1 gap-6", display.mode==='pages'?`catalog-machine-pages ${isCartVisible?'with-cart':''}`:isCartVisible ? 'lg:grid-cols-3' : '')}
      onClick={handleInteraction}
    >
      {/* Door Alert Modal */}
      {doorAlert.isOpen && doorAlert.product && (
        <DoorAlert
          product={doorAlert.product}
          onClose={hideDoorAlert}
        />
      )}

      <div
        className={cn(
          "transition-all duration-300",
          isCartVisible ? 'lg:col-span-2' : 'lg:col-span-3'
        )}
      >
        <ProductBrowser products={displayedProducts} layout={display} renderProduct={(product,index,compact)=>(
            <ProductCard
              placeholderImages={PlaceHolderImages}
              key={product.id}
              product={product}
              compact={compact}
              employeeMode={!testMode.active&&employeeConfig?.funding?.enabled?'included':!testMode.active&&employeeConfig?.enabled?(employeeConfig.policies?.find((p:any)=>p.productId===product.id)?.mode||'blocked'):undefined}
              onAddToCart={handleAddToCart}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onMove={handleMoveProduct}
              isFirst={index === 0}
              isLast={displayedProducts.length - 1 === index}
            />
        )}/>

      </div>

      {isCartVisible && (
        <div className="lg:col-span-1 transition-opacity duration-300 opacity-100">
          <CartPanel
            cartItems={cartItems}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onPurchase={handlePurchase}
          />
        </div>
      )}
    </div>
  );
}
