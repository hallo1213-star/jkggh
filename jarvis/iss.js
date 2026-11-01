// The International Space Station live (wheretheiss.at – free, no key):
// current position, speed, altitude and the next orbit as a track.
let cache = { at: 0, value: null };

export async function getIss({ fetchImpl = fetch } = {}) {
  if (cache.value && Date.now() - cache.at < 4000) return cache.value;
  const now = await (await fetchImpl('https://api.wheretheiss.at/v1/satellites/25544', { signal: AbortSignal.timeout(8000) })).json();
  if (typeof now?.latitude !== 'number') throw new Error('Die ISS-Daten sind gerade nicht erreichbar.');
  // One orbit takes ~92 minutes: positions every ~4.6 min, in two requests of 10.
  const start = Math.floor(Date.now() / 1000);
  const stamps = Array.from({ length: 20 }, (_, i) => start + i * 277);
  const parts = await Promise.all([stamps.slice(0, 10), stamps.slice(10)].map(async (list) => {
    try {
      const response = await fetchImpl(`https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=${list.join(',')}&units=kilometers`, { signal: AbortSignal.timeout(8000) });
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  }));
  const value = {
    lat: now.latitude,
    lon: now.longitude,
    altitudeKm: Math.round(now.altitude),
    speedKmh: Math.round(now.velocity),
    daylight: now.visibility === 'daylight',
    path: parts.flat().filter((p) => typeof p?.latitude === 'number').map((p) => [p.latitude, p.longitude, p.altitude])
  };
  cache = { at: Date.now(), value };
  return value;
}
