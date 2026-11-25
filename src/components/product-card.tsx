import { ProductPhoto } from './product-photo';
import {productSellingCents,productDepositCents} from '@/lib/cart-pricing';
import { productDetails } from '@/lib/product-details';
import type { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Edit, PlusCircle, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Separator } from './ui/separator';
import { useState, useEffect } from 'react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from './ui/input';
import { ImageSelector } from './image-selector';

interface PlaceholderImage {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
}

interface ProductCardProps {
  product: Product;
  compact?: boolean;
  employeeMode?: "included" | "paid" | "blocked";
  placeholderImages?: PlaceholderImage[];
  onAddToCart: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onMove: (productId: string, direction: 'up' | 'down') => void;
  isFirst: boolean;
  isLast: boolean;
}

const formSchema = z.object({
  name: z.string().min(2, { message: 'Le nom doit contenir au moins 2 caractères.' }),
  price: z.coerce.number<number>().positive({ message: 'Le prix doit être un nombre positif.' }),
  quantity: z.coerce.number<number>().int().min(0, { message: 'La quantité ne peut pas être négative.' }),
  location: z
    .string()
    .min(1, { message: "L'emplacement est requis (ex: 10)." })
    .refine((v) => /^([1-8][0-9])$/.test(v.trim()) || /^([A-H][1-8])$/i.test(v.trim()), {
      message: "Format invalide. Utilisez 10-89 (ex: 10) ou A1-H8.",
    }),
  imageId: z.string().min(1, { message: "L'image est requise." }),
});


