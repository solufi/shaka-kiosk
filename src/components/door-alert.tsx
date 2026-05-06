'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { X, AlertTriangle } from 'lucide-react';
import type { Product } from '@/lib/types';

interface DoorAlertProps {
  product: Product;
  onClose: () => void;
}

export function DoorAlert({ product, onClose }: DoorAlertProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-orange-500" />
              <CardTitle className="text-lg">Porte Ouverte</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Veuillez fermer la porte du haut pour récupérer votre produit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product Image */}
          <div className="flex justify-center">
            <div className="relative w-32 h-32">
              <Image
                src={`/images/${product.imageId}`}
                alt={product.name}
                fill
                className="object-contain rounded-md"
              />
            </div>
          </div>
          
          {/* Product Info */}
          <div className="text-center space-y-2">
            <h3 className="font-semibold text-lg">{product.name}</h3>
            <div className="flex items-center justify-center gap-4 text-sm">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Quantité: {product.quantity}
              </Badge>
              <Badge variant="outline">
                {product.price.toFixed(2)} €
              </Badge>
            </div>
            {product.description && (
              <p className="text-muted-foreground text-sm mt-2">
                {product.description}
              </p>
            )}
          </div>
          
          {/* Warning Message */}
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <AlertTitle className="text-orange-800">Action requise</AlertTitle>
            <AlertDescription className="text-orange-700">
              La porte du distributeur est ouverte. Fermez-la pour sécuriser la machine.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

// Hook to manage door alert state
export function useDoorAlert() {
  const [doorAlert, setDoorAlert] = useState<{
    product: Product | null;
    isOpen: boolean;
  }>({
    product: null,
    isOpen: false,
  });

  const showDoorAlert = (product: Product) => {
    setDoorAlert({ product, isOpen: true });
  };

  const hideDoorAlert = () => {
    setDoorAlert({ product: null, isOpen: false });
  };

  return {
    doorAlert,
    showDoorAlert,
    hideDoorAlert,
  };
}
