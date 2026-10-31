// Ordering food by phone: find the restaurant (OpenStreetMap: phone, website),
// read its menu from the website (with the money mode's AI), check whether the
// wished dishes exist and build the order that Jarvis reads back before calling.
import { findBusiness } from './places.js';
import { generateJson, llmProvider } from './llm.js';

const MENU_CACHE_MS = 6 * 60 * 60 * 1000;
const menuCache = new Map();
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// German numbers → +49…; returns null if it is not a plausible phone number.
export function normalizePhone(value) {
  let number = String(value ?? '').replace(/\(0\)/g, '').replace(/[\s\-/().]/g, '');
  if (number.startsWith('00')) number = `+${number.slice(2)}`;
  else if (number.startsWith('0')) number = `+49${number.slice(1)}`;
  else if (/^49\d{6,}$/.test(number)) number = `+${number}`;
  return /^\+[1-9]\d{6,14}$/.test(number) ? number : null;
}

// "+49301234567" → "030 1234567", "+4917612345678" → "0176 12345678".
export function spokenPhone(e164) {
  if (!e164.startsWith('+49')) return e164;
  const national = `0${e164.slice(3)}`;
  const prefix = /^0(30|40|69|89)/.test(national) ? 3 : /^01/.test(national) ? 4 : /^0(2|3|4|5|6|7|8|9)\d1/.test(national) ? 4 : 5;
  return `${national.slice(0, prefix)} ${national.slice(prefix)}`;
}

export async function findRestaurant(name, town, { fetchImpl = fetch } = {}) {
  const query = [text(name, 80), text(town, 60)].filter(Boolean).join(', ');
  if (!text(name, 80)) throw new Error('Bei welchem Restaurant soll ich bestellen?');
  const hits = await findBusiness(query, { fetchImpl, limit: 3 });
  return hits.map((hit) => ({ ...hit, phone: normalizePhone(hit.phone) || '' }));
}

// Only public web pages – never addresses inside the server's own network.
function safeUrl(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[|::)/i.test(url.hostname) || !url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchPage(url, fetchImpl) {
  const response = await fetchImpl(url.href, { headers: { 'user-agent': 'Mozilla/5.0 (Jarvis-Assistant; Speisekarte lesen)', accept: 'text/html,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Website antwortet mit Status ${response.status}`);
  return (await response.text()).slice(0, 1_500_000);
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&euro;/g, '€').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Reads the menu from the restaurant's website (also follows a link named
// "Speisekarte"/"Menü"). Many pizzerias only have a PDF, an image or a
// delivery-portal page – then the menu stays unknown and Jarvis says so.
export async function readMenu(website, { fetchImpl = fetch, generate = generateJson } = {}) {
  const url = safeUrl(website);
  if (!url) throw new Error('Keine gültige Website für die Speisekarte.');
  const cached = menuCache.get(url.href);
  if (cached && Date.now() - cached.at < MENU_CACHE_MS) return cached.menu;
  if (!llmProvider() && generate === generateJson) throw new Error('Zum Lesen der Speisekarte fehlt ein KI-Schlüssel (GROQ_API_KEY, siehe Geld-Modus).');
  let html = await fetchPage(url, fetchImpl);
  let content = htmlToText(html);
  if (!/(\d+[.,]\d{2}\s*€|€\s*\d+[.,]\d{2}|\d+[.,]\d{2}\s*EUR)/i.test(content)) {
    const link = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .find(([, href, label]) => /speisekarte|menu|menü|karte|bestellen/i.test(`${href} ${label}`) && !/\.(pdf|jpe?g|png)(\?|$)/i.test(href));
    if (link) {
      const next = safeUrl(new URL(link[1], url).href);
      if (next && next.hostname === url.hostname) {
        html = await fetchPage(next, fetchImpl);
        content = htmlToText(html);
      }
    }
  }
  if (content.length < 60) throw new Error('Auf der Website steht keine lesbare Speisekarte (vielleicht nur als Bild oder PDF).');
  const reply = await generate({
    system: 'Du liest Speisekarten von Restaurant-Websites aus. Antworte nur mit JSON. Erfinde nichts: nur Gerichte, die wirklich im Text stehen.',
    prompt: `Website-Text:\n${content.slice(0, 24_000)}\n\nGib die Speisekarte als JSON zurück: {"items":[{"name":"","category":"","price":"z. B. 8,50 €","sizes":[{"size":"z. B. 30 cm","price":""}],"description":""}]}. Wenn keine Speisekarte im Text steht: {"items":[]}.`,
    maxTokens: 6000
  });
  const items = (Array.isArray(reply.items) ? reply.items : []).map((item) => ({
    name: text(item?.name, 80),
    category: text(item?.category, 40),
    price: text(item?.price, 20),
    sizes: (Array.isArray(item?.sizes) ? item.sizes : []).map((s) => ({ size: text(s?.size, 30), price: text(s?.price, 20) })).filter((s) => s.size).slice(0, 6),
    description: text(item?.description, 160)
  })).filter((item) => item.name).slice(0, 300);
  if (!items.length) throw new Error('Auf der Website habe ich keine Speisekarte gefunden.');
  const menu = { source: url.href, items };
  menuCache.set(url.href, { at: Date.now(), menu });
  return menu;
}

export const MODES = ['lieferung', 'abholung'];

export function cleanOrderItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    name: text(item?.name, 80),
    quantity: Math.min(Math.max(Math.round(Number(item?.quantity) || 1), 1), 20),
    size: text(item?.size, 30),
    extras: text(item?.extras, 120),
    for: text(item?.for, 30)
  })).filter((item) => item.name).slice(0, 30);
}

