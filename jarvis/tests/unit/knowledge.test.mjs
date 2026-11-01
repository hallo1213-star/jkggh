import { fakeFetch, calls } from './mocks/fake-fetch.mjs';
import { getWeather, getNews, lookupWikipedia, parseRss, describeWeather } from '../../knowledge.js';
import { addMemory, forgetMemory, sanitizeMemories, sanitizeHistory, isSensitive } from '../../memories.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const w = await getWeather('Köln', { fetchImpl: fakeFetch });
assert(w.ort === 'Köln, Nordrhein-Westfalen, Deutschland' && w.jetzt.temperatur === 11 && w.jetzt.wetter === 'leichter Regen' && w.jetzt.symbol === '🌦️', 'weather now: rounded, WMO code translated');
assert(w.tage.length === 3 && w.tage[1].tag === 'Sonntag' && w.tage[1].max === 13 && w.tage[0].regenWahrscheinlichkeit === 80, 'forecast days with German weekday');
assert(calls.some(u => u.includes('latitude=50.93333&longitude=6.95') && u.includes('timezone=Europe%2FBerlin')), 'forecast uses geocoded coordinates and Berlin time');
try { await getWeather('Nirgendwo', { fetchImpl: fakeFetch }); assert(false, 'unknown place'); } catch (e) { assert(/keinen Ort/.test(e.message), 'unknown place → clear message'); }
try { await getWeather('', { fetchImpl: fakeFetch }); assert(false, 'empty place'); } catch (e) { assert(/welchen Ort/.test(e.message), 'no place → asks for city'); }
assert(describeWeather(999).text === 'wechselhaft', 'unknown weather code handled');
const n = await getNews({ fetchImpl: fakeFetch });
assert(n.meldungen.length === 3 && n.meldungen[0].titel === 'Bundestag beschließt neues Gesetz' && n.meldungen[0].kurz === 'Mehr Geld für Schulen & Kitas.', 'news: CDATA + HTML stripped (fallback feed used after 503)');
assert(n.meldungen[1].titel === 'Wetter: Sturm "Xaver" zieht auf' && n.meldungen[1].kurz === 'Warnung für die Küste', 'news: entities decoded');
assert(n.meldungen[2].link === '', 'news: non-https link dropped');
const wiki = await lookupWikipedia('Eiffelturm', { fetchImpl: fakeFetch });
assert(wiki.titel === 'Eiffelturm' && wiki.zusammenfassung.includes('330 Meter') && wiki.link === 'https://de.wikipedia.org/wiki/Eiffelturm', 'wikipedia summary + link');
try { await lookupWikipedia('Quatschwort', { fetchImpl: fakeFetch }); assert(false, 'no result'); } catch (e) { assert(/nichts gefunden/.test(e.message), 'wikipedia: no result message'); }
try { await getNews({ fetchImpl: async () => { throw new Error('offline'); } }); assert(false, 'news offline'); } catch (e) { assert(/nicht erreichbar/.test(e.message), 'news offline → friendly error'); }
let { list } = addMemory([], 'Wohnt in Köln');
({ list } = addMemory(list, 'Mag Pizza'));
assert(addMemory(list, 'wohnt in köln').added === false, 'memory: duplicate ignored');
for (const bad of ['Sein Passwort ist hallo123', 'PIN 1234', 'IBAN DE89 3704 0044 0532 0130 00', 'Kreditkarte 4111 1111 1111 1111']) {
  try { addMemory(list, bad); assert(false, `refuse ${bad}`); } catch { assert(true, `memory refuses: ${bad.slice(0, 24)}`); }
}
assert(forgetMemory(list, 'pizza').removed === 'Mag Pizza', 'memory: forget by keyword');
assert(sanitizeMemories([{ text: 'Passwort: x' }, 'Hat einen Hund']).length === 1, 'sensitive memories from devices filtered too');
const h = sanitizeHistory([{ role: 'system', content: 'x' }, { role: 'user', content: 'Hallo' }, { role: 'assistant', content: 'Hi!' }, { role: 'user', content: '' }]);
assert(JSON.stringify(h) === '[{"type":"History","role":"user","content":"Hallo"},{"type":"History","role":"assistant","content":"Hi!"}]', 'history in Voice Agent format, junk dropped');