export function ProductCard({ product, compact=false, employeeMode, placeholderImages, onAddToCart, onUpdateProduct, onDeleteProduct, onMove, isFirst, isLast }: ProductCardProps) {
  const details = productDetails(product.description);
  const [detailTab,setDetailTab] = useState<'nutrition'|'description'>('nutrition');
  const [descriptionPage,setDescriptionPage] = useState(0);
  const isSoldOut = product.quantity <= 0;
  const stockLabel = product.stockUnavailable ? 'Stock à vérifier' : isSoldOut ? 'Épuisé' : `${product.quantity} ${product.quantity === 1 ? 'restant' : 'restants'}`;
  const priceLabel=employeeMode==='included'?'Fourni par l’entreprise':employeeMode==='blocked'?'Non autorisé':new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'}).format(productSellingCents(product)/100);
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);
  const [isEditViewOpen, setIsEditViewOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const checkAdmin = () => {
      try {
        const adminStatus = window.localStorage.getItem('shaka:isAdmin') === '1';
        setIsAdmin(adminStatus);
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
    window.addEventListener('storage', checkAdmin);
    window.addEventListener('shaka-admin-changed', checkAdmin);
    return () => {
      window.removeEventListener('storage', checkAdmin);
      window.removeEventListener('shaka-admin-changed', checkAdmin);
    };
  }, []);

  const form = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      location: product.location,
      imageId: product.imageId,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    await onUpdateProduct({
      ...product,
      name: values.name,
      price: values.price,
      quantity: values.quantity,
      location: values.location,
      imageId: values.imageId,
    });
    setIsEditViewOpen(false);
  }
  
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <Dialog open={isDetailViewOpen} onOpenChange={setIsDetailViewOpen}>
        <Card className={`flex flex-col overflow-hidden transition-all hover:shadow-lg ${compact?'catalog-product-card':''}`}>
          <DialogTrigger asChild>
            <div className="catalog-product-trigger cursor-pointer">
              <CardHeader className="catalog-product-header p-0">
                <div className="catalog-product-image relative aspect-square w-full">
                  <ProductPhoto imageId={product.imageId} name={product.name} className="object-contain p-2" />
                  {isSoldOut && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Badge variant="destructive" className="text-lg">{product.stockUnavailable ? "À VÉRIFIER" : "ÉPUISÉ"}</Badge>
                    </div>
                  )}
                  {isAdmin && !compact && (
                    <div className="absolute top-2 right-2 flex flex-col gap-2">
                       <Button
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsDetailViewOpen(false);
                          setIsEditViewOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                             onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={stopPropagation}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Êtes-vous sûr(e) ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Cette action est irréversible. Le produit "{product.name}" sera définitivement supprimé.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDeleteProduct(product.id)}>
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                   {isAdmin && !compact && (
                    <div className="absolute bottom-2 right-2 flex flex-col gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 bg-white/80 backdrop-blur-sm"
                        disabled={isFirst}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMove(product.id, 'up');
                        }}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 bg-white/80 backdrop-blur-sm"
                        disabled={isLast}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMove(product.id, 'down');
                        }}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="catalog-product-info flex-1 p-4">
                <CardTitle className="catalog-product-name text-lg font-bold">{product.name}</CardTitle>
                {productDepositCents(product)>0&&employeeMode!=="included"&&employeeMode!=="blocked"&&<p className="text-[11px] text-muted-foreground">Dont ${(productDepositCents(product)/100).toFixed(2)} de consigne</p>}<div className="catalog-product-price-row"><p className="mt-2 text-2xl font-headline font-bold text-primary">{priceLabel}</p>{compact&&<span className="text-xs text-muted-foreground" aria-label={`Stock de ${product.name} : ${stockLabel}`}>{isSoldOut?stockLabel:`${product.quantity} disp.`}</span>}</div>
              </CardContent>
            </div>
          </DialogTrigger>
          <CardFooter className="catalog-product-footer flex-wrap gap-2 p-4 pt-0">
            <Badge variant={isSoldOut ? "destructive" : "outline"} className={`${compact?'hidden':''} shrink-0 whitespace-nowrap py-2`} aria-label={`Stock de ${product.name} : ${product.stockUnavailable ? "indisponible" : Math.max(0, product.quantity)}`}>
              {stockLabel}
            </Badge>
            <Button
              className="catalog-add-button"
              onClick={() => onAddToCart(product)}
              disabled={isSoldOut || employeeMode==='blocked'}
              aria-label={`Ajouter ${product.name} au panier`}
            >
              <PlusCircle aria-hidden="true" />
              <span>Ajouter</span>
            </Button>
          </CardFooter>
        </Card>

        <DialogContent className="product-detail-dialog" aria-describedby={undefined}>
          <DialogHeader className="product-detail-heading">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Découvrir le produit</p>
            <DialogTitle className="product-detail-title">{product.name}</DialogTitle>
          </DialogHeader>
          <div className="product-detail-body">
            <div className="product-detail-visual">
              <div className="product-detail-photo"><ProductPhoto imageId={product.imageId} name={product.name} className="object-contain p-5" sizes="(max-width: 640px) 70vw, 40vw" /></div>
              <div className="flex items-center justify-between gap-3">
                <span className="product-detail-price text-primary">{priceLabel}</span>{productDepositCents(product)>0&&employeeMode!=="included"&&employeeMode!=="blocked"&&<p className="text-xs text-muted-foreground">Inclut ${(productDepositCents(product)/100).toFixed(2)} de consigne non taxable</p>}
                <Badge variant={isSoldOut?'destructive':'outline'}>{stockLabel}</Badge>
              </div>
            </div>
            <div className="product-detail-information">
              <div className="flex gap-2" role="tablist" aria-label="Informations produit">
                <button type="button" role="tab" aria-selected={detailTab==='nutrition'} className={`product-detail-tab ${detailTab==='nutrition'?'is-active':''}`} onClick={()=>setDetailTab('nutrition')}>Nutrition et allergènes</button>
                <button type="button" role="tab" aria-selected={detailTab==='description'} className={`product-detail-tab ${detailTab==='description'?'is-active':''}`} onClick={()=>setDetailTab('description')}>À propos</button>
              </div>
              {detailTab==='nutrition'?<div role="tabpanel" aria-label="Nutrition et allergènes" className="product-detail-facts">
                {product.nutrition?<div className="product-detail-nutrition">
                  {[["Calories",product.nutrition.calories],["Protéines",product.nutrition.protein],["Matières grasses",product.nutrition.fat],["Sucres",product.nutrition.sugar]].map(([label,value])=><div key={label} className="rounded-xl border bg-slate-50 px-4 py-3"><span className="block text-xs text-muted-foreground">{label}</span><strong className="block text-xl">{value}</strong></div>)}
                </div>:<p className="text-muted-foreground">Valeurs nutritives non renseignées.</p>}
                <div className="product-detail-allergens">
                  <h3 className="font-semibold">Allergènes</h3>
                  {details.contains && <p><strong>Contient : </strong>{details.contains}</p>}
                  {details.mayContain && <p><strong>Peut contenir : </strong>{details.mayContain}</p>}
                  {!details.contains && !details.mayContain && <p className="text-muted-foreground">Information non renseignée. Consultez l’emballage.</p>}
                </div>
              </div>:<div role="tabpanel" aria-label="À propos" className="flex min-h-0 flex-col gap-3">
                <p className="product-detail-description">{details.pages[descriptionPage] || 'Description non renseignée.'}</p>
                {details.pages.length>1 && <div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={descriptionPage===0} onClick={()=>setDescriptionPage(p=>p-1)}>Précédent</Button><span className="text-sm">{descriptionPage+1} / {details.pages.length}</span><Button variant="outline" size="sm" disabled={descriptionPage===details.pages.length-1} onClick={()=>setDescriptionPage(p=>p+1)}>Suivant</Button></div>}
              </div>}
            </div>
          </div>
          <DialogFooter className="product-detail-actions">
            <DialogClose asChild><Button variant="outline" size="lg">Fermer</Button></DialogClose>
            <DialogClose asChild><Button size="lg" onClick={()=>onAddToCart(product)} disabled={isSoldOut || employeeMode==='blocked'} aria-label={`Ajouter ${product.name} au panier`}><PlusCircle aria-hidden="true" className="h-4 w-4"/>Ajouter</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditViewOpen} onOpenChange={setIsEditViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le Produit</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prix</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
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
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emplacement</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Annuler</Button>
                </DialogClose>
                <Button type="submit">Sauvegarder</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
