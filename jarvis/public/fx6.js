// Geheimagent (secret code, encrypted in the browser with a code word that is
// never stored or sent) and Escape-Room (3 puzzles with countdown).
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let audio = null;
function tone(f, dur, type = 'square', vol = 0.06, to = f, delay = 0) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); const t = audio.currentTime + delay; const o = audio.createOscillator(); const g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ } }

// ======================================================================
// Crypto: PBKDF2 (SHA-256) → AES-GCM. Format: JV1.<base64url(salt|iv|data)>
// ======================================================================
const enc = new TextEncoder();
const b64u = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (text) => { const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function keyFor(code, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptText(text, code) {
  if (!String(code || '').trim()) throw new Error('Codewort fehlt');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(code, salt), enc.encode(String(text))));
  const all = new Uint8Array(28 + data.length); all.set(salt, 0); all.set(iv, 16); all.set(data, 28);
  return `JV1.${b64u(all)}`;
}
export async function decryptText(secret, code) {
  const m = String(secret || '').trim().match(/JV1\.([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('Das ist kein Jarvis-Geheimcode (er beginnt mit JV1.).');
  const all = unb64u(m[1]);
  if (all.length < 29) throw new Error('Der Code ist unvollständig.');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(16, 28) }, await keyFor(String(code || ''), all.slice(0, 16)), all.slice(28));
    return new TextDecoder().decode(plain);
  } catch { throw new Error('Falsches Codewort – Zugriff verweigert.'); }
}

