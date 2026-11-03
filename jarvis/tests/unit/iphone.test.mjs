import { EventEmitter } from 'node:events';
import { createPhoneHub, makeVoiceClip, openReply, resolveApp } from '../../iphone.js';
import { cloudTools } from '../../cloud-tools.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };

assert(resolveApp('WhatsApp').url === 'whatsapp://' && resolveApp('whats app').key === 'whatsapp', 'WhatsApp → offizieller App-Link');
assert(resolveApp('Insta').url === 'instagram://app' && resolveApp('YouTube').url === 'youtube://' && resolveApp('Spotify').url === 'spotify://', 'Instagram, YouTube, Spotify');
assert(resolveApp('YouTube', 'lustige Katzen').url === 'youtube://www.youtube.com/results?search_query=lustige%20Katzen', 'YouTube mit Suche');
assert(resolveApp('Spotify', 'Drake').url === 'spotify:search:Drake', 'Spotify mit Suche');
assert(resolveApp('meine Nachrichten').url === 'sms:', 'Nachrichten');
assert(resolveApp('die Kamera').url === 'shortcuts://run-shortcut?name=Jarvis%20Kamera' && resolveApp('Einstellungen').shortcut === 'Jarvis Einstellungen', 'Kamera/Einstellungen über Kurzbefehl (kein offizieller App-Link)');
assert(resolveApp('duolingo').url === 'shortcuts://run-shortcut?name=Jarvis%20Duolingo', 'jede andere App über Kurzbefehl „Jarvis <App>“ (erweiterbar)');
assert(resolveApp('') === null, 'leerer Name');

class FakeWs extends EventEmitter { readyState = 1; sent = []; send(d) { this.sent.push(JSON.parse(d)); } ping() {} terminate() { this.readyState = 3; this.emit('close'); } }
const statuses = [];
const hub = createPhoneHub({ onStatus: (s, e) => statuses.push({ ...s, e }), ackTimeoutMs: 200 });
assert((await hub.send({ action: 'open' })).state === 'offline', 'ohne iPhone: offline');
const ws = new FakeWs(); hub.attach(ws); ws.emit('message', JSON.stringify({ type: 'hello', device: 'iPhone' }));
assert(hub.status().connected && hub.status().device === 'iPhone' && statuses.at(-1).connected, 'iPhone meldet sich an, Status geht an den Laptop');
const p = hub.send({ action: 'open', url: 'whatsapp://' });
const cmd = ws.sent.at(-1);
assert(cmd.type === 'cmd' && cmd.url === 'whatsapp://' && cmd.id, 'Befehl geht ans iPhone');
ws.emit('message', JSON.stringify({ type: 'ack', id: cmd.id, ok: true, state: 'opened' }));
assert((await p).state === 'opened', 'Rückmeldung „geöffnet“ kommt zurück');
assert((await hub.send({ action: 'open' })).state === 'timeout', 'keine Antwort → timeout');
ws.emit('message', JSON.stringify({ type: 'event', kind: 'shared', info: 'Marie' }));
assert(statuses.at(-1).e?.kind === 'shared', 'Ereignis (geteilt) geht an den Laptop');
const id = hub.storeClip({ ogg: Buffer.from('o'), mp3: Buffer.from('m') });
assert(hub.clip(id).ogg.toString() === 'o' && hub.clip('falsch') === null && id.length === 24, 'Audio nur mit zufälliger ID abrufbar');
ws.emit('close'); assert(!hub.status().connected, 'Trennen wird erkannt');

const wa = resolveApp('WhatsApp');
assert(openReply(wa, { state: 'opened' }).ok && /offen/.test(openReply(wa, { state: 'opened' }).hinweis), 'Antwort: geöffnet');
assert(/tippen|Tipp/i.test(openReply(wa, { state: 'tap' }).hinweis), 'Antwort: iOS will einen Tipp');
assert(/nicht verbunden/.test(openReply(wa, { state: 'offline' }).fehler), 'Antwort: nicht verbunden');

