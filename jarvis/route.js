// Route planner "be there by 08:00": works backwards from the arrival time and
// says when to leave the house. Public transport from door to door
// (db.transport.rest, incl. the walk to the stop), plus walking, cycling and
// driving times (OSRM on routing.openstreetmap.de) for comparison.
import { geocodePlace } from './places.js';

const TIMEOUT_MS = 12_000;
const USER_AGENT = 'Jarvis-Assistant/1.0 (private voice assistant)';
const TRANSIT_API = 'https://v6.db.transport.rest';
const timeZone = process.env.TZ || 'Europe/Berlin';
const MODES = ['oepnv', 'zu_fuss', 'fahrrad', 'auto'];
const OSRM = { zu_fuss: 'routed-foot/route/v1/foot', fahrrad: 'routed-bike/route/v1/bike', auto: 'routed-car/route/v1/driving' };
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Der Routendienst antwortet mit Status ${response.status}.`);
  return response.json();
}

const isoDay = (date) => date.toLocaleDateString('sv-SE', { timeZone });
export const clock = (date) => new Date(date).toLocaleTimeString('de-DE', { timeZone, hour: '2-digit', minute: '2-digit' });
const weekday = (date) => new Date(date).toLocaleDateString('de-DE', { timeZone, weekday: 'long', day: 'numeric', month: 'long' });

// Local wall-clock time in Germany → absolute Date (handles summer time).
function zoned(day, hh, mm) {
  const guess = new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (local - utc));
}

// "08:00", "8 Uhr", "7.45" (+ optional date "2026-11-02" / "morgen") → the next
// matching moment in the future.
export function arrivalTime(time, date, now = new Date()) {
  const m = clean(time, 20).match(/^(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) throw new Error('Um wie viel Uhr musst du da sein?');
  const d = clean(date, 20).toLowerCase();
  let day = isoDay(now);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) day = d;
  else if (d === 'morgen') day = isoDay(new Date(now.getTime() + 86_400_000));
  else if (d === 'übermorgen') day = isoDay(new Date(now.getTime() + 2 * 86_400_000));
  let target = zoned(day, m[1], m[2] || 0);
  if (!/^\d{4}/.test(d) && !d && target <= now) target = zoned(isoDay(new Date(now.getTime() + 86_400_000)), m[1], m[2] || 0);
  if (Number.isNaN(target.getTime())) throw new Error('Dieses Datum kenne ich nicht.');
  if (target <= now) throw new Error('Diese Zeit liegt schon in der Vergangenheit.');
  return target;
}

const point = (place) => ({ lat: Number(place.lat), lon: Number(place.lon) });
const lonLat = (coords) => (Array.isArray(coords) && coords.length >= 2 ? [Number(coords[0]), Number(coords[1])] : null);

// Public transport from address to address, arriving before `arriveBy`.
export function parseTransit(data, arriveBy) {
  const journeys = (Array.isArray(data?.journeys) ? data.journeys : []).map((journey) => {
    const legs = (journey.legs || []).filter(Boolean);
    if (!legs.length) return null;
    const start = legs[0].departure || legs[0].plannedDeparture;
    const end = legs[legs.length - 1].arrival || legs[legs.length - 1].plannedArrival;
    if (!start || !end) return null;
    return {
      leave: start,
      arrive: end,
      minutes: Math.round((new Date(end) - new Date(start)) / 60000),
      changes: Math.max(legs.filter((l) => !l.walking).length - 1, 0),
      cancelled: legs.some((l) => l.cancelled),
      legs: legs.map((leg) => ({
        walking: leg.walking === true,
        line: clean(leg.line?.name, 20),
        direction: clean(leg.direction, 60),
        from: clean(leg.origin?.name, 70),
        to: clean(leg.destination?.name, 70),
        departure: leg.departure || leg.plannedDeparture || null,
        arrival: leg.arrival || leg.plannedArrival || null,
        delay: Number.isFinite(leg.departureDelay) && leg.departureDelay > 0 ? Math.round(leg.departureDelay / 60) : 0,
        platform: clean(leg.departurePlatform || leg.plannedDeparturePlatform, 10),
        distance: Number.isFinite(leg.distance) ? Math.round(leg.distance) : null,
        path: (leg.polyline?.features || []).map((f) => lonLat(f?.geometry?.coordinates)).filter(Boolean)
      }))
    };
  }).filter((j) => j && !j.cancelled && new Date(j.arrive) <= arriveBy);
  // Latest departure that is still on time = least waiting around.
  return journeys.sort((a, b) => new Date(b.leave) - new Date(a.leave)).slice(0, 3);
}

async function transitRoute(from, to, arriveBy, fetchImpl) {
  const loc = (prefix, place) => `${prefix}.latitude=${place.lat}&${prefix}.longitude=${place.lon}&${prefix}.address=${encodeURIComponent(clean(place.label || place.name, 100) || 'Adresse')}`;
  const url = `${TRANSIT_API}/journeys?${loc('from', from)}&${loc('to', to)}&arrival=${encodeURIComponent(arriveBy.toISOString())}&results=5&polylines=true&stopovers=false&language=de`;
  return parseTransit(await getJson(url, fetchImpl), arriveBy);
}

async function osrmRoute(mode, from, to, fetchImpl) {
  const a = point(from);
  const b = point(to);
  const data = await getJson(`https://routing.openstreetmap.de/${OSRM[mode]}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=simplified&geometries=geojson`, fetchImpl);
  const route = data?.routes?.[0];
  if (!route || !Number.isFinite(route.duration)) return null;
  return { minutes: Math.max(1, Math.round(route.duration / 60)), km: Math.round(route.distance / 100) / 10, path: (route.geometry?.coordinates || []).map(lonLat).filter(Boolean) };
}

