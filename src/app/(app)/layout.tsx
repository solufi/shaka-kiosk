'use client';
import type { ReactNode } from 'react';
import { TestModeProvider, TestModeButton } from '@/components/test-mode';
import { useState, useEffect, useRef, useCallback } from 'react';
import { flushRedemptions } from '@/lib/corporate-queue';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, BarChart2, LogOut } from 'lucide-react';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarFooter,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { KeypadLoginDialog } from '@/components/keypad-login-dialog';
import { useToast } from '@/hooks/use-toast';

const navItems = [
  { href: '/', label: 'Distributeur', icon: LayoutGrid },
  { href: '/dashboard', label: 'Tableau de bord', icon: BarChart2 },
];

export default function AppLayout({children}:{children:ReactNode}) { return <TestModeProvider><AppLayoutContent>{children}</AppLayoutContent></TestModeProvider>; }

function AppLayoutContent({ children }: { children: ReactNode }) {
  useEffect(() => {
    void flushRedemptions();
    const timer = setInterval(() => void flushRedemptions(), 60000);
    return () => clearInterval(timer);
  }, []);
  const pathname = usePathname();
  const { toast } = useToast();
  const [access, setAccess] = useState<'checking' | 'customer' | 'admin'>('checking');
  const [logoutState, setLogoutState] = useState<'idle' | 'pending' | 'failed'>('idle');
  const exiting = useRef(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const isLocalAdmin = access === 'admin';
  
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminButtonTimeout, setAdminButtonTimeout] = useState<NodeJS.Timeout | null>(null);

  // Démarrer le heartbeat service
  useScreenDiagnostic();

  useEffect(() => {
    const revealLogin = () => setShowAdminLogin(true);
    window.addEventListener('shaka-admin-login-required', revealLogin);
    return () => window.removeEventListener('shaka-admin-login-required', revealLogin);
  }, []);

  // Handle secret admin login button clicks
  const handleSecretAdminClick = () => {
    const newCount = adminClickCount + 1;
    setAdminClickCount(newCount);
    
    if (newCount >= 5) {
      setShowAdminLogin(true);
      setAdminClickCount(0);
      toast({
        title: "Mode admin activé",
        description: "Le bouton de connexion admin est maintenant visible.",
      });
      
      // Clear any existing timeout
      if (adminButtonTimeout) {
        clearTimeout(adminButtonTimeout);
      }
      
      // Set new timeout to hide after 10 seconds
      const timeout = setTimeout(() => {
        setShowAdminLogin(false);
        toast({
          title: "Mode admin désactivé",
          description: "Le bouton de connexion admin a été masqué.",
        });
      }, 10000);
      
      setAdminButtonTimeout(timeout);
    } else {
      // Reset count after 2 seconds if not reached 5
      setTimeout(() => {
        setAdminClickCount(0);
      }, 2000);
    }
  };

  const handleLogout = useCallback(async (automatic = false) => {
    if (exiting.current && logoutState !== 'failed') return;
    exiting.current = true;
    setAccess('customer');
    setShowAdminLogin(false);
    setLogoutState('pending');
    try {
      window.localStorage.removeItem('shaka:isAdmin');
      window.sessionStorage.removeItem('shaka:test-mode');
    } catch { /* The server cookie is cleared independently. */ }
    window.dispatchEvent(new Event('shaka-admin-changed'));
    try {
      const response = await fetch('/api/admin/session', {
        method: 'DELETE', cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok || (await response.json()).ok !== true) throw new Error();
    } catch {
      if (!automatic) {
        setLogoutState('failed');
        return;
      }
    }
    try {
      window.sessionStorage.setItem('shaka:lastAdminLogout', Date.now().toString());
    } catch { /* Navigation also works without browser storage. */ }
    window.location.replace('/');
  }, [logoutState]);

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (adminButtonTimeout) {
        clearTimeout(adminButtonTimeout);
      }
    };
  }, [adminButtonTimeout]);

  useEffect(() => {
    let currentCheck = 0;
    async function verify() {
      const check = ++currentCheck;
      if (exiting.current) return;
      let markedAdmin = false;
      try {
        markedAdmin = window.localStorage.getItem('shaka:isAdmin') === '1';
        if (markedAdmin) {
          setAccess('checking');
          const response = await fetch('/api/admin/session', {
            cache: 'no-store', signal: AbortSignal.timeout(5000),
          });
          const session = response.ok ? await response.json() : null;
          if (check !== currentCheck || exiting.current) return;
          if (session?.authenticated && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()) {
            setExpiresAt(session.expiresAt);
            setAccess('admin');
            return;
          }
          void handleLogout(true);
          return;
        }
      } catch {
        if (markedAdmin && check === currentCheck && !exiting.current) {
          void handleLogout(true);
          return;
        }
      }
      if (check === currentCheck && !exiting.current) setAccess('customer');
    }
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === 'shaka:isAdmin') void verify();
    }
    void verify();
    window.addEventListener('pageshow', verify);
    window.addEventListener('storage', onStorage);
    window.addEventListener('shaka-admin-changed', verify);
    return () => {
      currentCheck++;
      window.removeEventListener('pageshow', verify);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('shaka-admin-changed', verify);
    };
  }, [pathname, handleLogout]);

  useEffect(() => {
    if (access !== 'admin') return;
    let active = true;
    // The Pi supplies the deadline. Refreshing the page or polling a diagnostic
    // never gives the next customer another ten minutes of access.
    const expire = () => { if (active) void handleLogout(true); };
    let deadline = expiresAt;
    let timer = setTimeout(expire, Math.max(0, deadline - Date.now()));
    let renewing = false;
    let moreInput = false;
    async function renew() {
      moreInput = true;
      if (renewing) return;
      renewing = true;
      try {
        while (moreInput && active && !exiting.current) {
          moreInput = false;
          const res = await fetch('/api/admin/session', {
            method: 'PUT', cache: 'no-store', signal: AbortSignal.timeout(5000),
          });
          if (!active || exiting.current) return;
          if (res.status === 401) { expire(); return; }
          const next = res.ok && (await res.json()).expiresAt;
          if (active && !exiting.current && Number.isFinite(next)) {
            deadline = next;
            clearTimeout(timer);
            timer = setTimeout(expire, Math.max(0, deadline - Date.now()));
          }
        }
      } catch { /* Keep the last deadline confirmed by the Pi. */ }
      finally { renewing = false; }
    }
    function onInput(event: Event) {
      if (!event.isTrusted || exiting.current) return;
      if (Date.now() >= deadline) {
        event.preventDefault();
        event.stopImmediatePropagation();
        expire();
        return;
      }
      void renew();
    }
    const checkDeadline = () => { if (Date.now() >= deadline) expire(); };
    window.addEventListener('focus', checkDeadline);
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('keydown', onInput, true);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', checkDeadline);
      window.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('keydown', onInput, true);
    };
  }, [access, expiresAt, handleLogout]);

  const adminPage = pathname === '/dashboard' || pathname === '/essais';
  useEffect(() => {
    if (adminPage && access === 'customer' && !exiting.current) window.location.replace('/');
  }, [adminPage, access]);

  if (logoutState !== 'idle') {
    return <main className="grid min-h-svh place-content-center gap-4 text-center">
      <p role="status">{logoutState === 'pending' ? 'Déconnexion…' : 'La déconnexion doit être confirmée par la machine.'}</p>
      {logoutState === 'failed' && <Button onClick={() => void handleLogout()}>Réessayer la déconnexion</Button>}
    </main>;
  }
  if (adminPage && !isLocalAdmin) return null;
  if (pathname === '/essais') return <>{children}</>;

  const handleNavClick = (href: string) => (e: React.MouseEvent) => {
    // On Pi kiosk we prefer a full reload when returning to '/', to avoid
    // any stale client state and force a re-fetch of offline cache.
    if (href === '/' && typeof window !== 'undefined') {
      e.preventDefault();
      // Record navigation time so vending-machine can skip screensaver
      try {
        window.sessionStorage.setItem('shaka:lastAdminLogout', Date.now().toString());
      } catch {
        // ignore
      }
      window.location.assign(`/?v=${Date.now()}`);
    }
  };

  // If user is not logged in, show a simplified layout without the sidebar.
  if (!isLocalAdmin) {
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:h-[60px] lg:px-6 relative">
           <div className="flex h-full items-center gap-4">
             <div className="h-full py-2">
                <Logo />
             </div>
             {pathname === '/' && <h1 className="hidden text-xl font-bold tracking-tight font-headline sm:block">Bienvenue chez Shaka</h1>}
           </div>
           {/* Secret admin button - completely invisible but clickable */}
           <div 
             className="absolute top-4 right-4 w-8 h-8 opacity-0 pointer-events-auto z-50"
             onClick={handleSecretAdminClick}
             style={{ 
               backgroundColor: 'transparent',
               cursor: 'default',
               border: 'none',
               outline: 'none'
             }}
           />
           {/* Visible admin button - only shown after 5 clicks */}
           {showAdminLogin && <KeypadLoginDialog />}
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="h-28 justify-center">
          <Logo />
          {/* Secret admin button - invisible but clickable (works even with sidebar) */}
          <div
            className="absolute top-4 right-4 w-8 h-8 opacity-0 pointer-events-auto z-50"
            onClick={handleSecretAdminClick}
            style={{
              backgroundColor: 'transparent',
              cursor: 'default',
              border: 'none',
              outline: 'none'
            }}
          />
          {showAdminLogin && <KeypadLoginDialog />}
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href} onClick={handleNavClick(item.href)}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <TestModeButton />
          {isLocalAdmin ? (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => void handleLogout()} tooltip="Se déconnecter">
                  <LogOut />
                  <span>Se déconnecter</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6">
          <SidebarTrigger aria-label="Ouvrir ou fermer le menu Admin" className="shrink-0 md:hidden" />
          <div className="w-full flex-1 h-full flex items-center gap-4">
             <div className="h-full py-2 md:hidden">
               <Logo />
             </div>
             {pathname === '/' && <h1 className="text-xl font-bold tracking-tight font-headline">Bienvenue chez Shaka</h1>}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Report the local renderer even when nobody uses the machine.
function useScreenDiagnostic() {
  useEffect(() => {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    let touched = false;
    let pending = false;
    function onTouch(event: PointerEvent) {
      if (event.isTrusted && event.pointerType === 'touch') touched = true;
    }
    async function report() {
      if (pending || document.hidden) return;
      pending = true;
      const observed = touched;
      touched = false;
      try {
        const response = await fetch('/api/screen-health', {
          method: 'POST', headers: {'X-Shaka-Screen': observed ? 'touch' : 'alive'},
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) touched ||= observed;
      } catch { touched ||= observed; }
      finally { pending = false; }
    }
    window.addEventListener('pointerdown', onTouch, true);
    void report();
    const timer = setInterval(report, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', onTouch, true);
    };
  }, []);
}
