// Customer list for the website business: shops the user approaches, their
// status and the preview website made for them. Stored on the user's devices
// and synced through the server like the shopping list.
import { randomUUID } from 'node:crypto';

export const STATUSES = ['neu', 'angesprochen', 'interessiert', 'angebot_gesendet', 'gekauft', 'abgelehnt'];
// Advertising e-mails need the recipient's consent in Germany (§ 7 UWG), also
// for businesses. Offers may only go to shops that agreed to receive one.
export const OFFER_ALLOWED = ['interessiert', 'angebot_gesendet', 'gekauft'];
const MAX_CUSTOMERS = 100;
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

function text(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

const key = (value) => text(value, 80).toLocaleLowerCase('de-DE');

function cleanCustomer(input) {
  const name = text(input?.name, 80);
  if (!name) return null;
  const email = text(input.email, 120);
  const site = input.site && typeof input.site === 'object' && /^\/site\.html#[A-Za-z0-9_-]{10,20000}$/.test(String(input.site.path ?? ''))
    ? { path: input.site.path, title: text(input.site.title, 60) }
    : null;
  return {
    id: typeof input.id === 'string' && /^[a-z0-9]{6,12}$/.test(input.id) ? input.id : randomUUID().replace(/-/g, '').slice(0, 8),
    name,
    branche: text(input.branche, 40),
    ort: text(input.ort, 120),
    email: EMAIL.test(email) ? email : '',
    status: STATUSES.includes(input.status) ? input.status : 'neu',
    preis: text(input.preis, 30),
    notiz: text(input.notiz, 600),
    site,
    aktualisiert: text(input.aktualisiert, 30) || new Date().toISOString()
  };
}

export function sanitizeCustomers(value) {
  const seenIds = new Set();
  const seenNames = new Set();
  const list = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const customer = cleanCustomer(raw);
    if (!customer || seenIds.has(customer.id) || seenNames.has(key(customer.name))) continue;
    seenIds.add(customer.id);
    seenNames.add(key(customer.name));
    list.push(customer);
    if (list.length >= MAX_CUSTOMERS) break;
  }
  return list;
}

// Finds a customer by id, exact name, or a name part that matches only one.
export function findCustomer(list, ref) {
  const wanted = key(ref);
  if (!wanted) return null;
  const exact = list.find((customer) => customer.id === ref || key(customer.name) === wanted);
  if (exact) return exact;
  const partial = list.filter((customer) => key(customer.name).includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}

export function upsertCustomer(list, fields) {
  const next = sanitizeCustomers(list);
  const existing = findCustomer(next, fields.id || fields.name);
  const given = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  // A match by name keeps the original spelling of the name.
  const merged = cleanCustomer({ ...(existing || {}), ...given, ...(existing ? { id: existing.id, name: existing.name } : {}), aktualisiert: new Date().toISOString() });
  if (!merged) throw new Error('Der Kunde braucht einen Namen.');
  if (existing) return { list: next.map((customer) => (customer.id === existing.id ? merged : customer)), customer: merged, created: false };
  if (next.length >= MAX_CUSTOMERS) throw new Error('Die Kundenliste ist voll (100 Einträge).');
  return { list: [...next, merged], customer: merged, created: true };
}

// Short summary for the AI: no website links (they are long and not needed).
export function summarize(customer) {
  return {
    id: customer.id,
    name: customer.name,
    branche: customer.branche || undefined,
    ort: customer.ort || undefined,
    status: customer.status,
    email: customer.email || undefined,
    preis: customer.preis || undefined,
    notiz: customer.notiz || undefined,
    websiteVorschau: Boolean(customer.site)
  };
}
