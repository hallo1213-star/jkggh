// iPhone receiver: when Jarvis is open on the iPhone, this keeps a small
// logged-in connection (/phone, session cookie – no token in the page) and
// carries out what Jarvis on the laptop asks: open apps via official app
// links / Apple Shortcuts, prepare WhatsApp voice messages in Jarvis' voice.
// iOS only allows this while the Jarvis page is open and the screen is on.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const KEY = 'jarvis.phoneReceiver';
let deps = { toast: () => {}, chip: null };
let ws = null; let retry = 1500; let pingTimer = 0; let wakeLock = null; let card = null;
export const phoneState = { connected: false, device: null, self: false };

export const isIphone = () => /iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1 && /Mobile|Safari/.test(navigator.userAgent) && screen.width < 1100);
export function receiverWanted() {
  let v = null; try { v = localStorage.getItem(KEY); } catch { /* ignore */ }
  return v === 'on' || (v !== 'off' && isIphone());
}
export function setReceiver(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  if (on) connect(); else { ws?.close(); ws = null; phoneState.self = false; showChip(); }
}

function showChip() {
  const c = deps.chip; if (!c) return;
  // voice not started on the iPhone: say "iPhone bereit" instead of "Offline"
  if (!c.dataset.mode || c.dataset.mode === 'offline') { if (phoneState.self) c.textContent = 'iPhone bereit'; else if (c.textContent === 'iPhone bereit') c.textContent = 'Offline'; }
  if (phoneState.self) c.dataset.phone = 'self';
  else if (phoneState.connected) c.dataset.phone = 'on';
  else delete c.dataset.phone;
  c.title = phoneState.self ? 'Dieses iPhone empfängt Befehle von Jarvis' : phoneState.connected ? `${phoneState.device || 'iPhone'} verbunden` : 'Kein iPhone verbunden';
}
// status pushed by the server to the laptop UI
export function handlePhoneStatus(m) {
  phoneState.connected = Boolean(m.connected); phoneState.device = m.device || null;
  showChip();
  if (m.event?.kind === 'opened' && !phoneState.self) deps.toast(`📱 ${m.event.info || 'App'} ist auf dem iPhone offen.`);
  if (m.event?.kind === 'shared' && !phoneState.self) deps.toast(`📱 Sprachnachricht wurde auf dem iPhone geteilt${m.event.info ? ` (${m.event.info})` : ''}.`);
}

async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* not allowed – fine */ }
}
const send = (m) => { try { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); } catch { /* closed */ } };

function connect() {
  if (document.body.classList.contains('guest-mode') || !receiverWanted() || (ws && ws.readyState <= 1)) return;
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/phone`);
  ws = sock;
  sock.onopen = () => { retry = 1500; phoneState.self = true; showChip(); send({ type: 'hello', device: isIphone() ? 'iPhone' : 'Handy' }); keepAwake(); clearInterval(pingTimer); pingTimer = setInterval(() => send({ type: 'ping' }), 20000); };
  sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.type === 'cmd') run(m); };
  sock.onclose = () => {
    clearInterval(pingTimer); if (ws === sock) ws = null; phoneState.self = false; showChip();
    if (receiverWanted() && document.visibilityState === 'visible') { setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); }
  };
}

// --------------------------------------------------------------------------
// Commands
// --------------------------------------------------------------------------
function closeCard() { card?.remove(); card = null; }
function sheet(title, sub) {
  closeCard();
  card = el('div', 'iph');
  const box = el('div', 'iph-card');
  const head = el('div', 'iph-head');
  const x = el('button', 'iph-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Schließen'); x.addEventListener('click', closeCard);
  head.append(el('p', 'iph-kicker', 'JARVIS · IPHONE'), x);
  box.append(head, el('h3', 'iph-title', title));
  if (sub) box.append(el('p', 'iph-sub', sub));
  card.append(box); document.body.append(card);
  return box;
}

// Resolves 'opened' as soon as iOS switches to the other app.
function leftPage(ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); clearTimeout(t); resolve(v); };
    const onVis = () => { if (document.visibilityState === 'hidden') finish(true); };
    const onHide = () => finish(true);
    document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', onHide);
    const t = setTimeout(() => finish(false), ms);
  });
}

async function openApp(m) {
  const wait = leftPage(2600);
  // official app link / Shortcut; iOS may ask "Öffnen?" or want a tap
  try { location.href = m.url; } catch { /* blocked */ }
  if (await wait) { send({ type: 'ack', id: m.id, ok: true, state: 'opened' }); closeCard(); return; }
  // iOS wants a real tap here → big button (a real link = user gesture)
  const box = sheet(`${m.label} öffnen`, m.via === 'kurzbefehl' ? `Läuft über den Kurzbefehl „${m.shortcut}“.` : 'iOS möchte, dass du einmal tippst.');
  const a = el('a', 'iph-go', `${m.label} öffnen`); a.href = m.url;
  a.addEventListener('click', () => { leftPage(3000).then((ok) => { if (ok) { send({ type: 'event', kind: 'opened', info: m.label }); closeCard(); } }); });
  box.append(a);
  send({ type: 'ack', id: m.id, ok: true, state: 'tap' });
}

async function fetchFile(id, fmt, name) {
  const r = await fetch(`/api/phone/voice?id=${encodeURIComponent(id)}&f=${fmt}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Sprachnachricht nicht abrufbar');
  const blob = await r.blob();
  return new File([blob], `${name}.${fmt === 'mp3' ? 'mp3' : 'ogg'}`, { type: fmt === 'mp3' ? 'audio/mpeg' : 'audio/ogg' });
}
const fileSafe = (s) => String(s || 'Kontakt').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 30) || 'Kontakt';

