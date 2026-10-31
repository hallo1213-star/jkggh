// Finds places (cities, districts, streets, sights) for the 3D globe with
// OpenStreetMap's Nominatim service – free, no key. Its usage policy asks for
// at most one request per second and a real User-Agent, so requests are
// queued and results cached.
import { getWeatherAt, lookupWikipedia, searchNews } from './knowledge.js';

const API = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'Jarvis-Assistant/1.0 (private voice assistant)';
const cache = new Map();
let queue = Promise.resolve();
let lastRequest = 0;

function throttled(task) {
  const run = queue.then(async () => {
    const wait = lastRequest + 1100 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json', 'accept-language': 'de' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Die Ortssuche antwortet mit Status ${response.status}.`);
  return response.json();
}

const KIND = { city: 'Stadt', town: 'Stadt', village: 'Dorf', suburb: 'Stadtteil', borough: 'Bezirk', city_district: 'Bezirk', quarter: 'Viertel', neighbourhood: 'Viertel', country: 'Land', state: 'Bundesland', road: 'Straße', attraction: 'Sehenswürdigkeit', administrative: 'Gebiet' };

function toPlace(hit) {
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [south, north, west, east] = (hit.boundingbox || []).map(Number);
  const address = hit.address || {};
  const short = hit.name || address.suburb || address.city || address.town || hit.display_name?.split(',')[0] || '';
  return {
    name: String(short).slice(0, 80),
    label: String(hit.display_name || short).split(',').slice(0, 4).map((part) => part.trim()).join(', ').slice(0, 160),
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    bbox: [west, south, east, north].every(Number.isFinite) ? [west, south, east, north] : null,
    kind: KIND[hit.addresstype] || KIND[hit.type] || '',
    country: String(address.country || '').slice(0, 60),
    city: String(address.city || address.town || address.village || '').slice(0, 60)
  };
}

export async function geocodePlace(query, { fetchImpl = fetch } = {}) {
  const q = String(query ?? '').trim().slice(0, 120);
  if (!q) throw new Error('Welchen Ort soll ich zeigen?');
  const key = `q:${q.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  const hits = await throttled(() => getJson(`${API}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=1&addressdetails=1`, fetchImpl));
  const place = Array.isArray(hits) && hits[0] ? toPlace(hits[0]) : null;
  if (!place) throw new Error(`Ich habe keinen Ort namens „${q}“ gefunden.`);
  cache.set(key, place);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return place;
}

export async function reversePlace(lat, lon, { fetchImpl = fetch } = {}) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!(Math.abs(la) <= 90 && Math.abs(lo) <= 180)) throw new Error('Ungültige Koordinaten.');
  const hit = await throttled(() => getJson(`${API}/reverse?lat=${la}&lon=${lo}&format=jsonv2&zoom=16&addressdetails=1`, fetchImpl));
  if (!hit || hit.error) return { name: 'Unbekannter Ort', label: `${la.toFixed(4)}, ${lo.toFixed(4)}`, lat: la, lon: lo, bbox: null, kind: '', country: '', city: '' };
  const place = toPlace(hit);
  const a = hit.address || {};
  // "Neukölln, Berlin" reads better than the house number.
  const area = [a.suburb || a.quarter || a.neighbourhood || a.city_district, a.city || a.town || a.village].filter(Boolean);
  return { ...place, lat: la, lon: lo, name: area.join(', ') || place.name };
}

// Everything current about a place for the globe's side panels: weather and
// local time (left), a short description, and news (right) – optionally about
// a topic such as "Proteste".
export async function placeDetails(target, topic = '', { fetchImpl = fetch } = {}) {
  const subject = String(topic ?? '').trim().slice(0, 60);
  const city = target.city && target.city !== target.name ? `${target.name} ${target.city}` : target.name;
  const [weather, wiki, news] = await Promise.allSettled([
    getWeatherAt(target.lat, target.lon, { fetchImpl }),
    lookupWikipedia(city, { fetchImpl }),
    searchNews(subject ? `${subject} ${target.name}` : city, { limit: 8, days: subject ? 7 : 3, fetchImpl })
      .then((result) => (result.meldungen.length || !subject || !target.country ? result : searchNews(`${subject} ${target.country}`, { limit: 8, fetchImpl })))
  ]);
  const now = weather.status === 'fulfilled' ? weather.value : null;
  const summary = wiki.status === 'fulfilled' && !wiki.value.mehrdeutig ? wiki.value : null;
  const items = news.status === 'fulfilled' ? news.value.meldungen : [];
  return {
    topic: subject || null,
    weather: now,
    summary,
    items,
    left: { weather: now, info: summary ? { title: summary.titel, text: summary.zusammenfassung.slice(0, 600), link: summary.link } : null },
    right: { topic: subject || null, query: news.status === 'fulfilled' ? news.value.suche : null, items, error: news.status === 'rejected' ? news.reason.message : null }
  };
}

// Shops and restaurants with their OpenStreetMap contact data (phone, website,
// opening hours) – used to find the pizzeria Jarvis should call.
export async function findBusiness(query, { fetchImpl = fetch, limit = 3 } = {}) {
  const q = String(query ?? '').trim().slice(0, 120);
  if (!q) throw new Error('Welches Geschäft?');
  const hits = await throttled(() => getJson(`${API}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=${limit}&addressdetails=1&extratags=1`, fetchImpl));
  return (Array.isArray(hits) ? hits : []).map((hit) => {
    const tags = hit.extratags || {};
    const a = hit.address || {};
    return {
      name: String(hit.name || hit.display_name?.split(',')[0] || '').slice(0, 80),
      address: [[a.road, a.house_number].filter(Boolean).join(' '), [a.postcode, a.city || a.town || a.village].filter(Boolean).join(' ')].filter(Boolean).join(', ').slice(0, 140),
      phone: String(tags.phone || tags['contact:phone'] || '').split(';')[0].trim().slice(0, 30),
      website: String(tags.website || tags['contact:website'] || '').split(';')[0].trim().slice(0, 200),
      openingHours: String(tags.opening_hours || '').slice(0, 120),
      cuisine: String(tags.cuisine || '').slice(0, 60),
      lat: Number(hit.lat),
      lon: Number(hit.lon)
    };
  }).filter((b) => b.name);
}
