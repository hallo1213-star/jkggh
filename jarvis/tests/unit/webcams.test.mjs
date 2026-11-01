import { normalizeRoad, getAutobahnWebcams, webcamSearchLinks } from '../../webcams.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
assert(normalizeRoad('A1') === 'A1' && normalizeRoad(' a 7 ') === 'A7' && normalizeRoad('A-001') === 'A1' && normalizeRoad('B9') === null && normalizeRoad('A1; rm -rf') === null, 'road names normalized, junk rejected');
const urls = [];
const sample = { webcam: [
  { identifier: 'w1', title: 'A1 | Köln-Nord', subtitle: 'Blickrichtung Dortmund', imageurl: 'https://verkehr.autobahn.de/cams/w1.jpg', linkurl: 'https://verkehr.autobahn.de/cams/w1', isBlocked: false },
  { identifier: 'w2', title: 'A1 | Leverkusen', subtitle: 'Rheinbrücke', imageurl: 'https://verkehr.autobahn.de/cams/w2.jpg', isBlocked: false },
  { identifier: 'w3', title: 'A1 | Gesperrt', imageurl: 'https://x/w3.jpg', isBlocked: true },
  { identifier: 'w4', title: 'A1 | Unsicher', imageurl: 'http://insecure/w4.jpg' }
] };
const fetchImpl = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => sample }; };
const all = await getAutobahnWebcams('a 1', { fetchImpl });
assert(urls[0] === 'https://verkehr.autobahn.de/o/autobahn/A1/services/webcam', 'Autobahn GmbH open data endpoint');
assert(all.gesamt === 2 && all.kameras.every(c => c.bild.startsWith('https://')), 'blocked and non-https cameras dropped');
const near = await getAutobahnWebcams('A1', { near: 'köln', fetchImpl });
assert(near.kameras.length === 1 && near.kameras[0].titel === 'A1 | Köln-Nord' && near.nurInDerNaehe, 'filtered to cameras near a place');
const none = await getAutobahnWebcams('A1', { near: 'München', fetchImpl });
assert(none.kameras.length === 2 && !none.nurInDerNaehe, 'no match nearby → all cameras of the road');
assert(all.kameras[1].link === 'https://verkehr.autobahn.de/cams/w2.jpg', 'missing link falls back to image');
try { await getAutobahnWebcams('A999', { fetchImpl: async () => ({ ok: false, status: 404 }) }); assert(false, '404'); } catch (e) { assert(/keine Daten/.test(e.message), 'unknown road → clear message'); }
try { await getAutobahnWebcams('Hauptstraße', { fetchImpl }); assert(false, 'not a road'); } catch (e) { assert(/Autobahn angeben/.test(e.message), 'non-motorway rejected'); }
assert(webcamSearchLinks('Sankt Peter-Ording')[0].url === 'https://www.google.com/search?q=live%20webcam%20Sankt%20Peter-Ording', 'public webcam search link');
