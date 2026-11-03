// iPhone link: the Jarvis page on the iPhone keeps a small authenticated
// WebSocket (/phone) open. Jarvis sends it commands ("open WhatsApp",
// "voice message for Marie"); the page performs them with official iOS app
// links (URL schemes) or Apple Shortcuts. iOS lets no website or computer
// control an iPhone directly, so everything runs through that open page.
import { randomBytes } from 'node:crypto';

// Official / documented app links. search = link with a search term.
export const APPS = {
  whatsapp: { label: 'WhatsApp', url: 'whatsapp://', alias: ['whats app', 'wa'] },
  instagram: { label: 'Instagram', url: 'instagram://app', alias: ['insta'] },
  youtube: { label: 'YouTube', url: 'youtube://', search: (q) => `youtube://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, alias: ['you tube', 'yt'] },
  spotify: { label: 'Spotify', url: 'spotify://', search: (q) => `spotify:search:${encodeURIComponent(q)}` },
  nachrichten: { label: 'Nachrichten', url: 'sms:', alias: ['messages', 'imessage', 'sms', 'meine nachrichten'] },
  mail: { label: 'Mail', url: 'message://', alias: ['e-mail', 'email', 'mails'] },
  karten: { label: 'Karten', url: 'maps://', search: (q) => `maps://?q=${encodeURIComponent(q)}`, alias: ['apple maps', 'maps'] },
  musik: { label: 'Musik', url: 'music://', alias: ['apple music', 'music'] },
  kalender: { label: 'Kalender', url: 'calshow://', alias: ['calendar'] },
  telegram: { label: 'Telegram', url: 'tg://' },
  snapchat: { label: 'Snapchat', url: 'snapchat://', alias: ['snap'] },
  netflix: { label: 'Netflix', url: 'nflx://' },
  discord: { label: 'Discord', url: 'discord://' },
  googlemaps: { label: 'Google Maps', url: 'comgooglemaps://', search: (q) => `comgooglemaps://?q=${encodeURIComponent(q)}`, alias: ['google maps'] },
  // No public app link exists → Apple Shortcut "Jarvis <Name>" (one-time setup).
  kamera: { label: 'Kamera', shortcut: 'Jarvis Kamera', alias: ['camera', 'die kamera'] },
  einstellungen: { label: 'Einstellungen', shortcut: 'Jarvis Einstellungen', alias: ['settings', 'die einstellungen'] },
  fotos: { label: 'Fotos', shortcut: 'Jarvis Fotos', alias: ['photos', 'galerie', 'bilder'] },
  tiktok: { label: 'TikTok', shortcut: 'Jarvis TikTok', alias: ['tik tok'] }
};

const clean = (x) => String(x || '').trim().toLowerCase().replace(/^(die|den|das|meine?n?)\s+/, '').replace(/[„“"'.!?]/g, '').replace(/\s+/g, ' ');
const shortcutUrl = (name, input = '') => `shortcuts://run-shortcut?name=${encodeURIComponent(name)}${input ? `&input=text&text=${encodeURIComponent(input)}` : ''}`;

// "WhatsApp", "die Kamera", "you tube" → { key, label, url, via }
export function resolveApp(name, query = '') {
  const n = clean(name);
  if (!n) return null;
  const key = Object.keys(APPS).find((k) => k === n.replace(/\s/g, '') || APPS[k].label.toLowerCase() === n || (APPS[k].alias || []).includes(n));
  const q = String(query || '').trim().slice(0, 120);
  if (key) {
    const app = APPS[key];
    if (app.shortcut) return { key, label: app.label, url: shortcutUrl(app.shortcut, q), via: 'kurzbefehl', shortcut: app.shortcut };
    return { key, label: app.label, url: q && app.search ? app.search(q) : app.url, via: 'app-link', searched: Boolean(q && app.search) };
  }
  // any other app: works once he creates the Shortcut "Jarvis <App>" (modular)
  const label = String(name).trim().replace(/^(die|den|das)\s+/i, '').slice(0, 40);
  const pretty = label.charAt(0).toUpperCase() + label.slice(1);
  return { key: null, label: pretty, url: shortcutUrl(`Jarvis ${pretty}`, q), via: 'kurzbefehl', shortcut: `Jarvis ${pretty}` };
}

// --------------------------------------------------------------------------
// Connected iPhones (authenticated /phone sockets)
// --------------------------------------------------------------------------
export function createPhoneHub({ onStatus = () => {}, ackTimeoutMs = 9000, turboWaitMs = 30_000 } = {}) {
  const phones = new Set();
  const waiting = new Map();
  const clips = new Map();
  let seq = 0;
  const OPEN = 1;
  const live = () => [...phones].filter((p) => p.ws.readyState === OPEN);
  const newest = () => live().sort((a, b) => b.lastSeen - a.lastSeen)[0] || null;
  // "Turbo" receiver: an Apple Shortcut on the iPhone that long-polls /api/phone/next
  // and opens app links itself – iOS asks no confirmation for Shortcuts.
  const turbo = { lastPoll: 0, waiter: null, queue: [], wasActive: false };
  const turboActive = () => Boolean(turbo.waiter) || Date.now() - turbo.lastPoll < 120_000;
  const status = () => {
    const p = newest();
    if (p) return { connected: true, device: turboActive() ? `${p.device} + Kurzbefehl` : p.device, since: p.since, turbo: turboActive(), page: true };
    return turboActive() ? { connected: true, device: 'iPhone (Kurzbefehl)', since: turbo.lastPoll, turbo: true, page: false } : { connected: false, device: null, since: null, turbo: false, page: false };
  };
  const checkTurbo = () => { const a = turboActive(); if (a !== turbo.wasActive) { turbo.wasActive = a; onStatus(status()); } };

  // the Shortcut asks for the next command (waits up to timeoutMs)
  function poll(timeoutMs = 25_000) {
    turbo.lastPoll = Date.now();
    if (turbo.waiter) turbo.waiter.resolve(null);
    const next = turbo.queue.shift();
    checkTurbo();
    if (next) { next.delivered(); return Promise.resolve(next.command); }
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (turbo.waiter?.resolve === done) turbo.waiter = null; turbo.lastPoll = Date.now(); resolve(null); }, timeoutMs);
      function done(command) { clearTimeout(timer); turbo.lastPoll = Date.now(); resolve(command); }
      turbo.waiter = { resolve: done };
    });
  }
  function toTurbo(command) {
    return new Promise((resolve) => {
      const item = { command, delivered: () => { clearTimeout(timer); resolve({ ok: true, state: 'opened', via: 'kurzbefehl' }); } };
      // iOS sometimes pauses the Shortcut for a moment → wait up to 30 s for its next request
      const timer = setTimeout(() => { turbo.queue = turbo.queue.filter((x) => x !== item); resolve({ ok: false, state: 'timeout' }); }, Math.max(ackTimeoutMs, turboWaitMs));
      if (turbo.waiter) { const w = turbo.waiter; turbo.waiter = null; item.delivered(); w.resolve(command); } else turbo.queue.push(item);
    });
  }

  function attach(ws) {
    const phone = { ws, device: 'iPhone', since: Date.now(), lastSeen: Date.now(), isAlive: true };
    phones.add(phone);
    ws.on('pong', () => { phone.isAlive = true; });
    ws.on('message', (data) => {
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      phone.lastSeen = Date.now();
      if (m.type === 'hello') { phone.device = String(m.device || 'iPhone').slice(0, 40); onStatus(status()); }
      else if (m.type === 'ack' && waiting.has(m.id)) waiting.get(m.id)(m);
      else if (m.type === 'event') onStatus(status(), m);
      else if (m.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    });
    ws.on('close', () => { phones.delete(phone); onStatus(status()); });
    onStatus(status());
  }

  // sends a command to the most recently active iPhone and waits for its answer
  function send(command) {
    const phone = newest();
    // opening apps: the Shortcut does it without any confirmation → preferred
    if (turboActive() && command.action === 'open') return toTurbo({ url: command.url, label: command.label || '' });
    if (!phone && turboActive() && command.turboUrl) return toTurbo({ url: command.turboUrl, label: command.label || '' }).then((r) => (r.ok ? { ok: true, state: 'ready', via: 'kurzbefehl' } : r));
    if (!phone) return Promise.resolve({ ok: false, state: 'offline' });
    const id = `p${(seq += 1)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, state: 'timeout' }); }, ackTimeoutMs);
      waiting.set(id, (m) => { clearTimeout(timer); waiting.delete(id); resolve({ ok: Boolean(m.ok), state: String(m.state || ''), info: String(m.info || '').slice(0, 200) }); });
      phone.ws.send(JSON.stringify({ ...command, type: 'cmd', id }));
    });
  }

  // generated voice clips, fetched once by the iPhone (kept 15 minutes)
  function storeClip(files) {
    const id = randomBytes(12).toString('hex');
    clips.set(id, { ...files, created: Date.now() });
    for (const [k, v] of clips) if (Date.now() - v.created > 15 * 60_000) clips.delete(k);
    return id;
  }
  const clip = (id) => clips.get(String(id || '')) || null;

  const turboTimer = setInterval(checkTurbo, 10_000);
  turboTimer.unref?.();
  const heartbeat = setInterval(() => {
    for (const p of phones) { if (!p.isAlive) { p.ws.terminate(); continue; } p.isAlive = false; try { p.ws.ping(); } catch { /* closed */ } }
  }, 25_000);
  heartbeat.unref?.();

  return { attach, send, poll, status, storeClip, clip, get count() { return live().length; } };
}

// Tool replies for the voice AI (German, short).
export function openReply(app, result) {
  if (result.state === 'offline') return { ok: false, fehler: 'Das iPhone ist nicht verbunden. Er soll auf dem iPhone den Kurzbefehl „Jarvis Empfänger“ starten (in der Kurzbefehle-Übersicht antippen, nicht im Bearbeiten-Fenster) – oder Jarvis in Safari offen lassen.' };
  if (result.state === 'timeout') return { ok: false, fehler: 'Das iPhone hat nicht geantwortet. Wahrscheinlich wurde der Kurzbefehl „Jarvis Empfänger“ von iOS angehalten oder Jarvis ist dort im Hintergrund – er soll den Kurzbefehl neu starten (in der Kurzbefehle-Übersicht antippen).' };
  if (result.state === 'opened') return { ok: true, geoeffnet: app.label, hinweis: `${app.label} ist auf dem iPhone offen${app.searched ? ' (mit Suche)' : ''}. Kurz bestätigen.` };
  if (result.state === 'tap') return { ok: true, geoeffnet: false, hinweis: `iOS verlangt hier einen Tipp: Auf dem iPhone steht jetzt ein Knopf „${app.label} öffnen“ – einmal antippen.${app.via === 'kurzbefehl' ? ` Falls dann nichts passiert, fehlt der Kurzbefehl „${app.shortcut}“ (Anleitung im README).` : ''} Ohne Tippen geht es mit dem Kurzbefehl „Jarvis Empfänger“ (README).` };
  return { ok: false, fehler: result.info || `${app.label} konnte auf dem iPhone nicht geöffnet werden. Ist die App installiert?` };
}

// --------------------------------------------------------------------------
// Voice clip in Jarvis' own voice: ElevenLabs if that is his live voice,
// otherwise Deepgram. Delivered as Ogg/Opus (WhatsApp's voice-note format)
// plus MP3 as fallback.
// --------------------------------------------------------------------------
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function elevenLabsMp3(text, { fetchImpl = fetch } = {}) {
  const voice = process.env.ELEVENLABS_VOICE_ID.trim();
  const r = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY.trim(), 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL?.trim() || 'eleven_turbo_v2_5', language_code: 'de' }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!r.ok) throw new Error(`ElevenLabs-Stimme: Status ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function mp3ToOgg(mp3, ffmpeg) {
  if (!ffmpeg) return null;
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-voice-'));
  try {
    await writeFile(join(dir, 'in.mp3'), mp3);
    await new Promise((resolve, reject) => execFile(ffmpeg, ['-y', '-i', join(dir, 'in.mp3'), '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', join(dir, 'out.ogg')], { timeout: 30_000 }, (e) => (e ? reject(e) : resolve())));
    return await readFile(join(dir, 'out.ogg'));
  } catch { return null; } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// deps: { elevenLabs: bool, synth(text, {format}), eleven(text), ffmpeg }
export async function makeVoiceClip(text, deps) {
  const words = String(text || '').trim().slice(0, 1200);
  if (!words) throw new Error('Was soll in der Sprachnachricht stehen?');
  if (deps.elevenLabs) {
    try {
      const mp3 = await deps.eleven(words);
      return { mp3, ogg: await mp3ToOgg(mp3, deps.ffmpeg), voice: 'elevenlabs' };
    } catch (error) { deps.log?.warn?.(`ElevenLabs für Sprachnachricht nicht möglich (${error.message}) – nutze Deepgram.`); }
  }
  const [ogg, mp3] = await Promise.all([deps.synth(words, { format: 'ogg' }), deps.synth(words, { format: 'mp3' }).catch(() => null)]);
  return { ogg: Buffer.from(ogg), mp3: mp3 ? Buffer.from(mp3) : null, voice: 'deepgram' };
}
