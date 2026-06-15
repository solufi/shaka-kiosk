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
const MAX_ATTEMPTS = 12;

const FLEET_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FLEET_URL) ||
  'https://fleet.shakadistribution.ca';

export interface QueuedRedemption {
  idempotencyKey: string;
  code: string;
  machineId: string;
  machineName?: string;
  productName: string;
  productPrice: number;
  enqueuedAt: number;
  attempts: number;
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
    // localStorage full / unavailable — nothing else we can do
  }
}

/**
 * Add a redemption to the queue. Returns the generated idempotency key.
 */
export function enqueueRedemption(input: {
  code: string;
  machineId: string;
  machineName?: string;
  productName: string;
  productPrice: number;
}): string {
  const entry: QueuedRedemption = {
    idempotencyKey: genKey(),
    code: input.code,
    machineId: input.machineId,
    machineName: input.machineName,
    productName: input.productName,
    productPrice: input.productPrice,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
  write([...read(), entry]);
  return entry.idempotencyKey;
}

let flushing = false;

/**
 * Attempt to POST every queued redemption. Successful or definitively-rejected
 * entries are dropped; transient (network / 5xx) failures are kept and retried
 * later, up to MAX_ATTEMPTS.
 */
export async function flushRedemptions(): Promise<void> {
  if (flushing) return;
  const list = read();
  if (list.length === 0) return;

  flushing = true;
  const remaining: QueuedRedemption[] = [];

  try {
    for (const item of list) {
      try {
        const res = await fetch(`${FLEET_URL}/api/promo-codes/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: item.code,
            machineId: item.machineId,
            machineName: item.machineName,
            redeem: true,
            productName: item.productName,
            productPrice: item.productPrice,
            idempotencyKey: item.idempotencyKey,
          }),
        });

        if (res.ok) {
          // The server made a definitive decision (recorded, deduplicated, or
          // rejected for a permanent reason like an invalid code / reached
          // limit). Either way, stop retrying this entry.
          await res.json().catch(() => undefined);
          continue;
        }

        // Non-2xx → likely transient (5xx, proxy). Retry later.
        const attempts = item.attempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts });
        }
      } catch {
        // Network failure → keep for retry.
        const attempts = item.attempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts });
        }
      }
    }
    write(remaining);
  } finally {
    flushing = false;
  }
}