async function voiceMessage(m) {
  let ogg = null; let mp3 = null;
  try {
    const name = `Sprachnachricht ${fileSafe(m.contact)}`;
    [ogg, mp3] = await Promise.all([m.hasOgg ? fetchFile(m.clip, 'ogg', name).catch(() => null) : null, m.hasMp3 ? fetchFile(m.clip, 'mp3', name).catch(() => null) : null]);
    if (!ogg && !mp3) throw new Error('Keine Audiodatei');
  } catch (e) { send({ type: 'ack', id: m.id, ok: false, state: 'error', info: e.message }); return; }
  const who = m.contact || 'Kontakt';
  const box = sheet(`Sprachnachricht an ${who}`, `„${m.text}“`);
  const audio = el('audio', 'iph-audio'); audio.controls = true; audio.preload = 'auto';
  audio.src = URL.createObjectURL(mp3 || ogg);
  // WhatsApp's own voice format is Ogg/Opus; MP3 when iOS cannot share Ogg
  const shareFile = [ogg, mp3].find((f) => f && navigator.canShare?.({ files: [f] }));
  const go = el('button', 'iph-go', `An ${who} senden (WhatsApp)`); go.type = 'button';
  const steps = el('p', 'iph-steps', `Tippen → „WhatsApp“ wählen → ${who} wählen → Senden.`);
  go.addEventListener('click', async () => {
    if (!shareFile) { steps.textContent = 'Teilen von Dateien geht in diesem Browser nicht – nutze Safari oder „Als Text senden“.'; return; }
    try {
      await navigator.share({ files: [shareFile] });
      send({ type: 'event', kind: 'shared', info: who });
      steps.textContent = 'Geteilt ✓'; setTimeout(closeCard, 1500);
    } catch (e) { if (e?.name !== 'AbortError') steps.textContent = `Teilen nicht möglich: ${e.message}`; }
  });
  const text = el('a', 'iph-alt', 'Als Text senden'); text.href = `whatsapp://send?text=${encodeURIComponent(m.text)}`;
  box.append(audio, go, steps, text);
  send({ type: 'ack', id: m.id, ok: true, state: 'ready' });
  deps.toast(`Sprachnachricht an ${who} ist bereit.`);
}

function run(m) {
  if (m.action === 'open') openApp(m);
  else if (m.action === 'voice') voiceMessage(m);
  else send({ type: 'ack', id: m.id, ok: false, state: 'error', info: 'Unbekannter Befehl' });
}

export function initIphone(options) {
  deps = { ...deps, ...options };
  showChip();
  connect();
  // opened by the Shortcut receiver with a prepared voice message
  try {
    const q = new URLSearchParams(location.search).get('phonecmd');
    if (q) {
      history.replaceState(null, '', location.pathname);
      const bin = atob(q.replace(/-/g, '+').replace(/_/g, '/'));
      const m = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (m.action === 'voice' && m.clip) setTimeout(() => voiceMessage({ ...m, id: 'local' }), 600);
    }
  } catch { /* ignore broken link */ }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { connect(); keepAwake(); } });
}
