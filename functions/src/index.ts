import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import cors from "cors";

// Initialize Firebase Admin
admin.initializeApp();

// Initialize CORS
const corsHandler = cors({ origin: true });

function errorToMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

// Convert location code (A1, B3, etc.) to keypad sequence
function locationToSequence(location: string): string {
  const trimmed = (location || '').trim();

  // Numeric format: 10-89 (row 1-8, col 0-9)
  const numeric = trimmed.match(/^([1-8])([0-9])$/);
  if (numeric) {
    return `${numeric[1]}${numeric[2]}`;
  }

  // Legacy format: A1-H8 -> convert to numeric row/col then add #
  const legacy = trimmed.match(/^([A-H])([1-8])$/i);
  if (legacy) {
    const rowNum = legacy[1].toUpperCase().charCodeAt(0) - 65 + 1; // A=1..H=8
    const colNum = parseInt(legacy[2], 10) - 1; // 1..8 => 0..7
    return `${rowNum}${colNum}`;
  }

  throw new Error(`Invalid location format: ${location}. Expected format: 10-89 or A1-H8`);
}

// Vend product from specific location
export const vendProduct = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { location, machineId = 'default-machine' } = req.body;

      if (!location) {
        return res.status(400).json({ error: 'Location is required' });
      }

      // Validate location format
      const sequence = locationToSequence(location);
      
      // Log the vending attempt
      const db = admin.firestore();
      const vendRef = await db.collection('vendOperations').add({
        location,
        sequence,
        machineId,
        status: 'pending',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // In a real implementation, this would:
      // 1. Send the sequence to the Raspberry Pi via HTTP/WebSocket
      // 2. Wait for drop sensor confirmation
      // 3. Update the operation status
      
      // For now, simulate the vending process
      setTimeout(async () => {
        try {
          // Simulate successful vend (90% success rate for demo)
          const success = Math.random() > 0.1;
          
          await vendRef.update({
            status: success ? 'success' : 'failed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            dropDetected: success,
          });

          if (success) {
            // Update product inventory
            const productsQuery = await db.collection('products')
              .where('location', '==', location)
              .limit(1)
              .get();
            
            if (!productsQuery.empty) {
              const productDoc = productsQuery.docs[0];
              const currentQuantity = productDoc.data().quantity || 0;
              
              if (currentQuantity > 0) {
                await productDoc.ref.update({
                  quantity: currentQuantity - 1,
                  lastVended: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
            }

            // Record the sale
            await db.collection('sales').add({
              location,
              machineId,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              status: 'completed',
            });
          }
        } catch (error) {
          console.error('Error updating vend operation:', error);
          await vendRef.update({
            status: 'error',
            error: errorToMessage(error),
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }, 2000); // Simulate 2-second vending process

      return res.status(200).json({
        success: true,
        message: `Vending sequence ${sequence} sent to machine ${machineId}`,
        operationId: vendRef.id,
        sequence,
      });

    } catch (error) {
      console.error('Vend error:', error);
      return res.status(500).json({
        error: errorToMessage(error),
        success: false,
      });
    }
  });
});

// Get machine status
export const getMachineStatus = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const { machineId = 'default-machine' } = req.query;

      const db = admin.firestore();
      
      // Get recent operations
      const recentOps = await db.collection('vendOperations')
        .where('machineId', '==', machineId)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      // Get products with their locations
      const productsSnapshot = await db.collection('products')
        .where('quantity', '>', 0)
        .get();

      const products: any[] = [];
      productsSnapshot.forEach(doc => {
        products.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      // Calculate machine statistics
      const totalSlots = 40; // 8x5 grid
      const occupiedSlots = products.length;
      const totalItems = products.reduce((sum, p) => sum + (p.quantity || 0), 0);

      return res.status(200).json({
        machineId,
        status: 'online',
        totalSlots,
        occupiedSlots,
        availableSlots: totalSlots - occupiedSlots,
        totalItems,
        products,
        recentOperations: recentOps.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      });

    } catch (error) {
      console.error('Status error:', error);
      return res.status(500).json({
        error: errorToMessage(error),
      });
    }
  });
});

// Get vend operation status
export const getVendStatus = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const { operationId } = req.query;

      if (!operationId) {
        return res.status(400).json({ error: 'Operation ID is required' });
      }

      const db = admin.firestore();
      const operationDoc = await db.collection('vendOperations').doc(operationId as string).get();

      if (!operationDoc.exists) {
        return res.status(404).json({ error: 'Operation not found' });
      }

      return res.status(200).json({
        id: operationDoc.id,
        ...operationDoc.data(),
      });

    } catch (error) {
      console.error('Vend status error:', error);
      return res.status(500).json({
        error: errorToMessage(error),
      });
    }
  });
});

// Configure machine settings
export const configureMachine = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { machineId = 'default-machine', settings } = req.body;

      if (!settings) {
        return res.status(400).json({ error: 'Settings are required' });
      }

      const db = admin.firestore();
      await db.collection('machines').doc(machineId).set({
        ...settings,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.status(200).json({
        success: true,
        message: `Machine ${machineId} configured successfully`,
      });

    } catch (error) {
      console.error('Configure error:', error);
      return res.status(500).json({
        error: errorToMessage(error),
      });
    }
  });
});
