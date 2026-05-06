'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  Activity, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  RefreshCw,
  Settings
} from 'lucide-react';

interface MachineStatus {
  machineId: string;
  status: 'online' | 'offline' | 'error';
  totalSlots: number;
  occupiedSlots: number;
  availableSlots: number;
  totalItems: number;
  products: Array<{
    id: string;
    name: string;
    location: string;
    quantity: number;
    price: number;
  }>;
  recentOperations: Array<{
    id: string;
    location: string;
    status: string;
    timestamp: any;
    dropDetected?: boolean;
  }>;
}

interface MachineDashboardProps {
  machineId?: string;
}

export function MachineDashboard({ machineId = 'default-machine' }: MachineDashboardProps) {
  const [machineStatus, setMachineStatus] = useState<MachineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchMachineStatus = async () => {
    try {
      setRefreshing(true);
      // In production, this would call your Firebase Function
      const response = await fetch(`/api/machine-status?machineId=${machineId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch machine status');
      }
      
      const data = await response.json();
      setMachineStatus(data);
    } catch (error) {
      console.error('Error fetching machine status:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de récupérer le statut de la machine",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMachineStatus();
    // Set up real-time updates every 30 seconds
    const interval = setInterval(fetchMachineStatus, 30000);
    return () => clearInterval(interval);
  }, [machineId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle className="h-4 w-4" />;
      case 'offline': return <Clock className="h-4 w-4" />;
      case 'error': return <AlertTriangle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getOperationStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!machineStatus) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Impossible de charger le statut de la machine</p>
          <Button onClick={fetchMachineStatus} className="mt-4">
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Machine: {machineId}</h2>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(machineStatus.status)}`}></div>
            <span className="text-sm text-gray-600 capitalize">{machineStatus.status}</span>
          </div>
        </div>
        <Button
          onClick={fetchMachineStatus}
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Slots</p>
                <p className="text-2xl font-bold">{machineStatus.totalSlots}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Occupied</p>
                <p className="text-2xl font-bold">{machineStatus.occupiedSlots}</p>
              </div>
              <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                <Package className="h-4 w-4 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Available</p>
                <p className="text-2xl font-bold">{machineStatus.availableSlots}</p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Items</p>
                <p className="text-2xl font-bold">{machineStatus.totalItems}</p>
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Products ({machineStatus.products.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {machineStatus.products.map((product) => (
                <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-600">
                      {product.location} • ${product.price.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={product.quantity > 5 ? "default" : "destructive"}>
                      {product.quantity} left
                    </Badge>
                  </div>
                </div>
              ))}
              {machineStatus.products.length === 0 && (
                <p className="text-center text-gray-500 py-8">No products in machine</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Operations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Operations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {machineStatus.recentOperations.map((operation) => (
                <div key={operation.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(operation.status)}
                    <div>
                      <div className="font-medium">Slot {operation.location}</div>
                      <div className="text-sm text-gray-600">
                        {operation.timestamp?.toDate?.()?.toLocaleString() || 'Unknown time'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {operation.dropDetected && (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Drop detected
                      </Badge>
                    )}
                    <Badge className={getOperationStatusColor(operation.status)}>
                      {operation.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {machineStatus.recentOperations.length === 0 && (
                <p className="text-center text-gray-500 py-8">No recent operations</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
