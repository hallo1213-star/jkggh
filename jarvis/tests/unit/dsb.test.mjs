import { createPlanWatcher, describeEntry, forClass, loadPlan, matchesClass, parseUntis } from '../../dsb.js';
import { cloudTools } from '../../cloud-tools.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).split('-').map(Number);
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).split('-').map(Number);
const d = ([y, m, dd]) => `${dd}.${m}.${y}`;
const untis = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body>
<div class="mon_title">${d(today)} Mittwoch</div><table class="mon_list"><tr class="list"><th class="list">Klasse(n)</th><th class="list">Stunde</th><th class="list">Vertreter</th><th class="list">Fach</th><th class="list">Raum</th><th class="list">Art</th><th class="list">Text</th></tr>
<tr class="list odd"><td class="list">7D</td><td class="list">3</td><td class="list">---</td><td class="list">M</td><td class="list">---</td><td class="list">Entfall</td><td class="list">Aufgaben im Portal</td></tr>
<tr class="list even"><td class="list">07a, 7d</td><td class="list">5 - 6</td><td class="list">SCH</td><td class="list">E</td><td class="list">B12</td><td class="list">Vertretung</td><td class="list">&nbsp;</td></tr>
<tr class="list odd"><td class="list">8b</td><td class="list">1</td><td class="list">MÜL</td><td class="list">D</td><td class="list">A3</td><td class="list">Raum&auml;nderung</td><td class="list"></td></tr></table>
<div class="mon_title">${d(tomorrow)} Donnerstag</div><table class="mon_list"><tr class="list"><th class="list">Stunde</th><th class="list">Fach</th><th class="list">Art</th></tr>
<tr class="list"><td class="list inline_header" colspan="3">7D</td></tr><tr class="list"><td class="list">2</td><td class="list">Bio</td><td class="list">Entfall</td></tr>
<tr class="list"><td class="list inline_header" colspan="3">9c</td></tr><tr class="list"><td class="list">4</td><td class="list">Ch</td><td class="list">Vertretung</td></tr></table></body></html>`;
const days = parseUntis(untis);
assert(days.length === 2 && days[0].entries.length === 3 && days[0].date, 'Untis-Plan: Tage und Zeilen erkannt');
assert(days[1].entries.find((e) => e.fach === 'Bio').klasse === '7D', 'Plan mit Klassen-Überschriften (inline_header) erkannt');
for (const [field, ok] of [['7D', true], ['07d', true], ['7a, 7D', true], ['(7D)', true], ['7ABD', true], ['7a', false], ['17D', false], ['8D', false]]) assert(matchesClass(field, '7D') === ok, `Klasse „${field}“ ${ok ? 'passt' : 'passt nicht'} zu 7D`);
const mine = forClass({ days }, '7D');
assert(mine[0].entries.length === 2 && mine[1].entries.length === 1, 'nur Einträge der 7D');
assert(describeEntry(mine[0].entries[0]) === '3. Stunde: Entfall M (Aufgaben im Portal)', 'verständlich vorgelesen');
// login + timetable + Latin-1 page through the unofficial API
process.env.DSB_USER = 'schule'; process.env.DSB_PASSWORD = 'geheim'; process.env.DSB_KLASSE = '7D';
const seen = [];
const fake = async (url) => { url = String(url); seen.push(url.replace(/password=[^&]+/, 'password=***')); if (url.includes('/authid')) return new Response('"abc-token"'); if (url.includes('/dsbtimetables')) return new Response(JSON.stringify([{ Title: 'Schüler heute', Childs: [{ Detail: 'https://light.dsbcontrol.de/x/subst_001.htm' }] }, { Title: 'Aushang', Childs: [{ Detail: 'https://light.dsbcontrol.de/x/aushang.png' }] }])); return new Response(Buffer.from(untis, 'latin1')); };
const plan = await loadPlan({ fetchImpl: fake });
assert(plan.days.length === 2 && plan.images.length === 1 && seen[1].includes('authid=abc-token'), 'Anmeldung, Plan-Liste und Seiten laden');
assert(plan.days[0].entries.some((e) => e.art === 'Raumänderung') && plan.days[0].entries.some((e) => e.vertreter === 'MÜL'), 'Umlaute aus Latin-1-Seiten korrekt');
// watcher: first check remembers, a change sends a message
let n = 0; let p = days; const sent = [];
const watch = createPlanWatcher({ load: async () => ({ days: p }), send: async (t) => sent.push(t) });
assert(await watch() === 'gemerkt' && await watch() === 'unverändert' && sent.length === 0, 'Wächter: merkt sich den Plan, keine doppelte Nachricht');
p = parseUntis(untis.replace('Aufgaben im Portal', 'Raum B7'));
assert(await watch() === 'gesendet' && /7D hat sich geändert/.test(sent[0]) && /Raum B7/.test(sent[0]) && !/8b|MÜL/.test(sent[0]), 'Änderung der 7D → Nachricht (ohne andere Klassen)');
n += 1;
// tool
const tool = cloudTools.find((t) => t.name === 'school_plan');
const realFetch = globalThis.fetch; globalThis.fetch = fake; const shown = [];
const r = await tool.run({ tag: 'heute' }, { showVisual: (m) => shown.push(m) });
assert(r.klasse === '7D' && r.tage[0].aenderungen.length === 2 && shown[0].days[0].entries.length === 2, 'Werkzeug: „Hab ich heute Vertretung?“ → 2 Änderungen der 7D');
const r2 = await tool.run({ tag: 'morgen' }, { showVisual: () => {} });
assert(r2.tage[0].aenderungen[0].includes('Bio'), 'morgen: Bio fällt aus');
globalThis.fetch = realFetch;
delete process.env.DSB_USER;
let err = ''; try { await loadPlan({ fetchImpl: fake }); } catch (e) { err = e.message; } assert(/DSB_USER und DSB_PASSWORD/.test(err), 'ohne Zugang: klare Anleitung');
