import type { Timestamp } from 'firebase/firestore';

export type Product = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageId: string;
  description: string;
  location: string;
  order: number;
  useRelay?: boolean; // Use GPIO4 relay instead of keypad sequence
  nutrition?: {
    calories: number;
    fat: string;
    sugar: string;
    protein: string;
  };
};

export type CartItem = Product & {
  orderQuantity: number;
};

export type Sale = {
  id: string;
  vendingMachineId: string;
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
  saleDate: Timestamp;
};