const calls = [];
const synth = async (t, o) => { calls.push(o.format); return new Uint8Array([o.format === 'ogg' ? 1 : 2]); };
const c1 = await makeVoiceClip('Hey Marie', { elevenLabs: false, synth });
assert(c1.ogg[0] === 1 && c1.mp3[0] === 2 && calls.includes('ogg') && calls.includes('mp3'), 'Deepgram-Stimme: Ogg/Opus + MP3');
const c2 = await makeVoiceClip('Hey Marie', { elevenLabs: true, eleven: async () => Buffer.from([9]), synth, ffmpeg: null });
assert(c2.voice === 'elevenlabs' && c2.mp3[0] === 9, 'ElevenLabs-Stimme, wenn das Jarvis-Stimme ist');
const c3 = await makeVoiceClip('Hey', { elevenLabs: true, eleven: async () => { throw new Error('x'); }, synth, log: { warn() {} } });
assert(c3.voice === 'deepgram', 'ElevenLabs-Fehler → Deepgram');
let err = ''; try { await makeVoiceClip('  ', { synth }); } catch (e) { err = e.message; } assert(err !== '', 'leere Nachricht abgelehnt');

const tool = cloudTools.find((t) => t.name === 'iphone_control');
const seen = [];
const ctx = { phone: { status: () => ({ connected: true, device: 'iPhone' }), open: async (a, q) => (seen.push(['open', a, q]), { ok: true }), voice: async (c, t) => (seen.push(['voice', c, t]), { ok: true }) } };
await tool.run({ action: 'oeffnen', app: 'Spotify' }, ctx);
await tool.run({ action: 'sprachnachricht', contact: 'Marie', text: 'Ich komme später.' }, ctx);
assert(seen[0][1] === 'Spotify' && seen[1][1] === 'Marie' && seen[1][2] === 'Ich komme später.', 'Werkzeug iphone_control leitet weiter');
err = ''; try { await tool.run({ action: 'sprachnachricht', contact: 'Marie' }, ctx); } catch (e) { err = e.message; } assert(/Was soll/.test(err), 'Sprachnachricht ohne Text wird nachgefragt');
assert((await tool.run({ action: 'status' }, ctx)).verbunden === true, 'Status');

// Turbo receiver (Apple Shortcut long-poll)
const hub2 = createPhoneHub({ ackTimeoutMs: 300 });
assert(!hub2.status().connected, 'ohne Kurzbefehl: nicht verbunden');
const pollP = hub2.poll(500);
assert(hub2.status().connected && hub2.status().turbo, 'Kurzbefehl fragt → iPhone gilt als verbunden');
const sendP = hub2.send({ action: 'open', url: 'whatsapp://', label: 'WhatsApp' });
assert((await pollP).url === 'whatsapp://', 'Kurzbefehl bekommt den App-Link sofort');
assert((await sendP).state === 'opened', 'Öffnen über Kurzbefehl = ohne Bestätigung');
const queued = hub2.send({ action: 'open', url: 'spotify://' });
assert((await hub2.poll(500)).url === 'spotify://' && (await queued).state === 'opened', 'Befehl zwischen zwei Abfragen wartet in der Schlange');
assert((await hub2.poll(50)) === null, 'nichts zu tun → leere Antwort');
const v = hub2.send({ action: 'voice', turboUrl: 'https://x/?phonecmd=abc' });
assert((await hub2.poll(500)).url === 'https://x/?phonecmd=abc' && (await v).state === 'ready', 'Sprachnachricht über Kurzbefehl öffnet die Jarvis-Seite mit der Karte');
const ws2 = new FakeWs(); hub2.attach(ws2);
const viaPage = hub2.send({ action: 'voice', turboUrl: 'https://x/?phonecmd=abc' });
assert(ws2.sent.at(-1)?.action === 'voice', 'ist Jarvis auf dem iPhone offen, geht die Sprachnachricht direkt dorthin');
ws2.emit('message', JSON.stringify({ type: 'ack', id: ws2.sent.at(-1).id, ok: true, state: 'ready' })); await viaPage;
