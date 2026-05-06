'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Product } from '@/lib/types';
import { PlusCircle } from 'lucide-react';
import { Separator } from './ui/separator';
import { ImageSelector } from './image-selector';
import { MachineLayoutSelector } from './machine-layout-selector';

interface AddProductDialogProps {
  onCreateProduct: (product: Omit<Product, 'id' | 'order'>) => Promise<void>;
}

const formSchema = z.object({
  name: z.string().min(2, { message: 'Le nom doit contenir au moins 2 caractères.' }),
  price: z.coerce.number().positive({ message: 'Le prix doit être un nombre positif.' }),
  quantity: z.coerce.number().int().min(0, { message: 'La quantité ne peut pas être négative.' }),
  location: z.string().optional(),
  description: z.string().min(10, { message: 'La description doit contenir au moins 10 caractères.' }),
  imageId: z.string().min(1, { message: "L'image est requise." }),
  useRelay: z.boolean().default(false),
  nutrition: z.object({
    calories: z.coerce.number().min(0).optional(),
    fat: z.string().optional(),
    sugar: z.string().optional(),
    protein: z.string().optional(),
  }).optional(),
}).refine((data) => {
  // Location is required unless useRelay is true
  if (!data.useRelay && !data.location) {
    return false;
  }
  // If location is provided, validate its format
  if (data.location && !(/^([1-8][0-9])$/.test(data.location.trim()) || /^([A-H][1-8])$/i.test(data.location.trim()))) {
    return false;
  }
  return true;
}, {
  message: "L'emplacement est requis pour les produits sans relais (format: 10-89 ou A1-H8)",
});

export function AddProductDialog({ onCreateProduct }: AddProductDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      price: 0,
      quantity: 0,
      location: '',
      description: '',
      imageId: '',
      useRelay: false,
      nutrition: {
        calories: 0,
        fat: '',
        sugar: '',
        protein: '',
      }
    },
  });

  const useRelay = form.watch('useRelay');

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const productData: Omit<Product, 'id' | 'order'> = {
      name: values.name,
      price: values.price,
      quantity: values.quantity,
      location: values.location || '', // Empty string for relay products
      description: values.description,
      imageId: values.imageId,
      useRelay: values.useRelay,
    };
    
    if (values.nutrition && (values.nutrition.calories || values.nutrition.fat || values.nutrition.sugar || values.nutrition.protein)) {
        productData.nutrition = {
            calories: values.nutrition.calories || 0,
            fat: values.nutrition.fat || '0g',
            sugar: values.nutrition.sugar || '0g',
            protein: values.nutrition.protein || '0g',
        }
    }

    await onCreateProduct(productData);
    form.reset();
    setIsOpen(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-5 w-5" />
          Ajouter un Produit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un nouveau produit</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left column: Image and basic info */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="imageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image du produit</FormLabel>
                      <FormControl>
                        <ImageSelector value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom du produit</FormLabel>
                      <FormControl>
                        <Input placeholder="ex: Barre Protéinée" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prix</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="ex: 2.50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantité</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="ex: 20" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="useRelay"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="h-4 w-4 mt-0.5 rounded border-gray-300"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Utiliser le relais GPIO4</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Active le relais direct (700ms) au lieu de la séquence clavier
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Right column: Location, description and nutrition */}
              <div className="space-y-4">
                {!useRelay && (
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emplacement dans la machine</FormLabel>
                        <FormControl>
                          <MachineLayoutSelector
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {useRelay && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>Produit relais:</strong> L'emplacement n'est pas requis pour les produits utilisant le relais GPIO4.
                    </p>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Décrivez le produit..." rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-3">
                  <h3 className="text-lg font-medium">Faits Nutritionnels (Optionnel)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="nutrition.calories"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Calories</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="ex: 180" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nutrition.fat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Matières grasses</FormLabel>
                          <FormControl>
                            <Input placeholder="ex: 3g" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nutrition.sugar"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sucre</FormLabel>
                          <FormControl>
                            <Input placeholder="ex: 5g" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nutrition.protein"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Protéines</FormLabel>
                          <FormControl>
                            <Input placeholder="ex: 25g" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Annuler</Button>
              </DialogClose>
              <Button type="submit">Créer le produit</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
