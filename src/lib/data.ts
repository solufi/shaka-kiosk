import type { Product, Sale } from '@/lib/types';

export const initialProducts: Omit<Product, 'id'>[] = [
  { name: 'Shake Protéiné Choco', price: 3.50, quantity: 15, imageId: 'protein-shake-1', description: 'Un shake protéiné crémeux et délicieux, parfait pour la récupération post-entraînement. 25g de protéines par bouteille.', order: 0, nutrition: { calories: 180, fat: '3g', sugar: '5g', protein: '25g' } },
  { name: 'Barre Énergétique Avoine & Miel', price: 2.50, quantity: 20, imageId: 'energy-bar-1', description: 'Une barre énergétique moelleuse remplie d\'avoine complète et de miel naturel pour une énergie durable.', order: 1, nutrition: { calories: 250, fat: '10g', sugar: '15g', protein: '10g' } },
  { name: 'Boisson Pré-entraînement', price: 3.00, quantity: 12, imageId: 'pre-workout-1', description: 'Améliorez votre concentration et votre énergie avant votre séance d\'entraînement. Zéro sucre, goût explosif.', order: 2, nutrition: { calories: 5, fat: '0g', sugar: '0g', protein: '0g' } },
  { name: 'Sachet de BCAA Acides Aminés', price: 2.75, quantity: 18, imageId: 'bcaa-1', description: 'Accélérez la récupération musculaire et réduisez la fatigue avec ce mélange d\'acides aminés à chaîne ramifiée au goût de baies.', order: 3, nutrition: { calories: 10, fat: '0g', sugar: '0g', protein: '0g' } },
  { name: 'Eau Électrolyte Améliorée', price: 2.25, quantity: 25, imageId: 'electrolyte-water-1', description: 'Restez hydraté et reconstituez les électrolytes essentiels perdus pendant l\'exercice. Zéro calorie.', order: 4, nutrition: { calories: 0, fat: '0g', sugar: '0g', protein: '0g' } },
  { name: 'Sachet de Créatine Monohydrate', price: 1.75, quantity: 0, imageId: 'creatine-1', description: 'Une portion unique de 5g de créatine monohydrate pure pour augmenter la force et la puissance.', order: 5, nutrition: { calories: 0, fat: '0g', sugar: '0g', protein: '0g' } },
  { name: 'Barre Protéinée Végétalienne', price: 2.75, quantity: 14, imageId: 'vegan-bar-1', description: 'Une barre protéinée 100% végétale avec 15g de protéines. Délicieuse et sans produits laitiers.', order: 6, nutrition: { calories: 230, fat: '9g', sugar: '12g', protein: '15g' } },
  { name: 'Shot de Gingembre Énergisant', price: 3.25, quantity: 10, imageId: 'ginger-shot-1', description: 'Un shot épicé et entièrement naturel de gingembre et de curcuma pour un regain d\'énergie et de concentration sans caféine.', order: 7, nutrition: { calories: 35, fat: '0g', sugar: '7g', protein: '1g' } },
];

export const salesData: Omit<Sale, 'id' | 'vendingMachineId' | 'productId' | 'saleDate' | 'amount'>[] = [
  { productName: 'Shake Protéiné Choco', quantity: 2, date: '2023-10-26' },
  { productName: 'Barre Énergétique Avoine & Miel', quantity: 1, date: '2023-10-26' },
  { productName: 'Eau Électrolyte Améliorée', quantity: 3, date: '2023-10-27' },
  { productName: 'Boisson Pré-entraînement', quantity: 2, date: '2023-10-27' },
  { productName: 'Sachet de BCAA Acides Aminés', quantity: 1, date: '2023-10-28' },
  { productName: 'Shake Protéiné Choco', quantity: 3, date: '2023-10-28' },
  { productName: 'Barre Protéinée Végétalienne', quantity: 2, date: '2023-10-29' },
  { productName: 'Shot de Gingembre Énergisant', quantity: 1, date: '2023-10-29' },
];
