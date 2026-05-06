'use client';
import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { analyzeStockLevel, AnalyzeStockLevelOutput } from '@/ai/flows/analyze-stock-level';
import { FileUp, Lightbulb, Bot, BarChart2, Wrench, DoorOpen, DoorClosed } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { salesData } from '@/lib/data';
import { ChartContainer } from '@/components/ui/chart';
import { MachineLayoutSelector } from '@/components/machine-layout-selector';
import { AddProductDialog } from '@/components/add-product-dialog';
import { CameraPanel } from '@/components/camera-panel';
import { HeartbeatConfig } from '@/components/heartbeat-config';
import { ProximityStats } from '@/components/proximity-stats';
import { StripeStatus } from '@/components/stripe-status';
import type { Product } from '@/lib/types';

type FreeVendResult = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  operationId?: string;
  sequence?: string;
  dropDetected?: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
};

function getVendApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_VEND_API_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl;
  
  // Auto-detect based on where the UI is being served from
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // If accessing from the Pi itself (localhost or 127.0.0.1)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:5001/vend';
    }
    // If accessing via Pi's IP address, use that same IP for vend server
    return `http://${hostname}:5001/vend`;
  }
  
  // Fallback for SSR
  return 'http://127.0.0.1:5001/vend';
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const salesByProduct = salesData.reduce((acc, sale) => {
  if (!acc[sale.productName]) {
    acc[sale.productName] = 0;
  }
  acc[sale.productName] += sale.quantity;
  return acc;
}, {} as Record<string, number>);

const salesChartData = Object.entries(salesByProduct).map(([name, total]) => ({ name, total }));

