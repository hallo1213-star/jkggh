const M = await import('../../model3d.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const s = M.sanitizeScene({ title: '<b>X</b>', ground: 'lava', sky: 'nacht', items: [{ type: 'house', position: [1, 2, 3], rotation: 999, params: { floors: 2, color: 'red', evil: '<script>', __proto__x: 1 } }, { type: 'bomb' }, { type: 'text', params: { text: 'a'.repeat(99) } }, ...Array(400).fill({ type: 'tree' })] });
assert(s.title === 'b X /b' || !s.title.includes('<'), 'no html in title');
assert(s.ground === 'gras' && s.sky === 'nacht', 'unknown ground replaced');
assert(s.items[0].rotation === 360 && s.items[0].params.color === undefined && s.items.every((i) => i.type !== 'bomb'), 'invalid values/types dropped');
assert(s.items.length === 300, 'item limit');
assert(s.items[1].params.text.length === 24, 'text clipped');
const f = M.fallbackScene('futuristische Stadt mit fliegenden Autos');
assert(f.items[0].type === 'city' && f.items[0].params.flyingCars > 0, 'fallback city');
const h = M.fallbackScene('Haus mit Pool');
assert(h.items.some((i) => i.type === 'pool') && h.items.some((i) => i.type === 'house'), 'fallback house');
const d = await M.designScene('Burg', { generate: async () => { throw new Error('down'); } });
assert(d.items.length > 0 && /eingebauten Generator/.test(d.hinweis), 'AI failure → built-in generator');
try { await M.designScene('x', { base: h, generate: async () => { throw new Error('down'); } }); assert(false, 'x'); } catch (e) { assert(/Änderung/.test(e.message), 'edit failure explained'); }
