// Password login with a signed session cookie, plus a simple lockout after
// repeated wrong passwords. Jarvis can read mail and control the laptop, so
// every page and connection except the login page requires a valid session.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'jarvis_session';
const MAX_AGE_SECONDS = 30 * 24 * 3600;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map();

export function passwordConfigured() {
  return (process.env.JARVIS_PASSWORD?.trim().length ?? 0) >= 8;
}

function secret() {
  return createHash('sha256').update(`jarvis-session:${process.env.SESSION_SECRET || process.env.JARVIS_PASSWORD}`).digest();
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part.trim(), ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}

export function isAuthenticated(request) {
  if (!passwordConfigured()) return false;
  const value = parseCookies(request.headers.cookie)[COOKIE];
  if (!value) return false;
  const [expires, signature] = value.split('.');
  return Boolean(expires && signature) && safeEqual(signature, sign(expires)) && Number(expires) > Date.now();
}

export function sessionCookie(secure) {
  const expires = String(Date.now() + MAX_AGE_SECONDS * 1000);
  return `${COOKIE}=${expires}.${sign(expires)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearedCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

// Returns { ok } or { locked, retryAfterSeconds }.
export function attemptLogin(clientId, password) {
  const now = Date.now();
  let entry = failures.get(clientId);
  if (entry?.lockedUntil > now) return { ok: false, locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  if (entry?.lockedUntil) entry = null; // lockout expired, start counting again
  if (passwordConfigured() && safeEqual(String(password ?? ''), process.env.JARVIS_PASSWORD.trim())) {
    failures.delete(clientId);
    return { ok: true };
  }
  if (failures.size > 1000) failures.clear();
  const count = (entry?.count ?? 0) + 1;
  const locked = count >= MAX_FAILURES;
  failures.set(clientId, { count, lockedUntil: locked ? now + LOCKOUT_MS : 0 });
  return { ok: false, locked, retryAfterSeconds: locked ? LOCKOUT_MS / 1000 : 0 };
}

export function tokenMatches(header, expected) {
  if (!expected) return false;
  const match = /^Bearer (.+)$/.exec(header ?? '');
  return Boolean(match) && safeEqual(match[1].trim(), expected.trim());
}
