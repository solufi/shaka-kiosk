import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'shaka_admin';
const lifetime = 15 * 60;
let failures = 0;
let blockedUntil = 0;

export function localRequest(request: Request): boolean {
  const host = request.headers.get('host') || '';
  const origin = request.headers.get('origin');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) &&
    (!origin || origin === `http://${host}` || origin === `https://${host}`) &&
    request.headers.get('sec-fetch-site') !== 'cross-site';
}

function signature(value: string): string {
  const secret = process.env.AGENT_TOKEN;
  if (!secret) throw new Error('Identité machine non configurée');
  return createHmac('sha256', secret).update('kiosk-admin:' + value).digest('hex');
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
  const payload = `${Math.floor(Date.now() / 1000) + lifetime}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${signature(payload)}`;
}

export function adminAuthorized(request: Request): boolean {
  if (!localRequest(request)) return false;
  const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(ADMIN_COOKIE + '='))?.slice(ADMIN_COOKIE.length + 1);
  if (!token || !/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, nonce, signed] = token.split('.');
  const now = Math.floor(Date.now() / 1000);
  if (Number(expiry) <= now || Number(expiry) > now + lifetime) return false;
  try { return timingSafeEqual(Buffer.from(signed, 'hex'), Buffer.from(signature(`${expiry}.${nonce}`), 'hex')); }
  catch { return false; }
}

export function cookie(request: Request, value: string): string {
  return `${ADMIN_COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${value ? lifetime : 0}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
