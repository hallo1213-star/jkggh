import assert from 'node:assert/strict';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const m = await import(ROOT + '/route.js');
let n = 0;
const now = new Date('2026-11-01T19:00:00Z'); // Sunday 20:00 in Berlin
assert.equal(m.arrivalTime('08:00', '', now).toISOString(), '2026-11-02T07:00:00.000Z'); n++; // passed today → tomorrow
assert.equal(m.arrivalTime('21:30', '', now).toISOString(), '2026-11-01T20:30:00.000Z'); n++;
assert.equal(m.arrivalTime('8 Uhr', 'morgen', now).toISOString(), '2026-11-02T07:00:00.000Z'); n++;
assert.equal(m.arrivalTime('7.45', '2027-07-01', now).toISOString(), '2027-07-01T05:45:00.000Z'); n++; // summer time
assert.throws(() => m.arrivalTime('xx', '', now)); n++;
assert.throws(() => m.arrivalTime('08:00', '2026-10-01', now), /Vergangenheit/); n++;
const geocode = async (q) => (q.includes('Schule') ? { name: 'Goethe-Gymnasium', label: 'Goethe-Gymnasium, Frankfurt', lat: 50.12, lon: 8.66 } : { name: 'Zuhause', label: 'Musterstraße 5, Frankfurt', lat: 50.1, lon: 8.7 });
const leg = (o, d, dep, arr, extra = {}) => ({ origin: { name: o }, destination: { name: d }, departure: dep, arrival: arr, ...extra });
const journeys = { journeys: [
  { legs: [leg('Musterstraße 5', 'Haltestelle A', '2026-11-02T06:20:00Z', '2026-11-02T06:26:00Z', { walking: true, distance: 450 }), leg('Haltestelle A', 'Schule Nord', '2026-11-02T06:28:00Z', '2026-11-02T06:45:00Z', { line: { name: 'Bus 32' }, direction: 'Nordweststadt', departurePlatform: '2' }), leg('Schule Nord', 'Goethe-Gymnasium', '2026-11-02T06:45:00Z', '2026-11-02T06:49:00Z', { walking: true, distance: 250 })] },
  { legs: [leg('Musterstraße 5', 'Haltestelle A', '2026-11-02T06:35:00Z', '2026-11-02T06:41:00Z', { walking: true }), leg('Haltestelle A', 'Goethe-Gymnasium', '2026-11-02T06:43:00Z', '2026-11-02T06:58:00Z', { line: { name: 'U 1' } })] }, // arrives 7:58 > 7:55 latest → excluded
  { legs: [leg('Musterstraße 5', 'Haltestelle A', '2026-11-02T06:05:00Z', '2026-11-02T06:30:00Z', { line: { name: 'Bus 30' } })] }
] };
const calls = [];
const fetchImpl = async (url) => { calls.push(url); if (url.includes('journeys')) return new Response(JSON.stringify(journeys)); if (url.includes('routed-foot')) return new Response(JSON.stringify({ routes: [{ duration: 2400, distance: 3100, geometry: { coordinates: [[8.7, 50.1], [8.66, 50.12]] } }] })); if (url.includes('routed-bike')) return new Response(JSON.stringify({ routes: [{ duration: 720, distance: 3300 }] })); throw new Error(url); };
const r = await m.planRoute({ from: 'Musterstraße 5, Frankfurt', to: 'meine Schule', arriveBy: '08:00', fetchImpl, geocode, now });
assert.equal(r.recommended, 'oepnv'); n++;
const t = r.options.find((o) => o.mode === 'oepnv');
assert.equal(m.clock(t.leave), '07:20'); n++;   // latest that still arrives by 07:55
assert.equal(t.alternatives.length, 1); n++;
assert.ok(calls.find((u) => u.includes('journeys')).includes('arrival=2026-11-02T06%3A55%3A00.000Z')); n++;
assert.ok(calls.find((u) => u.includes('journeys')).includes('from.latitude=50.1')); n++;
assert.equal(m.clock(r.options.find((o) => o.mode === 'fahrrad').leave), '07:43'); n++;
const d = m.describeRoute(r);
assert.equal(d.losgehen, '07:20'); assert.equal(d.umstiege, 0); assert.match(d.schritte[1], /Bus 32 Richtung Nordweststadt ab Haltestelle A Gleis 2/); n++;
// short walk wins over bus
const near = async (url) => (url.includes('routed-foot') ? new Response(JSON.stringify({ routes: [{ duration: 600, distance: 800 }] })) : fetchImpl(url));
const r2 = await m.planRoute({ from: 'X 1', to: 'Schule', arriveBy: '08:00', fetchImpl: near, geocode, now });
assert.equal(r2.recommended, 'zu_fuss'); assert.match(r2.reason, /Zu Fuß/); n++;
// transit down → still works with walking/bike
const down = async (url) => (url.includes('journeys') ? new Response('x', { status: 503 }) : fetchImpl(url));
const r3 = await m.planRoute({ from: 'X 1', to: 'Schule', arriveBy: '08:00', fetchImpl: down, geocode, now });
assert.equal(r3.recommended, 'fahrrad'); assert.deepEqual(r3.unavailable, ['oepnv']); n++;
await assert.rejects(m.planRoute({ from: '', to: 'Schule', arriveBy: '08:00', fetchImpl, geocode, now }), /Von wo/); n++;
console.log(`route: ${n} bestanden`);
