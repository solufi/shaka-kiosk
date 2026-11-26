import { randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'shaka_admin';
const idleMs = 10 * 60 * 1000;
// Next bundles route handlers separately. They share one kiosk server process.
const kiosk = globalThis as typeof globalThis & { shakaLocalAdminSessions?: Map<string, number> };
const sessions = kiosk.shakaLocalAdminSessions ??= new Map<string, number>();
let failures = 0;
let blockedUntil = 0;

export function localRequest(request: Request): boolean {
  const host = request.headers.get('host') || '';
  const origin = request.headers.get('origin');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) &&
    (!origin || origin === `http://${host}` || origin === `https://${host}`) &&
    request.headers.get('sec-fetch-site') !== 'cross-site';
}

export function login(pin: unknown): string {
  if (Date.now() < blockedUntil) throw new Error('Attendez une minute avant de réessayer');
  const expected = process.env.KIOSK_ADMIN_PIN || '211288';
  const value = typeof pin === 'string' ? pin : '';
  const valid = value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  if (!valid) {
    failures++;
    if (failures >= 5) { blockedUntil = Date.now() + 60000; failures = 0; }
    throw new Error('Mot de passe incorrect');
  }
  failures = 0;
  if (!process.env.AGENT_TOKEN) throw new Error('Identité machine non configurée');
  const now = Date.now();
  for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
  const token = randomBytes(32).toString('hex');
  sessions.set(token, now + idleMs);
  return token;
}

function requestToken(request: Request): string {
  if (!localRequest(request)) return '';
  return request.headers.get('cookie')?.split(';').map(v => v.trim())
    .find(v => v.startsWith(ADMIN_COOKIE + '='))?.slice(ADMIN_COOKIE.length + 1) ?? '';
}

export function sessionExpiry(request: Request, activity = false): number {
  const token = requestToken(request);
  const expiry = sessions.get(token);
  if (!expiry) return 0;
  const now = Date.now();
  if (expiry <= now) {
    sessions.delete(token);
    return 0;
  }
  if (!activity) return expiry;
  const renewed = now + idleMs;
  sessions.set(token, renewed);
  return renewed;
}

export function adminAuthorized(request: Request): boolean {
  return sessionExpiry(request) > 0;
}

export function revokeSession(request: Request): void {
  sessions.delete(requestToken(request));
}

export function cookie(request: Request, value: string): string {
  return `${ADMIN_COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict${value ? '' : '; Max-Age=0'}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
