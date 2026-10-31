// Officially public webcams only: traffic cameras published by Autobahn GmbH
// (open data API, no key) and a search for public live webcams of a place.
// Private or unsecured cameras are never searched for or accessed.
const AUTOBAHN_API = 'https://verkehr.autobahn.de/o/autobahn';
const TIMEOUT_MS = 10_000;

export function normalizeRoad(value) {
  const match = /^\s*A\s*-?\s*(\d{1,3})\s*$/i.exec(String(value ?? ''));
  return match ? `A${Number(match[1])}` : null;
}

const https = (value) => (typeof value === 'string' && value.startsWith('https://') ? value : '');

export async function getAutobahnWebcams(road, { near = '', limit = 6, fetchImpl = fetch } = {}) {
  const id = normalizeRoad(road);
  if (!id) throw new Error('Bitte eine Autobahn angeben, z. B. „A1“ oder „A 7“.');
  const response = await fetchImpl(`${AUTOBAHN_API}/${id}/services/webcam`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 404) throw new Error(`Für die ${id} gibt es keine Daten.`);
  if (!response.ok) throw new Error(`Die Autobahn-Daten sind gerade nicht erreichbar (Status ${response.status}).`);
  const data = await response.json();
  const wanted = String(near).trim().toLowerCase();
  const cams = (Array.isArray(data.webcam) ? data.webcam : [])
    .filter((cam) => !cam.isBlocked && https(cam.imageurl || cam.linkurl))
    .map((cam) => ({ titel: String(cam.title || id).slice(0, 80), ort: String(cam.subtitle || '').slice(0, 120), bild: https(cam.imageurl), link: https(cam.linkurl) || https(cam.imageurl) }));
  const matching = wanted ? cams.filter((cam) => `${cam.titel} ${cam.ort}`.toLowerCase().includes(wanted)) : cams;
  return { autobahn: id, gesamt: cams.length, kameras: (matching.length ? matching : cams).slice(0, Math.min(Math.max(Number(limit) || 6, 1), 12)), nurInDerNaehe: Boolean(wanted && matching.length) };
}

export function webcamSearchLinks(place) {
  const q = String(place ?? '').trim().slice(0, 80);
  return [{ name: `Live-Webcams ${q}`, url: `https://www.google.com/search?q=${encodeURIComponent(`live webcam ${q}`)}` }];
}