export function DashboardClient() {
  const { toast } = useToast();
  
  // Local products state
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);

  // Load products from local API
  const loadProducts = async () => {
    try {
      const res = await fetch(`/api/local-products?v=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && Array.isArray(json?.data)) {
        setProducts(json.data);
      }
    } catch (e) {
      console.error('Failed to load products:', e);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const [analysisResult, setAnalysisResult] = useState<AnalyzeStockLevelOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  const [freeVendLocation, setFreeVendLocation] = useState('');
  const [freeVendLoading, setFreeVendLoading] = useState(false);
  const [freeVendResult, setFreeVendResult] = useState<FreeVendResult | null>(null);
  const [freeVendSeq, setFreeVendSeq] = useState('');

  // Relay test states
  const [relayTestLoading, setRelayTestLoading] = useState(false);
  const [relayTestResult, setRelayTestResult] = useState<FreeVendResult | null>(null);

  // Door monitoring states
  const [doorStatus, setDoorStatus] = useState<'open' | 'closed' | 'unknown' | 'error'>('unknown');
  const [doorStatusLoading, setDoorStatusLoading] = useState(false);

  // Product management functions
  const handleCreateProduct = async (product: Omit<Product, 'id' | 'order'>) => {
    try {
      // Get the highest order number and increment
      const maxOrder = products?.reduce((max, p) => Math.max(max, p.order || 0), 0) || 0;
      
      const newProduct: Product = {
        ...product,
        id: `product-${Date.now()}`,
        order: maxOrder + 1,
      };
      
      const updatedProducts = [...(products || []), newProduct];
      setProducts(updatedProducts);
      
      // Save to local API
      await fetch('/api/local-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: updatedProducts }),
      });
      
      toast({
        title: "Produit ajouté",
        description: `${product.name} a été ajouté avec succès.`,
      });
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'ajouter le produit.",
      });
    }
  };

  const handleSyncOfflineProducts = async () => {
    if (!products || products.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sync offline',
        description: "Aucun produit à synchroniser (liste vide).",
      });
      return;
    }

    try {
      const res = await fetch('/api/local-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Sync offline échoué',
          description: data?.error || 'Erreur API',
        });
        return;
      }

      toast({
        title: 'Sync offline OK',
        description: `Cache local mis à jour (${data?.count ?? products.length} produits).`,
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Sync offline échoué',
        description: String(e),
      });
    }
  };

  const handleFreeVendSeq = async () => {
    if (!freeVendSeq) return;
    setFreeVendLoading(true);
    setFreeVendResult(null);

    try {
      const url = getVendApiUrl();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seq: freeVendSeq, machineId: 'admin-free-vend-seq' }),
      });

      let data: FreeVendResult | null = null;
      try {
        data = (await res.json()) as FreeVendResult;
      } catch {
        data = { success: res.ok, message: await res.text() };
      }

      if (!res.ok) {
        setFreeVendResult({ ...data, success: false, error: data?.error || data?.message || 'Erreur API' });
        toast({
          variant: 'destructive',
          title: 'Séquence échouée',
          description: data?.error || data?.message || 'Erreur API',
        });
        return;
      }

      setFreeVendResult({ ...data, success: data?.success ?? true, sequence: data?.sequence ?? freeVendSeq });
      toast({
        title: 'Séquence envoyée',
        description: data?.message || `Commande envoyée pour '${freeVendSeq}'.`,
      });
    } catch (error) {
      console.error('Free vend seq failed:', error);
      setFreeVendResult({ success: false, error: 'Impossible de joindre le service de distribution.' });
      toast({
        variant: 'destructive',
        title: 'Séquence échouée',
        description: 'Impossible de joindre le service de distribution.',
      });
    } finally {
      setFreeVendLoading(false);
    }
  };

  const handleUpdateProduct = async (productId: string, updates: Partial<Product>) => {
    try {
      const updatedProducts = (products || []).map(p => 
        p.id === productId ? { ...p, ...updates } : p
      );
      setProducts(updatedProducts);
      
      // Save to local API
      await fetch('/api/local-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: updatedProducts }),
      });
      
      toast({
        title: "Produit mis à jour",
        description: "Les modifications ont été enregistrées.",
      });
    } catch (error) {
      console.error('Error updating product:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de mettre à jour le produit.",
      });
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const updatedProducts = (products || []).filter(p => p.id !== productId);
      setProducts(updatedProducts);
      
      // Save to local API
      await fetch('/api/local-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: updatedProducts }),
      });
      
      toast({
        title: "Produit supprimé",
        description: "Le produit a été supprimé avec succès.",
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer le produit.",
      });
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);
    setAnalysisResult(null);

    try {
      const dataUri = await fileToDataUri(file);
      const result = await analyzeStockLevel({ photoDataUri: dataUri });
      setAnalysisResult(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      toast({
        variant: "destructive",
        title: "L'analyse a échoué",
        description: "L'IA n'a pas pu traiter l'image. Veuillez en essayer une autre.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const productLevelsData = analysisResult
    ? Object.entries(analysisResult.productLevels).map(([name, quantity]) => ({
        name,
        quantity,
      }))
    : [];

  const handleFreeVend = async () => {
    if (!freeVendLocation) return;
    setFreeVendLoading(true);
    setFreeVendResult(null);

    try {
      const url = getVendApiUrl();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location: freeVendLocation, machineId: 'admin-free-vend' }),
      });

      let data: FreeVendResult | null = null;
      try {
        data = (await res.json()) as FreeVendResult;
      } catch {
        data = { success: res.ok, message: await res.text() };
      }

      if (!res.ok) {
        setFreeVendResult({ ...data, success: false, error: data?.error || data?.message || 'Erreur API' });
        toast({
          variant: 'destructive',
          title: 'Free Vend échoué',
          description: data?.error || data?.message || 'Erreur API',
        });
        return;
      }

      setFreeVendResult({ ...data, success: data?.success ?? true });
      toast({
        title: 'Free Vend envoyé',
        description: data?.message || `Commande envoyée pour ${freeVendLocation}.`,
      });
    } catch (error) {
      console.error('Free vend failed:', error);
      setFreeVendResult({ success: false, error: 'Impossible de joindre le service de distribution.' });
      toast({
        variant: 'destructive',
        title: 'Free Vend échoué',
        description: 'Impossible de joindre le service de distribution.',
      });
    } finally {
      setFreeVendLoading(false);
    }
  };

  const handleRelayTest = async () => {
    setRelayTestLoading(true);
    setRelayTestResult(null);

    try {
      const url = getVendApiUrl();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location: 'relay-test', machineId: 'admin-relay-test', useRelay: true }),
      });

      let data: FreeVendResult | null = null;
      try {
        data = (await res.json()) as FreeVendResult;
      } catch {
        data = { success: res.ok, message: await res.text() };
      }

      if (!res.ok) {
        setRelayTestResult({ ...data, success: false, error: data?.error || data?.message || 'Erreur API' });
        toast({
          variant: 'destructive',
          title: 'Test Relais échoué',
          description: data?.error || data?.message || 'Erreur API',
        });
        return;
      }

      setRelayTestResult({ ...data, success: data?.success ?? true });
      toast({
        title: 'Test Relais réussi',
        description: data?.message || 'Le relais a été activé avec succès.',
      });
    } catch (error) {
      console.error('Relay test failed:', error);
      setRelayTestResult({ success: false, error: 'Impossible de joindre le service de distribution.' });
      toast({
        variant: 'destructive',
        title: 'Test Relais échoué',
        description: 'Impossible de joindre le service de distribution.',
      });
    } finally {
      setRelayTestLoading(false);
    }
  };

  const checkDoorStatus = async () => {
    setDoorStatusLoading(true);
    try {
      // Auto-detect URL like getVendApiUrl
      const isLocalhost = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : '192.168.2.169';
      const doorStatusUrl = isLocalhost ? 
        'http://127.0.0.1:5001/door-status' : 
        `http://${currentHost}:5001/door-status`;
      
      const response = await fetch(doorStatusUrl);
      const data = await response.json();
      if (data.ok) {
        setDoorStatus(data.status);
      } else {
        setDoorStatus('error');
      }
    } catch (error) {
      console.error('Failed to check door status:', error);
      setDoorStatus('error');
    } finally {
      setDoorStatusLoading(false);
    }
  };

  // Check door status on component mount and every 5 seconds
  useEffect(() => {
    checkDoorStatus();
    const interval = setInterval(checkDoorStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6" />
            <CardTitle>Surveillance à Distance par IA</CardTitle>
          </div>
          <CardDescription>
            Téléchargez une photo de l'intérieur du distributeur pour obtenir une analyse automatisée de l'inventaire et un contrôle de maintenance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex w-full items-center space-x-2">
            <Input id="picture" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <label htmlFor="picture" className="w-full">
              <Button asChild className="w-full cursor-pointer">
                <div>
                  <FileUp className="mr-2 h-4 w-4" />
                  {fileName || 'Choisir une image...'}
                </div>
              </Button>
            </label>
          </div>
          {isLoading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-primary">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary"></div>
              <span>Analyse de l'image en cours... Cela peut prendre un moment.</span>
            </div>
          )}
        </CardContent>
        {analysisResult && (
          <CardFooter className="flex-col items-start gap-4">
            <Alert variant={analysisResult.needsRefill || analysisResult.maintenanceRequired ? 'destructive' : 'default'}>
              <Lightbulb className="h-4 w-4" />
              <AlertTitle>Résumé de l'Analyse IA</AlertTitle>
              <AlertDescription>{analysisResult.analysis}</AlertDescription>
            </Alert>
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">État du stock:</h3>
                <Badge variant={analysisResult.needsRefill ? 'destructive' : 'default'}>
                  {analysisResult.needsRefill ? 'Remplissage Requis' : 'Niveaux de stock OK'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                <h3 className="font-semibold">Maintenance:</h3>
                <Badge variant={analysisResult.maintenanceRequired ? 'destructive' : 'default'}>
                  {analysisResult.maintenanceRequired ? 'Requise' : 'OK'}
                </Badge>
              </div>
            </div>
            <div className="w-full">
                <h3 className="font-semibold mb-2">Niveaux de produits détectés</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={productLevelsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Bar dataKey="quantity" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
            </div>
          </CardFooter>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            <CardTitle>Free Vend (Test)</CardTitle>
          </div>
          <CardDescription>
            Envoie une commande de distribution sans paiement pour vérifier l'emplacement et confirmer le drop.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSyncOfflineProducts}
              disabled={productsLoading || !products || products.length === 0}
              variant="outline"
            >
              {productsLoading ? 'Chargement...' : 'Sync produits → cache offline'}
            </Button>
            <div className="text-sm text-muted-foreground">
              Utilise Firestore si disponible, sinon l'écran du Pi peut lire le cache local.
            </div>
          </div>

          <div>
            <MachineLayoutSelector value={freeVendLocation} onChange={setFreeVendLocation} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleFreeVend} disabled={!freeVendLocation || freeVendLoading}>
              {freeVendLoading ? 'En cours...' : 'Free Vend'}
            </Button>
            <div className="text-sm text-muted-foreground">
              Endpoint: {getVendApiUrl()}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Simulation clavier (séquence)</div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={freeVendSeq}
                onChange={(e) => setFreeVendSeq(e.target.value)}
                placeholder="Ex: 31#"
                className="w-40"
              />
              <Button
                onClick={handleFreeVendSeq}
                disabled={!freeVendSeq || freeVendLoading}
                variant="secondary"
              >
                {freeVendLoading ? 'En cours...' : 'Envoyer séquence'}
              </Button>
              <Button
                onClick={() => setFreeVendSeq('')}
                disabled={!freeVendSeq || freeVendLoading}
                variant="outline"
              >
                Clear
              </Button>
              <Button
                onClick={() => setFreeVendSeq((s) => s.slice(0, -1))}
                disabled={!freeVendSeq || freeVendLoading}
                variant="outline"
              >
                Back
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 max-w-[220px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant="outline"
                  disabled={freeVendLoading}
                  onClick={() => setFreeVendSeq((s) => `${s}${k}`)}
                >
                  {k}
                </Button>
              ))}
            </div>
          </div>

          {freeVendResult && (
            <Alert variant={freeVendResult.success ? 'default' : 'destructive'}>
              <AlertTitle>Résultat</AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <div>
                    <span className="font-semibold">Emplacement:</span> {freeVendLocation}
                  </div>
                  {freeVendResult.message && (
                    <div>
                      <span className="font-semibold">Message:</span> {freeVendResult.message}
                    </div>
                  )}
                  {freeVendResult.sequence && (
                    <div>
                      <span className="font-semibold">Sequence:</span> {freeVendResult.sequence}
                    </div>
                  )}
                  {typeof freeVendResult.dropDetected === 'boolean' && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Drop:</span>
                      <Badge variant={freeVendResult.dropDetected ? 'default' : 'destructive'}>
                        {freeVendResult.dropDetected ? 'Détecté' : 'Non détecté'}
                      </Badge>
                    </div>
                  )}
                  {freeVendResult.error && (
                    <div>
                      <span className="font-semibold">Erreur:</span> {freeVendResult.error}
                    </div>
                  )}
                  {freeVendResult.operationId && (
                    <div>
                      <span className="font-semibold">OperationId:</span> {freeVendResult.operationId}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            <CardTitle>Gestion des Produits</CardTitle>
          </div>
          <CardDescription>
            Ajoutez et gérez les produits du distributeur automatique.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Ajouter un produit</h4>
              <p className="text-sm text-muted-foreground">
                Créez un nouveau produit pour le distributeur.
              </p>
            </div>
            <AddProductDialog onCreateProduct={handleCreateProduct} />
          </div>
          {products && products.length > 0 && (
            <div className="mt-4">
              <h5 className="font-medium mb-2">Produits existants ({products.length})</h5>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <span className="font-medium">{product.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {product.location || 'Relais'} • {product.quantity} en stock
                      </span>
                    </div>
                    <Badge variant={product.useRelay ? 'secondary' : 'default'}>
                      {product.useRelay ? 'Relais' : 'Clavier'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            <CardTitle>Contrôle de la Porte</CardTitle>
          </div>
          <CardDescription>
            Testez le relais et surveillez l'état de la porte (GPIO4/GPIO12).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Door Status Indicator */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm">État Actuel de la Porte</h4>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {doorStatus === 'open' && (
                  <>
                    <DoorOpen className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="font-medium text-red-600">Porte Ouverte</p>
                      <p className="text-sm text-muted-foreground">La porte est actuellement ouverte</p>
                    </div>
                  </>
                )}
                {doorStatus === 'closed' && (
                  <>
                    <DoorClosed className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="font-medium text-green-600">Porte Fermée</p>
                      <p className="text-sm text-muted-foreground">La porte est actuellement fermée</p>
                    </div>
                  </>
                )}
                {doorStatus === 'unknown' && (
                  <>
                    <Wrench className="h-8 w-8 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-600">État Inconnu</p>
                      <p className="text-sm text-muted-foreground">Impossible de déterminer l'état de la porte</p>
                    </div>
                  </>
                )}
                {doorStatus === 'error' && (
                  <>
                    <Wrench className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="font-medium text-red-600">Erreur de Capteur</p>
                      <p className="text-sm text-muted-foreground">Le capteur de porte ne répond pas</p>
                    </div>
                  </>
                )}
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={checkDoorStatus}
                disabled={doorStatusLoading}
              >
                {doorStatusLoading ? 'Vérification...' : 'Actualiser'}
              </Button>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t pt-4">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Test Relais GPIO4</h4>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Active le relais pendant 0.7 secondes pour tester l'ouverture.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRelayTest}
                  disabled={relayTestLoading}
                >
                  {relayTestLoading ? 'Test en cours...' : 'Tester Relais'}
                </Button>
              </div>
              {relayTestResult && (
                <Alert className={relayTestResult.ok ? 'border-green-200' : 'border-red-200'}>
                  <AlertTitle className={relayTestResult.ok ? 'text-green-800' : 'text-red-800'}>
                    {relayTestResult.ok ? 'Succès' : 'Erreur'}
                  </AlertTitle>
                  <AlertDescription>
                    <div className="space-y-1">
                      <div>{relayTestResult.message}</div>
                      {relayTestResult.stdout && (
                        <div className="text-xs mt-1">
                          <span className="font-semibold">Output:</span> {relayTestResult.stdout}
                        </div>
                      )}
                      {relayTestResult.stderr && (
                        <div className="text-xs mt-1 text-red-600">
                          <span className="font-semibold">Error:</span> {relayTestResult.stderr}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className="border-t pt-4">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Monitoring de la Porte</h4>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Affiche un message lorsque la porte est ouverte après une vente avec relais.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {/* TODO: Implement door monitoring toggle */}}
                >
                  {/* TODO: Add door monitoring state */}
                  Activer
                </Button>
              </div>
            </div>
          </div>

          <Alert>
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>
              Le relais GPIO4 contrôle l'ouverture de la porte. Le capteur GPIO12 détecte l'état de la porte (ouvert/fermé). L'état est actualisé automatiquement toutes les 5 secondes.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Camera Panel */}
      <div className="lg:col-span-2">
        <CameraPanel />
      </div>
      
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-6 w-6" />
            <CardTitle>Aperçu des Ventes</CardTitle>
          </div>
          <CardDescription>
            Un résumé des ventes de produits du distributeur automatique.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <ChartContainer config={{}} className="h-[400px] w-full">
            <BarChart data={salesChartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value.slice(0, 10) + '...'}
              />
              <YAxis allowDecimals={false} />
              <Bar dataKey="total" fill="hsl(var(--accent))" radius={4} />
            </BarChart>
           </ChartContainer>
        </CardContent>
      </Card>

      <StripeStatus />

      <ProximityStats />

      <HeartbeatConfig />

    </div>
  );
}
