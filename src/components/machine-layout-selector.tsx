'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface MachineLayoutSelectorProps {
  value?: string;
  onChange: (location: string) => void;
  disabled?: boolean;
}

interface Slot {
  id: string;
  code: string;
  row: number;
  col: number;
  occupied?: boolean;
  productName?: string;
}

// Generate numeric layout (rows 1-8, cols 0-9 => codes 10-89)
const generateMachineLayout = (): Slot[] => {
  const slots: Slot[] = [];
  const rows = 8;
  const cols = 10;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const code = `${row + 1}${col}`; // 10..89
      slots.push({
        id: `slot-${row}-${col}`,
        code,
        row,
        col,
      });
    }
  }
  
  return slots;
};

export function MachineLayoutSelector({ value, onChange, disabled }: MachineLayoutSelectorProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(value || null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  
  // In a real app, this would come from Firestore to show occupied slots
  const [occupiedSlots] = useState<Set<string>>(new Set());
  
  const slots = generateMachineLayout();
  
  const handleSlotClick = (slot: Slot) => {
    if (disabled) return;
    
    if (occupiedSlots.has(slot.code)) {
      // Slot is occupied, could show product details or allow override
      return;
    }
    
    setSelectedSlot(slot.code);
    onChange(slot.code);
  };
  
  const handleDirectInput = (code: string) => {
    if (disabled) return;
    
    const trimmed = code.trim();

    // Accept numeric codes 10-89
    const numeric = trimmed.match(/^([1-8])([0-9])$/);
    if (numeric) {
      setSelectedSlot(trimmed);
      onChange(trimmed);
      return;
    }

    // Backwards compatible: accept A1-H8
    const legacy = /^[A-H][1-8]$/i.test(trimmed);
    if (legacy) {
      const upperCode = trimmed.toUpperCase();
      setSelectedSlot(upperCode);
      onChange(upperCode);
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-gray-700">
        Sélectionnez l'emplacement dans la machine:
      </div>
      
      {/* Visual Machine Layout */}
      <div className="bg-gray-50 p-4 rounded-lg border">
        <div className="mb-2 text-xs text-gray-500 text-center">
          Grille de la machine (10-89)
        </div>
        
        {/* Column headers */}
        <div className="grid grid-cols-11 gap-1 mb-1">
          <div className="w-8"></div> {/* Empty corner for row labels */}
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="text-center text-xs font-medium text-gray-600">
              {i}
            </div>
          ))}
        </div>
        
        {/* Machine slots */}
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="grid grid-cols-11 gap-1 mb-1">
            {/* Row header */}
            <div className="w-8 text-center text-xs font-medium text-gray-600 flex items-center justify-center">
              {row + 1}
            </div>
            
            {/* Slots in this row */}
            {Array.from({ length: 10 }, (_, col) => {
              const slot = slots.find(s => s.row === row && s.col === col)!;
              const isSelected = selectedSlot === slot.code;
              const isOccupied = occupiedSlots.has(slot.code);
              const isHovered = hoveredSlot === slot.id;
              
              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={disabled || isOccupied}
                  onClick={() => handleSlotClick(slot)}
                  onMouseEnter={() => setHoveredSlot(slot.id)}
                  onMouseLeave={() => setHoveredSlot(null)}
                  className={cn(
                    "w-8 h-8 rounded border-2 text-xs font-medium transition-all",
                    isSelected && "bg-blue-500 text-white border-blue-600",
                    !isSelected && isOccupied && "bg-red-100 text-red-700 border-red-300 cursor-not-allowed",
                    !isSelected && !isOccupied && "bg-white border-gray-300 hover:border-gray-400 hover:bg-gray-50",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {slot.code}
                </button>
              );
            })}
          </div>
        ))}
        
        {/* Legend */}
        <div className="mt-3 flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
            <span className="text-gray-600">Disponible</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-gray-600">Sélectionné</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-gray-600">Occupé</span>
          </div>
        </div>
      </div>
      
      {/* Selected location display */}
      {selectedSlot && (
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-900">Emplacement sélectionné:</span>
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
              {selectedSlot}
            </Badge>
          </div>
          {!disabled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedSlot(null);
                onChange('');
              }}
              className="text-blue-600 hover:text-blue-800"
            >
              Effacer
            </Button>
          )}
        </div>
      )}
      
      {/* Manual input option */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Ou entrer directement:</span>
        <input
          type="text"
          disabled={disabled}
          value={selectedSlot || ''}
          onChange={(e) => handleDirectInput(e.target.value)}
          placeholder="10, 23, 89..."
          className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={3}
        />
      </div>
    </div>
  );
}