// Matches the wishes against the menu. Returns per item whether it exists,
// the exact menu name and the price.
export async function checkOrder(menu, items, { generate = generateJson } = {}) {
  const reply = await generate({
    system: 'Du prüfst Essensbestellungen gegen eine Speisekarte. Antworte nur mit JSON. Ordne Wünsche großzügig zu (z. B. "Salami-Pizza" = "Pizza Salami"), aber erfinde keine Gerichte.',
    prompt: `Speisekarte:\n${menu.items.map((i) => `- ${i.name}${i.category ? ` [${i.category}]` : ''}: ${i.price}${i.sizes.length ? ` (${i.sizes.map((s) => `${s.size} ${s.price}`).join(', ')})` : ''}`).join('\n')}\n\nBestellung:\n${items.map((i, n) => `${n}. ${i.quantity}× ${i.name}${i.size ? ` (${i.size})` : ''}${i.extras ? `, ${i.extras}` : ''}`).join('\n')}\n\nJSON: {"items":[{"index":0,"available":true,"menuName":"genauer Name auf der Karte","price":"Einzelpreis z. B. 9,50 €","note":"z. B. Größe fehlt, ähnliches Gericht: …"}]}`,
    maxTokens: 2500
  });
  const byIndex = new Map((Array.isArray(reply.items) ? reply.items : []).map((r) => [Number(r?.index), r]));
  return items.map((item, index) => {
    const match = byIndex.get(index) || {};
    return { ...item, available: match.available === true, menuName: text(match.menuName, 80), price: text(match.price, 20), note: text(match.note, 160) };
  });
}

const euroValue = (price) => {
  const match = /(\d+)(?:[.,](\d{1,2}))?/.exec(String(price || ''));
  return match ? Number(`${match[1]}.${(match[2] || '0').padEnd(2, '0')}`) : null;
};

export function orderTotal(items) {
  let total = 0;
  for (const item of items) {
    const value = euroValue(item.price);
    if (value === null) return null;
    total += value * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

export function describeItem(item) {
  return `${item.quantity}× ${item.menuName || item.name}${item.size ? ` (${item.size})` : ''}${item.extras ? `, ${item.extras}` : ''}${item.for ? ` – für ${item.for}` : ''}`;
}

export function orderSummary(order) {
  const lines = [
    `Bestellung bei ${order.restaurant.name} (${spokenPhone(order.restaurant.phone)})`,
    ...order.items.map((item) => `• ${describeItem(item)}${item.price ? ` – ${item.price}` : ''}`),
    order.total !== null ? `Summe laut Karte: ca. ${order.total.toFixed(2).replace('.', ',')} €` : null,
    order.mode === 'lieferung' ? `Lieferung an: ${order.address}` : 'Zum Abholen',
    `Name: ${order.customerName}${order.callbackPhone ? ` · Rückrufnummer: ${spokenPhone(order.callbackPhone)}` : ''}`,
    order.payment ? `Bezahlung: ${order.payment}` : null,
    order.time ? `Wann: ${order.time}` : null,
    order.notes ? `Hinweis: ${order.notes}` : null
  ];
  return lines.filter(Boolean).join('\n');
}
