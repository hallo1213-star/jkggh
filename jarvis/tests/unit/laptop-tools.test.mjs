import { tools, findTool, functionDefinitions } from '../../laptop/tools.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const ctx = { scheduled: [], schedule(ms, msg) { this.scheduled.push([ms, msg]); } };
const base = path.join(os.homedir(), 'jarvis-test');
await fs.rm(base, { recursive: true, force: true });

assert(functionDefinitions.length === tools.length, `${tools.length} function definitions`);
assert(functionDefinitions.every(f => f.name && f.description && f.parameters?.type === 'object'), 'all definitions have name/description/object params');
assert(functionDefinitions.filter(f => f.defer_until_eot).map(f => f.name).join() === 'open_path,write_text_file,move_path,delete_path,install_software,uninstall_software,power_action,run_powershell', 'confirm tools deferred until end of turn');
assert(new Set(functionDefinitions.map(f=>f.name)).size === tools.length, 'unique names');

const t = (n) => findTool(n);
await t('create_folder').run({ path: 'jarvis-test/sub' });
assert((await fs.stat(path.join(base, 'sub'))).isDirectory(), 'create_folder');
// write new file: no confirm needed
assert(await t('write_text_file').confirm({ path: 'jarvis-test/notiz.txt', content: 'x' }) === null, 'new file needs no confirm');
await t('write_text_file').run({ path: 'jarvis-test/notiz.txt', content: 'Milch\nBrot äöü' });
const c = await t('write_text_file').confirm({ path: 'jarvis-test/notiz.txt', content: 'y' });
assert(c && c.title.includes('überschreiben'), 'existing file needs confirm');
const r = await t('read_text_file').run({ path: 'jarvis-test/notiz.txt' });
assert(r.inhalt.includes('äöü'), 'read_text_file utf8');
const l = await t('list_files').run({ folder: 'jarvis-test' });
assert(l.eintraege.some(e => e.name === 'notiz.txt' && e.typ === 'Datei') && l.eintraege.some(e => e.name === 'sub' && e.typ === 'Ordner'), 'list_files');
const f = await t('find_files').run({ query: 'notiz', folder: 'jarvis-test' });
assert(f.treffer.length === 1, 'find_files');
await t('move_path').run({ from: 'jarvis-test/notiz.txt', to: 'jarvis-test/sub/liste.txt' });
assert((await fs.readFile(path.join(base, 'sub/liste.txt'), 'utf8')).startsWith('Milch'), 'move_path');
// write without folder → Documents/Jarvis
const w = await t('write_text_file').confirm({ path: 'nurname.txt' });
assert(w === null, 'plain name resolves into Documents/Jarvis (no confirm)');
// protections
for (const p of ['/', os.homedir(), 'Desktop', 'Dokumente']) {
  try { await t('move_path').run({ from: p, to: 'jarvis-test/x' + Math.random() }); assert(false, `protect ${p}`); }
  catch (e) { assert(/geschützt/.test(e.message), `move refuses protected ${p}`); }
}
// confirm flags
assert((await t('delete_path').confirm({ path: 'Downloads/a.txt' })).detail.endsWith(path.join('Downloads', 'a.txt')), 'delete confirm shows resolved path');
assert(await t('open_path').confirm({ path: 'Downloads/setup.exe' }), 'open .exe needs confirm');
assert(await t('open_path').confirm({ path: 'Downloads/foto.jpg' }) === null, 'open .jpg no confirm');
assert(await t('power_action').confirm({ action: 'lock' }) === null, 'lock no confirm');
assert(await t('power_action').confirm({ action: 'shutdown' }), 'shutdown confirm');
assert((await t('run_powershell').confirm({ command: 'Get-Date', purpose: 'Datum' })).code === true, 'powershell confirm shows code');
// windows-only tools fail gracefully on linux
try { await t('pc_open_website').run({ url: 'javascript:alert(1)' }); assert(false, 'reject js url'); } catch (e) { assert(/http/.test(e.message), 'rejects non-http url'); }
try { await t('open_app').run({ name: 'spotify' }); } catch (e) { assert(/Windows/.test(e.message), 'windows-only message on linux'); }
await fs.rm(base, { recursive: true, force: true });
