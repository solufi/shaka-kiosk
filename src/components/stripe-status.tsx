'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';

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

interface StripeSession {
  session_id: string;
  payment_intent_id: string;
  items: { code: number; price: number; name: string; qty: number }[];
  total_price: number;
  total_display: string;
  captured_amount: number;
  state: string;
  payment_result: string;
  transaction_id: string | null;
  card_last4: string | null;
  card_brand: string | null;
  is_interac: boolean;
  error: string | null;
}

interface StripeStatusData {
  connected: boolean;
  simulation: boolean;
  protocol: string;
  reader_id: string;
  state: string;
  session: StripeSession | null;
  api_stats: { calls: number; errors: number };
  timestamp: number;
  ok: boolean;
}

export function StripeStatus() {
  const [status, setStatus] = useState<StripeStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getVendApiBase();
      const res = await fetch(`${base}/stripe/status`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const stateLabels: Record<string, string> = {
    idle: 'En attente',
    creating_intent: 'Création du paiement',
    waiting_payment: 'Attente paiement',
    payment_authorized: 'Paiement autorisé',
    capturing: 'Capture en cours',
    session_complete: 'Session complète',
    error: 'Erreur',
  };

  const isLive = status && !status.simulation && status.connected;
  const isSim = status?.simulation;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            <CardTitle>Terminal Stripe</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {status && (
              <Badge variant={isLive ? 'default' : isSim ? 'secondary' : 'destructive'} className="text-xs">
                {isLive ? 'LIVE' : isSim ? 'SIMULATION' : status.connected ? 'CONNECTÉ' : 'HORS LIGNE'}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
              {loading ? '...' : 'Actualiser'}
            </Button>
          </div>
        </div>
        <CardDescription>
          Terminal de paiement Stripe WisePOS E — Intégration server-driven.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {status && (
          <>
            {/* Connection status */}
            <div className="flex items-center gap-3">
              <span className={`inline-block h-3 w-3 rounded-full ${
                isLive ? 'bg-green-500 animate-pulse' :
                isSim ? 'bg-yellow-500' :
                status.connected ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <div>
                <p className="font-medium">
                  {isLive ? 'Connecté (Live)' :
                   isSim ? 'Mode Simulation' :
                   status.connected ? 'Connecté' : 'Non connecté'}
                </p>
                <p className="text-sm text-muted-foreground">
                  État: {stateLabels[status.state] || status.state}
                </p>
              </div>
            </div>

            {/* Reader info */}
            {status.reader_id && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-sm font-mono">{status.reader_id}</div>
                  <div className="text-xs text-muted-foreground">Reader ID</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold">{status.api_stats.calls}</div>
                  <div className="text-xs text-muted-foreground">Appels API</div>
                </div>
              </div>
            )}

            {/* Session info */}
            {status.session && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Session active</span>
                  <Badge variant={
                    status.session.payment_result === 'authorized' || status.session.payment_result === 'captured' ? 'default' :
                    status.session.payment_result === 'denied' || status.session.payment_result === 'cancelled' ? 'destructive' :
                    'secondary'
                  }>
                    {stateLabels[status.state] || status.state}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-bold">${status.session.total_display}</span>
                  </div>
                  {status.session.card_brand && (
                    <div>
                      <span className="text-muted-foreground">Carte: </span>
                      <span className="font-mono">
                        {status.session.card_brand} ****{status.session.card_last4}
                      </span>
                    </div>
                  )}
                  {status.session.payment_result && status.session.payment_result !== 'pending' && (
                    <div>
                      <span className="text-muted-foreground">Résultat: </span>
                      <Badge variant={
                        status.session.payment_result === 'authorized' || status.session.payment_result === 'captured' ? 'default' : 'destructive'
                      }>
                        {status.session.payment_result}
                      </Badge>
                    </div>
                  )}
                  {status.session.error && (
                    <div className="col-span-2 text-xs text-red-500">
                      {status.session.error}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Last update */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Protocole: Stripe Terminal (server-driven)</div>
              {status.timestamp && (
                <div>Dernière MAJ: {new Date(status.timestamp * 1000).toLocaleTimeString('fr-FR')}</div>
              )}
              {status.api_stats.errors > 0 && (
                <div className="text-red-500">Erreurs API: {status.api_stats.errors}</div>
              )}
            </div>
          </>
        )}

        {!status && !loading && !error && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Service Stripe non disponible.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
