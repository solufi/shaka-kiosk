'use client';
import { useState } from 'react';
import Image from 'next/image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlaceHolderImages, type ImagePlaceholder } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface ImageSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ImageSelector({ value, onChange }: ImageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedImage = PlaceHolderImages.find(img => img.id === value);

  return (
     <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full h-auto justify-start font-normal"
        >
          <div className="flex items-center gap-4 w-full">
            {selectedImage ? (
                <>
                    <div className="relative h-12 w-12 flex-shrink-0">
                        <Image
                        src={selectedImage.imageUrl}
                        alt={selectedImage.description}
                        fill
                        className="object-contain rounded-md"
                        />
                    </div>
                    <span className="font-semibold">{selectedImage.description}</span>
                </>
            ) : (
              <span>Sélectionnez une image</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto" align="start">
         <div className="grid grid-cols-3 gap-2 p-2 max-h-96 overflow-y-auto">
            {PlaceHolderImages.map((image) => (
                <button
                    key={image.id}
                    type="button"
                    className={cn(
                        "relative aspect-square w-24 rounded-md overflow-hidden ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                         value === image.id && "ring-2 ring-primary"
                    )}
                    onClick={() => {
                        onChange(image.id);
                        setIsOpen(false);
                    }}
                >
                    <Image
                        src={image.imageUrl}
                        alt={image.description}
                        fill
                        className="object-contain transition-transform hover:scale-105"
                    />
                    {value === image.id && (
                        <div className="absolute inset-0 bg-primary/70 flex items-center justify-center">
                            <Check className="h-8 w-8 text-primary-foreground" />
                        </div>
                    )}
                </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
