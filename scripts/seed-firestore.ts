import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { initialProducts } from '../src/lib/data';
import { firebaseConfig } from '../src/firebase/config';

async function seedFirestore() {
  console.log('Using Firebase config:', firebaseConfig);
  const firebaseApp = initializeApp(firebaseConfig);
  const db = getFirestore(firebaseApp);
  const productsCollection = collection(db, 'products');

  const batch = writeBatch(db);

  initialProducts.forEach((product) => {
    // In Firestore, it's common to auto-generate document IDs.
    const docRef = doc(productsCollection); // Create a new document reference with an auto-generated ID
    batch.set(docRef, product);
  });

  try {
    await batch.commit();
    console.log(`Successfully seeded ${initialProducts.length} products.`);
  } catch (error) {
    console.error('Error seeding Firestore:', error);
  } finally {
    // In a script, you might want to explicitly exit the process
    // For Node.js:
    process.exit(0);
  }
}

seedFirestore();
