import { buildMindmap, extendMap, normalizeMap } from '../../mindmap.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
let seen;
const map = await buildMindmap('Vulkane', { generate: async (o) => { seen = o; return { thema: 'Vulkane', aeste: [{ text: 'Entstehung', punkte: ['Plattengrenzen', 'Magma steigt auf'] }, { text: '' }, { text: 'Arten', punkte: ['Schildvulkan', { text: 'Schichtvulkan' }] }] }; } });
assert(/Vulkane/.test(seen.prompt), 'topic goes to the AI');
assert(map.aeste.length === 2 && map.aeste[1].kinder[1] === 'Schichtvulkan', 'empty branches dropped, objects flattened');
const m2 = extendMap(map, 'Ausbruch');
assert(m2.aeste.length === 3 && m2.aeste[2].text === 'Ausbruch', 'unknown branch → new branch');
const m3 = extendMap(m2, 'Pyroklastischer Strom', 'ausbruch');
assert(m3.aeste[2].kinder[0] === 'Pyroklastischer Strom', 'point added to the named branch');
let threw = false; try { normalizeMap({ aeste: [] }); } catch { threw = true; }
assert(threw, 'empty map → honest error');
