const P = await import('../../places.js');
const K = await import('../../knowledge.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const times = []; const urls = [];
const f = async (url, init) => { times.push(Date.now()); urls.push({ url, ua: init.headers['user-agent'] }); return { ok: true, status: 200, json: async () => (url.includes('reverse') ? { error: 'Unable to geocode' } : url.includes('xyz') ? [] : [{ lat: '52.48', lon: '13.43', name: 'Neukölln', display_name: 'Neukölln, Berlin, Deutschland, 12043', addresstype: 'suburb', boundingbox: ['52.46', '52.49', '13.39', '13.47'], address: { city: 'Berlin', country: 'Deutschland' } }]) }; };
const [a, b] = await Promise.all([P.geocodePlace('Neukölln, Berlin', { fetchImpl: f }), P.geocodePlace('Kreuzberg', { fetchImpl: f })]);
assert(times[1] - times[0] >= 1050, `Nominatim max 1/s (${times[1] - times[0]} ms)`);
assert(a.name === 'Neukölln' && a.kind === 'Stadtteil' && a.bbox.join() === '13.39,52.46,13.47,52.49' && a.city === 'Berlin', 'place parsed, bbox west,south,east,north');
assert(urls[0].ua.includes('Jarvis') && urls[0].url.includes('format=jsonv2'), 'user agent + format');
await P.geocodePlace('neukölln, berlin', { fetchImpl: f });
assert(urls.length === 2, 'cached (case-insensitive)');
try { await P.geocodePlace('xyz', { fetchImpl: f }); assert(false, 'x'); } catch (e) { assert(/keinen Ort/.test(e.message), 'unknown place explained'); }
try { await P.geocodePlace('  ', { fetchImpl: f }); } catch (e) { assert(/Welchen Ort/.test(e.message), 'empty query'); }
const r = await P.reversePlace(10, 20, { fetchImpl: f });
assert(r.name === 'Unbekannter Ort', 'reverse on sea → unknown place');
try { await P.reversePlace(100, 0, { fetchImpl: f }); } catch (e) { assert(/Ungültige/.test(e.message), 'invalid coords refused'); }
const w = await K.getWeatherAt(52.5, 13.4, { fetchImpl: async (url) => ({ ok: true, json: async () => ({ timezone: 'America/New_York', current: { time: '2026-10-31T17:45', temperature_2m: 14.6, weather_code: 0, is_day: 1, cloud_cover: 3 }, daily: { sunrise: ['2026-10-31T07:30'], sunset: ['2026-10-31T17:55'] } }), url }) });
assert(w.ortszeit === '17:45' && w.zeitzone === 'America/New_York' && w.tagOderNacht === 'Tag' && w.temperatur === 15 && w.wetter === 'klar' && w.heute.sonnenuntergang === '17:55', 'weather at coordinates with local time');
