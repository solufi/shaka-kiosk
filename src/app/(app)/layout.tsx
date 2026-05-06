'use client';
import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, BarChart2, PanelLeft, LogOut } from 'lucide-react';

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
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { KeypadLoginDialog } from '@/components/keypad-login-dialog';
import { useToast } from '@/hooks/use-toast';
import { heartbeatService } from '@/lib/heartbeat-service';

const navItems = [
  { href: '/', label: 'Distributeur', icon: LayoutGrid },
  { href: '/dashboard', label: 'Tableau de bord', icon: BarChart2 },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { toast } = useToast();
  const [isLocalAdmin, setIsLocalAdmin] = useState(false);
  
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminButtonTimeout, setAdminButtonTimeout] = useState<NodeJS.Timeout | null>(null);

  // Démarrer le heartbeat service
  useHeartbeat();

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

  const handleLogout = () => {
    try {
      window.localStorage.removeItem('shaka:isAdmin');
      // Record logout time so vending-machine can skip screensaver
      window.sessionStorage.setItem('shaka:lastAdminLogout', Date.now().toString());
      window.dispatchEvent(new Event('shaka-admin-changed'));
    } catch {
      // ignore
    }
  };

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (adminButtonTimeout) {
        clearTimeout(adminButtonTimeout);
      }
    };
  }, [adminButtonTimeout]);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem('shaka:isAdmin');
      setIsLocalAdmin(v === '1');
    } catch {
      setIsLocalAdmin(false);
    }

    const handler = () => {
      try {
        const v = window.localStorage.getItem('shaka:isAdmin');
        setIsLocalAdmin(v === '1');
      } catch {
        setIsLocalAdmin(false);
      }
    };

    window.addEventListener('storage', handler);
    window.addEventListener('shaka-admin-changed', handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('shaka-admin-changed', handler as EventListener);
    };
  }, []);

  const hasAdminAccess = isLocalAdmin;

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
  if (!hasAdminAccess) {
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
          {isLocalAdmin ? (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} tooltip="Se déconnecter">
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
          <Button variant="outline" size="icon" className="shrink-0 md:hidden">
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">Basculer le menu de navigation</span>
          </Button>
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

// Hook pour gérer le heartbeat
// DISABLED: The Python shaka_heartbeat.py service handles heartbeats correctly.
// This client-side heartbeat was creating a ghost machine (shaka-publicstorage)
// because it derived machineId from the browser hostname instead of using shaka-001.
function useHeartbeat() {
  // No-op: heartbeat handled by shaka_heartbeat.py systemd service
}