export function mapsLink(from, to, mode) {
  const travel = { oepnv: 'transit', zu_fuss: 'walking', fahrrad: 'bicycling', auto: 'driving' }[mode] || 'transit';
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=${travel}`;
}

// Main entry: plan the trip and work out when to leave.
export async function planRoute({ from, to, arriveBy, date, mode, buffer, fetchImpl = fetch, geocode = geocodePlace, now = new Date() } = {}) {
  const start = clean(from, 140);
  const goal = clean(to, 140);
  if (!goal) throw new Error('Wohin soll es gehen? (Adresse oder Name, z. B. "Goethe-Gymnasium, Frankfurt")');
  if (!start) throw new Error('Von wo aus startest du? Sag mir deine Adresse – ich kann sie mir auch merken.');
  const wanted = MODES.includes(mode) ? mode : 'oepnv';
  const target = arrivalTime(arriveBy, date, now);
  const spare = Math.min(Math.max(Math.round(Number(buffer ?? 5)), 0), 60);
  const latest = new Date(target.getTime() - spare * 60_000);
  const [a, b] = await Promise.all([geocode(start, { fetchImpl }), geocode(goal, { fetchImpl })]);
  const tasks = {
    oepnv: transitRoute(a, b, latest, fetchImpl),
    zu_fuss: osrmRoute('zu_fuss', a, b, fetchImpl),
    fahrrad: osrmRoute('fahrrad', a, b, fetchImpl),
    ...(wanted === 'auto' ? { auto: osrmRoute('auto', a, b, fetchImpl) } : {})
  };
  const names = Object.keys(tasks);
  const settled = await Promise.allSettled(Object.values(tasks));
  const results = Object.fromEntries(names.map((name, i) => [name, settled[i].status === 'fulfilled' ? settled[i].value : null]));
  const failed = names.filter((name, i) => settled[i].status === 'rejected');

  const options = [];
  for (const m of ['zu_fuss', 'fahrrad', 'auto']) {
    const r = results[m];
    if (!r) continue;
    // Driving: a little extra for traffic and parking.
    const minutes = m === 'auto' ? Math.round(r.minutes * 1.25) + 5 : r.minutes;
    options.push({ mode: m, minutes, km: r.km, leave: new Date(latest.getTime() - minutes * 60_000).toISOString(), arrive: latest.toISOString(), path: r.path });
  }
  const transit = results.oepnv || [];
  if (transit.length) {
    const best = transit[0];
    options.push({ mode: 'oepnv', minutes: best.minutes, leave: best.leave, arrive: best.arrive, changes: best.changes, legs: best.legs, alternatives: transit.slice(1).map((j) => ({ leave: j.leave, arrive: j.arrive, minutes: j.minutes, changes: j.changes, lines: j.legs.filter((l) => !l.walking).map((l) => l.line) })) });
  }
  if (!options.length) throw new Error(failed.length ? 'Die Routendienste sind gerade nicht erreichbar. Versuch es gleich noch einmal.' : 'Ich habe keine passende Route gefunden.');

  // Recommendation: the wanted mode if possible; a short walk beats a bus ride.
  const by = (m) => options.find((o) => o.mode === m);
  let chosen = by(wanted) || by('oepnv') || by('fahrrad') || by('zu_fuss') || options[0];
  const walk = by('zu_fuss');
  if (wanted === 'oepnv' && walk && walk.minutes <= 15 && (!by('oepnv') || walk.minutes <= by('oepnv').minutes + 5)) chosen = walk;
  const reason = chosen.mode !== wanted ? (chosen.mode === 'zu_fuss' && by('oepnv') ? 'Zu Fuß ist fast genauso schnell wie mit Bus/Bahn.' : wanted === 'oepnv' ? (failed.includes('oepnv') ? 'Der Bus-und-Bahn-Fahrplan ist gerade nicht erreichbar – hier die Alternative.' : 'Mit Bus/Bahn gibt es keine passende Verbindung.') : '') : '';
  return {
    from: clean(a.label || a.name, 120),
    to: clean(b.label || b.name, 120),
    fromPoint: point(a),
    toPoint: point(b),
    arriveBy: target.toISOString(),
    day: weekday(target),
    buffer: spare,
    recommended: chosen.mode,
    reason,
    options,
    link: mapsLink(point(a), point(b), chosen.mode),
    unavailable: failed
  };
}

export const MODE_NAMES = { oepnv: 'Bus & Bahn', zu_fuss: 'zu Fuß', fahrrad: 'Fahrrad', auto: 'Auto' };

// Short text for Jarvis to speak (and for Telegram).
export function describeRoute(route) {
  const chosen = route.options.find((o) => o.mode === route.recommended);
  const steps = chosen.legs
    ? chosen.legs.map((l) => (l.walking ? `${clock(l.departure)} zu Fuß${l.distance ? ` (${l.distance} m)` : ''} bis ${l.to}` : `${clock(l.departure)} ${l.line}${l.direction ? ` Richtung ${l.direction}` : ''} ab ${l.from}${l.platform ? ` Gleis ${l.platform}` : ''}${l.delay ? ` (+${l.delay} min Verspätung)` : ''}, an ${clock(l.arrival)} ${l.to}`))
    : [`${chosen.minutes} min ${MODE_NAMES[chosen.mode]}${chosen.km ? `, ${String(chosen.km).replace('.', ',')} km` : ''}`];
  return {
    losgehen: clock(chosen.leave),
    ankunft: clock(chosen.arrive),
    spaetestensDa: clock(route.arriveBy),
    tag: route.day,
    empfehlung: MODE_NAMES[chosen.mode],
    grund: route.reason || undefined,
    dauerMinuten: chosen.minutes,
    umstiege: chosen.changes,
    schritte: steps,
    vergleich: route.options.map((o) => `${MODE_NAMES[o.mode]}: ${o.minutes} min, los um ${clock(o.leave)}`),
    alternativen: chosen.alternatives?.map((j) => `los ${clock(j.leave)}, an ${clock(j.arrive)} (${j.lines.join(' → ')})`)
  };
}
