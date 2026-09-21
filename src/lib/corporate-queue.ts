'use client';

/**
 * Offline-safe queue for corporate redemptions.
 *
 * A corporate redemption must be recorded on the Fleet Manager so the employer
 * is invoiced for its subsidized share. If the network blips at vend time the
 * record would be lost. This queue persists pending redemptions in
 * localStorage and retries them (on mount and on an interval).
 *
 * Each entry carries a stable `idempotencyKey` so a retry never double-bills:
 * the server deduplicates on that key.
 */

const QUEUE_KEY = 'shaka_corp_redemptions_v1';


const FLEET_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FLEET_URL) ||
  'https://fleet.shakadistribution.ca';

export interface QueuedRedemption {
  idempotencyKey: string;
  code: string;
  machineId: string;
  machineName?: string;
  productId?: string;
  productName: string;
  productPrice: number;
  enqueuedAt: number;
  attempts: number;
  rejected?: string;
}

function genKey(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function read(): QueuedRedemption[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedRedemption[]) : [];
  } catch {
    return [];
  }
}

function write(list: QueuedRedemption[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch {
    throw new Error("Impossible d’enregistrer la participation employeur; vérification requise");
  }
}

/**
 * Add a redemption to the queue. Returns the generated idempotency key.
 */
export function enqueueRedemption(input: {
  code: string;
  machineId: string;
  machineName?: string;
  productId?: string;
  productName: string;
  productPrice: number;
  idempotencyKey?: string;
}): string {
  const entry: QueuedRedemption = {
    idempotencyKey: input.idempotencyKey || genKey(),
    code: input.code,
    machineId: input.machineId,
    machineName: input.machineName,
    productId: input.productId,
    productName: input.productName,
    productPrice: input.productPrice,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
  const existing = read();
  if (!existing.some(item => item.idempotencyKey === entry.idempotencyKey)) write([...existing, entry]);
  return entry.idempotencyKey;
}

let flushing = false;

/**
 * Attempt to POST every queued redemption. Successful or definitively-rejected
 * entries are dropped; transient (network / 5xx) failures are kept and retried
 * later without discarding unrecorded purchases.
 */
export async function flushRedemptions(): Promise<void> {
  if (flushing) return;
  const list = read().filter(item => !item.rejected);
  if (list.length === 0) return;

  flushing = true;
  const remaining: QueuedRedemption[] = [];

  try {
    for (const item of list) {
      try {
        const res = await fetch('http://127.0.0.1:5001/corporate/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: item.code,
            machineId: item.machineId,
            machineName: item.machineName,
            redeem: true,
            productId: item.productId,
            productName: item.productName,
            productPrice: item.productPrice,
            idempotencyKey: item.idempotencyKey,
          }),
        });

        const response = await res.json().catch(() => null);
        if (res.ok && response?.ok && response?.valid) continue;
        if (res.ok && response?.valid === false) {
          remaining.push({ ...item, rejected: response.error || 'Reprise manuelle requise' });
        } else {
          remaining.push({ ...item, attempts: item.attempts + 1 });
        }
      } catch {
        // Network failure → keep for retry.
        const attempts = item.attempts + 1;
        remaining.push({ ...item, attempts });
      }
    }
    // Preserve entries added while fetch was in flight (and retained rejections).
    const processed = new Set(list.map(item => item.idempotencyKey));
    write([...read().filter(item => !processed.has(item.idempotencyKey)), ...remaining]);
  } finally {
    flushing = false;
  }
}