// ======================================================================
// Geheimagent overlay
// ======================================================================
let agent = null;
const GLYPHS = '█▓▒░#@$%&*+=?!<>/\\|ΞΣΔΩ01';
function scramble(node, target, ms = 1400) {
  return new Promise((done) => {
    const start = performance.now();
    const len = Math.max(target.length, 12);
    const frame = (now) => {
      if (!node.isConnected) return done();
      const k = Math.min(1, (now - start) / ms);
      const fixed = Math.floor(k * target.length);
      let s = target.slice(0, fixed);
      for (let i = fixed; i < Math.min(len, target.length + 4); i += 1) s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      node.textContent = k >= 1 ? target : s;
      if (Math.random() < 0.35) tone(900 + Math.random() * 1400, 0.03, 'square', 0.02);
      if (k < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
}
export function closeSecret() { agent?.remove(); agent = null; }
export function openSecret({ action = 'verschluesseln', text = '' } = {}) {
  closeEscape();
  if (!agent) {
    document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx6' }));
    agent = el('div', 'agent');
    agent.innerHTML = `<div class="agent-card"><header><p class="agent-kicker">JARVIS · GEHEIMDIENST</p><button type="button" class="agent-x" aria-label="Schließen">✕</button></header>
      <div class="agent-tabs" role="tablist"><button type="button" data-tab="verschluesseln">🔒 Verschlüsseln</button><button type="button" data-tab="entschluesseln">🔓 Entschlüsseln</button></div>
      <section class="agent-pane" data-pane="verschluesseln"><label>Geheime Nachricht<textarea class="agent-text" rows="3" maxlength="1000" placeholder="Treffpunkt: Schulhof, 15 Uhr"></textarea></label>
        <label>Codewort (nur dein Freund kennt es)<input class="agent-code" type="password" autocomplete="off" maxlength="64" placeholder="z. B. Falke7"></label>
        <button type="button" class="agent-go">Verschlüsseln</button>
        <div class="agent-out" hidden><p class="agent-label">GEHEIMCODE</p><p class="agent-cipher"></p><button type="button" class="agent-copy">📋 Kopieren</button><p class="agent-note">Schick deinem Freund den Code – das Codewort sagst du ihm persönlich. Ohne Codewort kann ihn niemand lesen, auch Jarvis nicht.</p></div></section>
      <section class="agent-pane" data-pane="entschluesseln" hidden><label>Geheimcode<textarea class="agent-in" rows="3" placeholder="JV1.…"></textarea></label>
        <label>Codewort<input class="agent-code2" type="password" autocomplete="off" maxlength="64"></label>
        <button type="button" class="agent-go2">Entschlüsseln</button>
        <div class="agent-out2" hidden><p class="agent-label">NACHRICHT</p><p class="agent-plain"></p></div></section>
      <p class="agent-status" role="status"></p></div>`;
    document.body.append(agent);
    const q = (s) => agent.querySelector(s);
    const status = (t, bad) => { q('.agent-status').textContent = t; q('.agent-status').classList.toggle('bad', Boolean(bad)); };
    const tab = (name) => { agent.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name)); agent.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; }); status(''); };
    agent.tab = tab;
    agent.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
    q('.agent-x').addEventListener('click', closeSecret);
    q('.agent-go').addEventListener('click', async () => {
      const text2 = q('.agent-text').value.trim(); const code = q('.agent-code').value;
      if (!text2) return status('Schreib zuerst eine Nachricht.', true);
      if (code.trim().length < 3) return status('Das Codewort braucht mindestens 3 Zeichen.', true);
      status('Verschlüssele …');
      try {
        const secret = await encryptText(text2, code);
        q('.agent-code').value = '';
        q('.agent-out').hidden = false;
        agent.classList.add('agent-busy');
        tone(200, 0.5, 'sawtooth', 0.05, 900);
        await scramble(q('.agent-cipher'), secret, 1500);
        agent?.classList.remove('agent-busy');
        tone(1200, 0.15, 'triangle', 0.07); tone(1600, 0.2, 'triangle', 0.07, 1600, 0.12);
        status('Verschlüsselt. Codewort wurde nicht gespeichert.');
      } catch (e) { status(e.message, true); }
    });
    q('.agent-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(q('.agent-cipher').textContent); status('Kopiert!'); } catch { status('Kopieren nicht erlaubt – Code markieren und kopieren.', true); } });
    q('.agent-go2').addEventListener('click', async () => {
      const out = q('.agent-plain'); q('.agent-out2').hidden = false; out.textContent = '';
      agent.classList.add('agent-busy'); status('Entschlüssele …');
      try {
        const [plain] = await Promise.all([decryptText(q('.agent-in').value, q('.agent-code2').value), new Promise((r) => setTimeout(r, 700))]);
        q('.agent-code2').value = '';
        tone(300, 0.6, 'sawtooth', 0.05, 1200);
        await scramble(out, plain, 1300);
        status('Zugriff gewährt.');
        tone(1500, 0.25, 'triangle', 0.07);
      } catch (e) { out.textContent = '⛔ ZUGRIFF VERWEIGERT'; status(e.message, true); tone(160, 0.5, 'square', 0.07, 90); agent?.classList.add('agent-denied'); setTimeout(() => agent?.classList.remove('agent-denied'), 600); } finally { agent?.classList.remove('agent-busy'); }
    });
  }
  agent.tab(action === 'entschluesseln' ? 'entschluesseln' : 'verschluesseln');
  if (text) { agent.querySelector(action === 'entschluesseln' ? '.agent-in' : '.agent-text').value = String(text).slice(0, 1000); }
  setTimeout(() => agent?.querySelector(text ? (action === 'entschluesseln' ? '.agent-code2' : '.agent-code') : (action === 'entschluesseln' ? '.agent-in' : '.agent-text'))?.focus(), 50);
}

// ======================================================================
// Escape-Room
// ======================================================================
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
export function makeSequence(r = Math.random) {
  const R = (n) => Math.floor(r() * n);
  const kind = R(4);
  let seq;
  if (kind === 0) { const a = 2 + R(9); const d = 3 + R(8); seq = Array.from({ length: 6 }, (_, i) => a + d * i); return { seq: seq.slice(0, 5), answer: seq[5], tip: `Es kommt immer dieselbe Zahl dazu: +${d}.` }; }
  if (kind === 1) { const a = 2 + R(4); seq = Array.from({ length: 6 }, (_, i) => a * 2 ** i); return { seq: seq.slice(0, 5), answer: seq[5], tip: 'Jede Zahl wird verdoppelt.' }; }
  if (kind === 2) { const a = 1 + R(3); const b = 2 + R(3); seq = [a, b]; while (seq.length < 7) seq.push(seq.at(-1) + seq.at(-2)); return { seq: seq.slice(0, 6), answer: seq[6], tip: 'Addiere immer die zwei Zahlen davor.' }; }
  const s = 1 + R(3); seq = Array.from({ length: 6 }, (_, i) => (i + s) ** 2); return { seq: seq.slice(0, 5), answer: seq[5], tip: 'Das sind Quadratzahlen (n × n).' };
}
const WIRES = [
  { clues: ['Der richtige Draht ist nicht am Rand.', 'Seine Nummer ist gerade.', 'Er liegt links von Draht 3.'], answer: 2 },
  { clues: ['Der richtige Draht hat eine ungerade Nummer.', 'Er ist nicht der erste.', 'Draht 3 ist eine Falle.'], answer: 5 },
  { clues: ['Rechts von ihm liegen genau zwei Drähte.', 'Er ist nicht Draht 2.', 'Seine Nummer ist größer als 1.'], answer: 3 },
  { clues: ['Der richtige Draht ist direkt neben Draht 5.', 'Draht 5 selbst ist eine Falle.'], answer: 4 },
  { clues: ['Der richtige Draht ist am Rand.', 'Wer ihn mal 3 nimmt, bekommt 3.'], answer: 1 }
];
let room = null;
const TOTAL = 300;
export function closeEscape() { if (!room) return; clearInterval(room.timer); room.root.remove(); room = null; }
export function escapeHint() {
  if (!room) return null;
  room.hints += 1; room.left = Math.max(1, room.left - 15); room.clock?.();
  const t = room.tips[room.stage];
  room.q('.esc-tip').textContent = `💡 Jarvis: ${t}`; room.q('.esc-tip').hidden = false;
  tone(700, 0.12, 'triangle', 0.06); tone(950, 0.15, 'triangle', 0.06, 950, 0.1);
  return t;
}
export function openEscape(action = 'start') {
  if (action === 'stopp') return closeEscape();
  if (action === 'tipp') { if (room) return escapeHint(); }
  closeSecret(); closeEscape();
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx6' }));
  const digits = Array.from({ length: 4 }, () => rnd(10));
  const sq = makeSequence();
  const wire = pick(WIRES);
  const root = el('div', 'esc');
  root.innerHTML = `<div class="esc-card"><header><p class="esc-kicker">JARVIS · ESCAPE-ROOM</p><p class="esc-clock">05:00</p><button type="button" class="esc-x" aria-label="Schließen">✕</button></header>
    <ol class="esc-steps"><li class="on">Tresor</li><li>Zahlen-Schloss</li><li>Bombe</li></ol>
    <section class="esc-stage" data-s="0"><p class="esc-story">Du bist im Labor eingeschlossen. Irgendwo im Raum sind 4 Ziffern versteckt – ihre Reihenfolge steht daneben. Tippe die Dinge an!</p>
      <div class="esc-room">${['🖼️ Bild', '📚 Bücher', '🪴 Pflanze', '🧥 Jacke', '💡 Lampe', '🗄️ Schrank'].map((x, i) => `<button type="button" class="esc-obj" data-i="${i}">${x}</button>`).join('')}</div>
      <div class="esc-pad"><output class="esc-code">_ _ _ _</output><div class="esc-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✓'].map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div></div></section>
    <section class="esc-stage" data-s="1" hidden><p class="esc-story">Die Tür hat ein Zahlen-Schloss. Welche Zahl kommt als Nächstes?</p><p class="esc-seq">${sq.seq.join(' · ')} · <b>?</b></p><form class="esc-form"><input class="esc-num" inputmode="numeric" autocomplete="off" aria-label="Nächste Zahl"><button type="submit">Öffnen</button></form></section>
    <section class="esc-stage" data-s="2" hidden><p class="esc-story">Eine Bombe blockiert den Ausgang! Schneide den richtigen Draht – ein falscher kostet 30 Sekunden.</p><ul class="esc-clues">${wire.clues.map((c) => `<li>${c}</li>`).join('')}</ul><div class="esc-wires">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="esc-wire" data-w="${n}"><span></span>${n}</button>`).join('')}</div></section>
    <section class="esc-end" hidden><div class="esc-door"><i></i><i></i></div><p class="esc-result"></p><button type="button" class="esc-again">↻ Neuer Raum</button></section>
    <p class="esc-tip" hidden></p><div class="esc-bar"><button type="button" class="esc-hint">💡 Tipp (−15 s)</button><p class="esc-msg" role="status"></p></div></div>`;
  document.body.append(root);
  const q = (s) => root.querySelector(s);
  const order = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 4);
  room = { root, q, stage: 0, left: TOTAL, hints: 0, timer: 0, tips: ['Schau hinter alle sechs Dinge – nur vier verstecken eine Ziffer. Die kleine Zahl in Klammern ist die Position.', sq.tip, `Lies die Hinweise einzeln und streiche Drähte durch. Es ist Draht ${wire.answer > 3 ? 'größer als 3' : 'kleiner oder gleich 3'}.`] };
  const me = room;
  const msg = (t, bad) => { q('.esc-msg').textContent = t; q('.esc-msg').classList.toggle('bad', Boolean(bad)); };
  const clock = () => { const m = Math.floor(me.left / 60); const s = me.left % 60; q('.esc-clock').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; root.classList.toggle('esc-alarm', me.left <= 30 && me.stage < 3); };
  const next = () => {
    me.stage += 1; q('.esc-tip').hidden = true; msg('');
    tone(500, 0.12, 'triangle', 0.07); tone(750, 0.12, 'triangle', 0.07, 750, 0.1); tone(1000, 0.25, 'triangle', 0.07, 1000, 0.2);
    root.querySelectorAll('.esc-steps li').forEach((li, i) => { li.classList.toggle('on', i === me.stage); li.classList.toggle('done', i < me.stage); });
    root.querySelectorAll('.esc-stage').forEach((s) => { s.hidden = Number(s.dataset.s) !== me.stage; });
    if (me.stage === 3) finish(true);
    else root.querySelector(`[data-s="${me.stage}"] input`)?.focus();
  };
  const finish = (won) => {
    clearInterval(me.timer); me.stage = 3; root.classList.remove('esc-alarm');
    root.querySelectorAll('.esc-stage').forEach((s) => { s.hidden = true; });
    q('.esc-end').hidden = false; q('.esc-hint').hidden = true; q('.esc-tip').hidden = true;
    const used = TOTAL - me.left;
    q('.esc-result').textContent = won ? `ENTKOMMEN! In ${Math.floor(used / 60)}:${String(used % 60).padStart(2, '0')} Min., ${me.hints} Tipp${me.hints === 1 ? '' : 's'}.` : 'ZEIT ABGELAUFEN – das Labor ist verriegelt.';
    root.classList.add(won ? 'esc-won' : 'esc-lost');
    if (won) [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, f, i * 0.12));
    else [0, 0.4, 0.8].forEach((d) => tone(880, 0.3, 'square', 0.07, 440, d));
  };
  me.clock = clock;
  me.timer = setInterval(() => {
    me.left -= 1; clock();
    if (me.left <= 30 && me.left > 0 && me.left % 2 === 0) tone(1100, 0.12, 'square', 0.05, 700);
    if (me.left <= 0) finish(false);
  }, 1000);
  clock();
  // stage 0: hidden digits
  let found = 0;
  root.querySelectorAll('.esc-obj').forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('open')) return;
    b.classList.add('open');
    const pos = order.indexOf(Number(b.dataset.i));
    if (pos >= 0) { b.append(el('span', 'esc-digit', `${digits[pos]} (${pos + 1})`)); found += 1; tone(1300, 0.1, 'triangle', 0.06); msg(found === 4 ? 'Alle 4 Ziffern gefunden – gib den Code ein!' : `${found} von 4 Ziffern gefunden.`); } else { b.append(el('span', 'esc-digit none', '—')); tone(220, 0.1, 'square', 0.03); }
  }));
  let typed = '';
  const show = () => { q('.esc-code').textContent = Array.from({ length: 4 }, (_, i) => typed[i] ?? '_').join(' '); };
  root.querySelectorAll('.esc-keys button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (k === '⌫') typed = typed.slice(0, -1);
    else if (k === '✓') {
      if (typed === digits.join('')) { next(); return; }
      msg('Falscher Code!', true); tone(150, 0.3, 'square', 0.07); q('.esc-pad').classList.add('esc-shake'); setTimeout(() => q('.esc-pad')?.classList.remove('esc-shake'), 400); typed = '';
    } else if (typed.length < 4) { typed += k; tone(900 + Number(k) * 40, 0.05, 'square', 0.04); }
    show();
  }));
  // stage 1: sequence
  q('.esc-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (Number(q('.esc-num').value.trim()) === sq.answer) next();
    else { msg('Das Schloss bleibt zu.', true); tone(150, 0.3, 'square', 0.07); q('.esc-num').select(); }
  });
  // stage 2: wires
  root.querySelectorAll('.esc-wire').forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('cut') || me.stage !== 2) return;
    b.classList.add('cut');
    if (Number(b.dataset.w) === wire.answer) { tone(2000, 0.08, 'square', 0.05); setTimeout(next, 500); } else { me.left = Math.max(1, me.left - 30); clock(); msg('FALSCHER DRAHT! −30 Sekunden', true); tone(120, 0.5, 'sawtooth', 0.08, 60); root.classList.add('esc-boom'); setTimeout(() => root.classList.remove('esc-boom'), 500); }
  }));
  q('.esc-hint').addEventListener('click', escapeHint);
  q('.esc-x').addEventListener('click', closeEscape);
  q('.esc-again').addEventListener('click', () => openEscape('start'));
  msg('Die Zeit läuft!');
  return null;
}
if (typeof document !== 'undefined') document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'fx6') { closeSecret(); closeEscape(); } });
