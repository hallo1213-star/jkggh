import assert from 'node:assert/strict';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const m = await import(ROOT + '/webcams.js');
let n = 0;
assert.equal(Math.round(m.distanceKm({ lat: 53.55, lon: 9.99 }, { lat: 52.52, lon: 13.4 })), 255); n++;
const cams = m.parseAutobahnCams('A7', { webcam: [
  { identifier: 'x1', title: 'A7 Elbtunnel', subtitle: 'Hamburg', coordinate: { lat: '53.54', long: '9.93' }, imageurl: 'https://verkehr.autobahn.de/cam1.jpg', isBlocked: false },
  { identifier: 'x2', title: 'gesperrt', coordinate: { lat: '53.5', long: '9.9' }, imageurl: 'https://a/b.jpg', isBlocked: true },
  { identifier: 'x3', title: 'http', coordinate: { lat: '53.5', long: '9.9' }, imageurl: 'http://a/b.jpg' },
  { identifier: 'x4', title: 'ohne Ort', imageurl: 'https://a/c.jpg' }] });
assert.equal(cams.length, 1); assert.equal(cams[0].lat, 53.54); n++;
const w = m.parseWindyCams({ webcams: [{ webcamId: 1, title: 'Hafen', location: { latitude: 53.545, longitude: 9.97, city: 'Hamburg', country: 'Deutschland' }, images: { current: { preview: 'https://imgproxy.windy.com/p.jpg' } }, urls: { detail: 'https://www.windy.com/webcams/1' }, player: { day: 'https://webcams.windy.com/p/1/day' } }] });
assert.equal(w[0].player, 'https://webcams.windy.com/p/1/day'); n++;
const calls = [];
const fetchImpl = async (url, init) => { calls.push({ url, key: init?.headers?.['x-windy-api-key'] });
  if (url.endsWith('/o/autobahn')) return new Response(JSON.stringify({ roads: ['A1', 'A7', 'A 24'] }));
  if (url.includes('/A7/services/webcam')) return new Response(JSON.stringify({ webcam: [{ identifier: 'a', title: 'A7 Elbtunnel', coordinate: { lat: '53.54', long: '9.93' }, imageurl: 'https://verkehr.autobahn.de/a.jpg' }, { identifier: 'b', title: 'A7 Kassel', coordinate: { lat: '51.3', long: '9.5' }, imageurl: 'https://verkehr.autobahn.de/b.jpg' }] }));
  if (url.includes('/services/webcam')) return new Response('{}', { status: 500 });
  if (url.startsWith('https://api.windy.com/')) return new Response(JSON.stringify({ webcams: [{ webcamId: 7, title: 'Landungsbrücken', location: { latitude: 53.546, longitude: 9.968 }, images: { current: { preview: 'https://imgproxy.windy.com/7.jpg' } } }] }));
  throw new Error(url); };
const r = await m.nearbyWebcams({ lat: 53.55, lon: 9.99 }, { radiusKm: 30, fetchImpl });
assert.deepEqual(r.cams.map((c) => c.title), ['Landungsbrücken', 'A7 Elbtunnel'].filter((t) => process.env.WINDY_WEBCAMS_KEY || t !== 'Landungsbrücken')); n++;
process.env.WINDY_WEBCAMS_KEY = 'k';
const r2 = await m.nearbyWebcams({ lat: 53.55, lon: 9.99 }, { radiusKm: 30, fetchImpl });
assert.deepEqual(r2.cams.map((c) => c.title), ['Landungsbrücken', 'A7 Elbtunnel']); assert.equal(calls.find((c) => c.url.includes('windy')).key, 'k'); n++;
assert.equal(calls.filter((c) => c.url.endsWith('/o/autobahn')).length, 1); n++; // index cached
const r3 = await m.nearbyWebcams({ lat: 48.85, lon: 2.35 }, { radiusKm: 30, fetchImpl }); // Paris: no Autobahn data
assert.equal(r3.cams.length, 0); n++;
console.log(`webcams-near: ${n} bestanden`);
