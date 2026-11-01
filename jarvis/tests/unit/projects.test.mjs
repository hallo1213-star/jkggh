const P = await import('../../projects.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const p = P.parseProject('Hier:\nTITEL: Rechner\nART: werkzeug\nBESCHREIBUNG: Ein Taschenrechner.\n=== DATEI: index.html ===\n```html\n<h1>x</h1>\n```\n=== ENDE ===\n=== DATEI: ../etc/passwd ===\nboom\n=== ENDE ===\n=== DATEI: App.JS ===\nalert(1)\n=== ENDE ===');
assert(p.title === 'Rechner' && p.kind === 'werkzeug' && p.description === 'Ein Taschenrechner.', 'header fields');
assert(p.files.length === 2 && p.files[0].content === '<h1>x</h1>' && p.files[1].path === 'app.js', 'files parsed, fences stripped, bad path dropped, lowercased');
const s = P.sanitizeProject({ title: '<x>', kind: 'virus', files: [{ path: 'index.html', content: 'a'.repeat(299000) }, { path: 'b.js', content: 'b'.repeat(5000) }] });
assert(s.kind === 'app' && !s.title.includes('<') && s.files.length === 1, 'kind/title cleaned, size limit');
let calls = 0;
const proj = await P.writeProject('Spiel', { generate: async () => (++calls === 1 ? 'kaputt' : 'TITEL: A\nART: spiel\nBESCHREIBUNG: b\n=== DATEI: index.html ===\nok\n=== ENDE ===') });
assert(calls === 2 && proj.files[0].content === 'ok', 'retry when format broken');
try { await P.writeProject('x', { generate: async () => 'nix' }); assert(false, 'x'); } catch (e) { assert(/unvollständig/.test(e.message), 'incomplete answer explained'); }
let seen = '';
await P.writeProject('schwerer', { base: proj, generate: async ({ prompt }) => { seen = prompt; return 'TITEL: A\nART: spiel\nBESCHREIBUNG: b\n=== DATEI: index.html ===\nok2\n=== ENDE ==='; } });
assert(seen.includes('Änderungswunsch: schwerer') && seen.includes('=== DATEI: index.html ===\nok'), 'edit sends existing files');
