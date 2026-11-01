const M = await import('../../memories.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const old = M.sanitizeMemories([{ text: 'Wohnt in Köln' }, { text: 'Arbeitet am Projekt Jarvis Studio' }, 'Stil: Butler']);
assert(old.length === 3 && old.every((m) => m.id && m.updatedAt) && old[0].category === 'praeferenz' && old[1].category === 'projekt', 'old memories kept and categorised');
let { list, added } = M.addMemory(old, 'Hat sich für ein dunkles Design entschieden', { category: 'entscheidung', links: 'Jarvis Studio, Jarvis' });
assert(added && list.at(-1).links.join() === 'Jarvis Studio,Jarvis' && list.at(-1).category === 'entscheidung', 'add with category and links');
const again = M.addMemory(list, 'wohnt in köln', { links: ['Familie'] });
assert(!again.added && again.list.find((m) => m.text === 'Wohnt in Köln').links.includes('Familie'), 'duplicate enriches links instead of duplicating');
const id = list[0].id;
const upd = M.updateMemory(list, id, { text: 'Wohnt in Berlin', category: 'praeferenz' });
assert(upd.find((m) => m.id === id).text === 'Wohnt in Berlin', 'update by id');
try { M.updateMemory(list, id, { text: 'Mein Passwort ist 1234' }); assert(false, 'x'); } catch { assert(true, 'sensitive update refused'); }
try { M.addMemory(list, 'PIN 1234 fürs Handy'); assert(false, 'x'); } catch { assert(true, 'PIN refused'); }
assert(M.removeMemoryById(upd, id).length === upd.length - 1, 'delete by id');
