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

// --- Webcams around a place (for the 3D globe) ------------------------------------
// Sources that publish their cameras officially: Autobahn GmbH (Germany, no
// key) and – optionally – Windy Webcams (worldwide, webcam owners upload them
// themselves; free key in WINDY_WEBCAMS_KEY).
const INDEX_MS = 6 * 60 * 60 * 1000;
let autobahnIndex = { at: 0, cams: [], loading: null };

export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function getJson(url, fetchImpl, headers = {}) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Status ${response.status}`);
  return response.json();
}

export function parseAutobahnCams(road, data) {
  return (Array.isArray(data?.webcam) ? data.webcam : []).map((cam) => ({
    id: `ab-${String(cam.identifier || '').slice(0, 60) || Math.random().toString(36).slice(2)}`,
    title: String(cam.title || road).slice(0, 80),
    subtitle: String(cam.subtitle || '').slice(0, 120),
    lat: Number(cam.coordinate?.lat),
    lon: Number(cam.coordinate?.long),
    image: https(cam.imageurl),
    link: https(cam.linkurl) || https(cam.imageurl),
    source: 'Autobahn GmbH',
    blocked: cam.isBlocked === true || cam.isBlocked === 'true'
  })).filter((cam) => !cam.blocked && cam.image && Number.isFinite(cam.lat) && Number.isFinite(cam.lon));
}

async function loadAutobahnIndex(fetchImpl) {
  if (Date.now() - autobahnIndex.at < INDEX_MS && autobahnIndex.cams.length) return autobahnIndex.cams;
  if (autobahnIndex.loading) return autobahnIndex.loading;
  autobahnIndex.loading = (async () => {
    const { roads = [] } = await getJson(AUTOBAHN_API, fetchImpl);
    const ids = roads.map(normalizeRoad).filter(Boolean);
    const cams = [];
    for (let i = 0; i < ids.length; i += 8) {
      const batch = await Promise.allSettled(ids.slice(i, i + 8).map((id) => getJson(`${AUTOBAHN_API}/${id}/services/webcam`, fetchImpl).then((data) => parseAutobahnCams(id, data))));
      for (const result of batch) if (result.status === 'fulfilled') cams.push(...result.value);
    }
    autobahnIndex = { at: Date.now(), cams, loading: null };
    return cams;
  })().catch((error) => {
    autobahnIndex.loading = null;
    throw error;
  });
  return autobahnIndex.loading;
}

export function windyConfigured() {
  return Boolean(process.env.WINDY_WEBCAMS_KEY?.trim());
}

export function parseWindyCams(data) {
  return (Array.isArray(data?.webcams) ? data.webcams : []).map((cam) => ({
    id: `wd-${cam.webcamId}`,
    title: String(cam.title || 'Webcam').slice(0, 80),
    subtitle: [cam.location?.city, cam.location?.country].filter(Boolean).join(', ').slice(0, 120),
    lat: Number(cam.location?.latitude),
    lon: Number(cam.location?.longitude),
    image: https(cam.images?.current?.preview) || https(cam.images?.daylight?.preview),
    link: https(cam.urls?.detail) || https(cam.player?.day),
    player: https(cam.player?.live) || https(cam.player?.day),
    source: 'Windy Webcams'
  })).filter((cam) => cam.image && Number.isFinite(cam.lat) && Number.isFinite(cam.lon));
}

async function windyNearby(point, radiusKm, fetchImpl) {
  const radius = Math.min(Math.max(Math.round(radiusKm), 1), 250);
  const data = await getJson(`https://api.windy.com/webcams/api/v3/webcams?nearby=${point.lat},${point.lon},${radius}&include=images,location,player,urls&limit=40&lang=de`, fetchImpl, { 'x-windy-api-key': process.env.WINDY_WEBCAMS_KEY.trim() });
  return parseWindyCams(data);
}

export async function nearbyWebcams(point, { radiusKm = 40, limit = 24, fetchImpl = fetch } = {}) {
  const center = { lat: Number(point.lat), lon: Number(point.lon) };
  const inGermany = center.lat > 47 && center.lat < 55.2 && center.lon > 5.5 && center.lon < 15.5;
  const [autobahn, windy] = await Promise.allSettled([
    inGermany ? loadAutobahnIndex(fetchImpl) : Promise.resolve([]),
    windyConfigured() ? windyNearby(center, radiusKm, fetchImpl) : Promise.resolve([])
  ]);
  const cams = [...(windy.status === 'fulfilled' ? windy.value : []), ...(autobahn.status === 'fulfilled' ? autobahn.value : [])]
    .map((cam) => ({ ...cam, km: Math.round(distanceKm(center, cam) * 10) / 10 }))
    .filter((cam) => cam.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, Math.min(Math.max(Number(limit) || 24, 1), 40));
  return {
    cams,
    sources: [...new Set(cams.map((cam) => cam.source))],
    failed: [autobahn.status === 'rejected' ? 'Autobahn GmbH' : null, windy.status === 'rejected' ? 'Windy' : null].filter(Boolean),
    windy: windyConfigured()
  };
}
