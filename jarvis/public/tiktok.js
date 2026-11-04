// TikTok-Show: full-screen, cinematic self-presentation of Jarvis in the red
// film look. Scenes: intro (light beam, reactor ignition, glitch title),
// personality (stamped words + shockwaves), systems (counter + orbiting real
// modules), building (animated website / app / painting tiles), show montage
// (laser beams, fireworks, cards) and outro (call to action). Each scene asks
// the server to speak its line and waits until Jarvis has finished talking,
// so picture and voice stay in sync. TikTok-style captions highlight the
// current word. Works portrait (phone) and landscape (laptop).
import { fitCanvas, loop, perf } from './cae/perf.js';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const rnd = (a, b) => a + Math.random() * (b - a);
let deps = { send: () => false, muteMic: () => {} };
let show = null;
let mode = 'offline';
if (typeof document !== 'undefined') {
  document.addEventListener('jarvis-mode', (e) => { mode = e.detail; });
  document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'tiktok') stopTikTok(); });
}

// ---------- sound effects (quiet, under the voice) ----------
let ac = null;
function ctx() { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; }
function whoosh(v = 0.05, d = 0.5) { try { const a = ctx(); const t = a.currentTime; const len = Math.ceil(a.sampleRate * d); const b = a.createBuffer(1, len, a.sampleRate); const ch = b.getChannelData(0); for (let i = 0; i < len; i += 1) ch[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI); const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3500, t + d); const g = a.createGain(); g.gain.value = v; s.connect(f).connect(g).connect(a.destination); s.start(t); } catch { /* no audio */ } }
function hit(v = 0.09) { try { const a = ctx(); const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.45); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.55); } catch { /* no audio */ } }
function blip(f = 1200, v = 0.03) { try { const a = ctx(); const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.08); } catch { /* no audio */ } }

// ---------- speech sync ----------
const words = (s) => String(s).split(/\s+/).filter(Boolean);
const estimate = (line) => Math.max(2500, words(line).length * 420 + 900); // ~2.4 words per second
function waitFor(test, ms) { return new Promise((resolve) => { const t0 = performance.now(); const iv = setInterval(() => { if (test() || performance.now() - t0 > ms || !show) { clearInterval(iv); resolve(test()); } }, 80); }); }
async function speak(index, line) {
  const sent = deps.send({ type: 'show_line', index });
  if (!sent) { await new Promise((r) => setTimeout(r, estimate(line))); return; }
  const started = await waitFor(() => mode === 'speaking', 6000);
  if (!started) { await new Promise((r) => setTimeout(r, Math.max(0, estimate(line) - 6000))); return; }
  show.speechStart = performance.now();
  await waitFor(() => mode !== 'speaking', estimate(line) * 2.2 + 4000);
}

// ---------- scene drawing ----------
const RED = '255, 42, 61';
function reactor(c, x, y, r, t, power = 1) {
  c.save(); c.translate(x, y);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); g.addColorStop(0, `rgba(255,255,255,${0.9 * power})`); g.addColorStop(0.18, `rgba(255,120,130,${0.8 * power})`); g.addColorStop(0.45, `rgba(${RED},${0.35 * power})`); g.addColorStop(1, 'rgba(255,42,61,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 1.6, 0, Math.PI * 2); c.fill();
  c.lineCap = 'round';
  [[0.55, 10, 1.2], [0.75, 14, -0.8], [0.95, 22, 0.5], [1.12, 40, -0.3]].forEach(([k, n, sp], ri) => {
    c.strokeStyle = `rgba(${RED},${(0.9 - ri * 0.15) * power})`; c.lineWidth = Math.max(1.5, r * (0.05 - ri * 0.008));
    for (let i = 0; i < n; i += 1) { const a0 = (i / n) * Math.PI * 2 + t / 1000 * sp; c.beginPath(); c.arc(0, 0, r * k, a0, a0 + (Math.PI * 2 / n) * 0.62); c.stroke(); }
  });
  c.restore();
}
function grid(c, W, H, t, alpha = 0.12) {
  c.strokeStyle = `rgba(${RED},${alpha})`; c.lineWidth = 1;
  const hz = H * 0.62; for (let i = -14; i <= 14; i += 1) { c.beginPath(); c.moveTo(W / 2 + i * 26, hz); c.lineTo(W / 2 + i * 160, H + 40); c.stroke(); }
  for (let j = 0; j < 9; j += 1) { const y = hz + (((j * 28 + (t / 30) % 28) ** 1.35) / 6); if (y > H) continue; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}
function burst(parts, x, y, n, speed = 6, color = RED) { for (let i = 0; i < n; i += 1) { const a = Math.random() * Math.PI * 2; const v = rnd(speed * 0.3, speed); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: color, s: rnd(1.5, 3.5) }); } }

const SCENES = {
  intro(c, W, H, t, s, P) {
    const k = Math.min(1, t / 2600);
    // light beam sweeping down
    if (t < 1200) { const y = (t / 1200) * H; const g = c.createLinearGradient(0, y - 120, 0, y); g.addColorStop(0, 'rgba(255,42,61,0)'); g.addColorStop(1, `rgba(${RED},0.9)`); c.fillStyle = g; c.fillRect(W / 2 - 2, 0, 4, y); c.fillStyle = `rgba(${RED},0.18)`; c.fillRect(0, y - 2, W, 4); }
    const r = Math.min(W, H) * 0.17 * (t < 1100 ? 0.2 : 0.2 + Math.min(1, (t - 1100) / 900) * 0.8);
    if (t > 900) reactor(c, W / 2, H * 0.4, r, t, Math.min(1, (t - 900) / 700));
    if (t > 1900 && !s.flag1) { s.flag1 = true; hit(0.12); burst(P, W / 2, H * 0.4, perf.tier === 'high' ? 160 : 80, 9); s.shock = t; }
    if (s.shock) { const f = (t - s.shock) / 900; if (f < 1) { c.strokeStyle = `rgba(${RED},${1 - f})`; c.lineWidth = 6 * (1 - f) + 1; c.beginPath(); c.arc(W / 2, H * 0.4, f * Math.max(W, H) * 0.7, 0, Math.PI * 2); c.stroke(); } }
    return k;
  },
  wesen(c, W, H, t, s) {
    reactor(c, W / 2, H * 0.4, Math.min(W, H) * 0.09, t, 0.6);
    const n = s.data.words || []; const per = 900;
    n.forEach((w, i) => {
      const ti = t - 500 - i * per; if (ti < 0) return;
      if (!s[`w${i}`]) { s[`w${i}`] = true; hit(0.08); whoosh(0.03, 0.3); }
      const f = Math.min(1, ti / 260); const scale = 2.6 - 1.6 * f;
      const y = H * (0.2 + i * 0.13); const fs = Math.min(W * 0.14, H * 0.09);
      c.save(); c.translate(W / 2, y); c.scale(scale, scale); c.globalAlpha = f;
      c.font = `900 ${fs}px Inter, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(0,255,255,0.35)'; c.fillText(w, -3, 0); c.fillStyle = `rgba(${RED},0.8)`; c.fillText(w, 3, 0);
      c.fillStyle = '#fff'; c.fillText(w, 0, 0); c.restore();
      const sf = Math.min(1, ti / 700); if (sf < 1) { c.strokeStyle = `rgba(${RED},${1 - sf})`; c.lineWidth = 3; c.beginPath(); c.ellipse(W / 2, y, sf * W * 0.6, sf * fs * 1.2, 0, 0, Math.PI * 2); c.stroke(); }
    });
  },
  systeme(c, W, H, t, s) {
    const portrait = H > W * 1.2; const cx = W / 2; const cy = H * 0.42; const R = portrait ? W * 0.3 : Math.min(W, H) * 0.32; const RY = portrait ? H * 0.2 : R * 0.42;
    reactor(c, cx, cy, Math.min(W, H) * 0.1, t, 0.9);
    const mods = s.data.modules || [];
    const f = Math.min(1, t / 1400);
    const order = mods.map((m, i) => { const a = (i / mods.length) * Math.PI * 2 + t / 4200; return { m, x: cx + Math.cos(a) * R * f, y: cy + Math.sin(a) * RY * f, z: Math.cos(a + Math.PI / 2), i }; }).sort((a, b) => a.z - b.z);
    order.forEach(({ m, x, y, z, i }) => {
      if (t < 300 + i * 90) return;
      const sc = 0.75 + (z + 1) * 0.25; const a = 0.35 + (z + 1) * 0.32;
      c.strokeStyle = `rgba(${RED},${0.25 * a})`; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke();
      c.save(); c.translate(x, y); c.scale(sc, sc); c.globalAlpha = a;
      const w = Math.min(150, W * 0.36); c.fillStyle = 'rgba(14,2,4,0.92)'; c.strokeStyle = `rgba(${RED},0.9)`; c.lineWidth = 1.5; c.beginPath(); c.roundRect(-w / 2, -20, w, 40, 10); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = '600 13px Inter, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${m.icon} ${m.title}`, 0, 0); c.restore();
    });
    // big counter
    const shown = Math.round((s.data.total || 0) * Math.min(1, t / 1800));
    if (t % 120 < 20 && shown < (s.data.total || 0)) blip(900 + shown * 3, 0.015);
    const fsz = Math.min(W * 0.11, H * 0.1);
    c.save(); c.fillStyle = 'rgba(4,0,1,0.85)'; c.beginPath(); c.arc(cx, cy, fsz * 0.95, 0, Math.PI * 2); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${fsz}px Inter, Arial, sans-serif`;
    c.shadowColor = `rgb(${RED})`; c.shadowBlur = 24; c.fillStyle = '#fff'; c.fillText(String(shown), cx, cy); c.shadowBlur = 0;
    c.font = `800 ${Math.min(W * 0.04, 18)}px Inter, Arial, sans-serif`; c.fillStyle = `rgba(${RED},1)`; c.fillText('FUNKTIONEN', cx, cy + RY + 44); c.restore();
  },
  bauen(c, W, H, t, s) {
    grid(c, W, H, t, 0.1);
    const cards = s.data.cards || []; const n = cards.length;
    const portrait = H > W; const cw = portrait ? W * 0.74 : Math.min(300, W / (n + 0.6)); const ch = portrait ? H * 0.145 : cw * 1.15;
    cards.forEach((card, i) => {
      const ti = t - i * 650; if (ti < 0) return;
      if (!s[`c${i}`]) { s[`c${i}`] = true; whoosh(0.045, 0.45); }
      const f = Math.min(1, ti / 600); const e = 1 - (1 - f) ** 3;
      const x = portrait ? W / 2 : W / 2 + (i - (n - 1) / 2) * (cw + 24); const y = portrait ? H * (0.24 + i * 0.175) : H * 0.42;
      c.save(); c.translate(x + (1 - e) * W * (i % 2 ? 1 : -1), y); c.globalAlpha = e;
      c.fillStyle = 'rgba(14,2,4,0.9)'; c.strokeStyle = `rgba(${RED},0.95)`; c.lineWidth = 2; c.shadowColor = `rgb(${RED})`; c.shadowBlur = 24; c.beginPath(); c.roundRect(-cw / 2, -ch / 2, cw, ch, 16); c.fill(); c.stroke(); c.shadowBlur = 0;
      // live mini animation per card
      const ix = -cw / 2 + 16; const iy = -ch / 2 + 14; const iw = cw - 32; const ih = ch * 0.5;
      c.strokeStyle = `rgba(${RED},0.7)`; c.lineWidth = 1;
      if (card.title.startsWith('Website')) { const pr = Math.min(1, ti / 2200); [[0, 0, 1, 0.14], [0, 0.2, 1, 0.38], [0, 0.64, 0.31, 0.36], [0.345, 0.64, 0.31, 0.36], [0.69, 0.64, 0.31, 0.36]].forEach(([a, b2, w2, h2], k) => { if (pr > k / 5) c.strokeRect(ix + a * iw, iy + b2 * ih, w2 * iw * Math.min(1, (pr - k / 5) * 5), h2 * ih); }); }
      else if (card.title.startsWith('Apps')) { c.strokeRect(-ih * 0.3, iy, ih * 0.6, ih); c.fillStyle = `rgba(${RED},0.8)`; c.font = '10px monospace'; for (let k = 0; k < 6; k += 1) c.fillText(['fn()', '{ }', '=>', 'let', 'if', '<>'][(k + Math.floor(ti / 200)) % 6], -ih * 0.22, iy + 14 + k * (ih / 7)); }
      else { const pr = Math.min(1, ti / 1800); for (let k = 0; k < 40 * pr; k += 1) { c.fillStyle = `hsla(${350 + (k * 37) % 40}, 90%, ${45 + (k * 13) % 30}%, 0.8)`; c.beginPath(); c.arc(ix + ((k * 53) % 100) / 100 * iw, iy + ((k * 31) % 100) / 100 * ih, 4 + (k % 4), 0, Math.PI * 2); c.fill(); } }
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `800 ${Math.min(22, cw * 0.09)}px Inter, Arial, sans-serif`; c.fillText(`${card.icon} ${card.title}`, 0, ch / 2 - 40);
      c.fillStyle = '#ffd0d4'; c.font = `500 ${Math.min(15, cw * 0.06)}px Inter, Arial, sans-serif`; c.fillText(card.sub, 0, ch / 2 - 16);
      c.restore();
    });
  },
  show(c, W, H, t, s, P) {
    const cards = s.data.cards || []; if (!cards.length) return; const per = 950; const i = Math.max(0, Math.min(cards.length - 1, Math.floor(t / per)));
    const ti = t - i * per;
    if (s.last !== i) { s.last = i; whoosh(0.05, 0.35); hit(0.06); const card = cards[i]; if (/Feuerwerk/.test(card.title)) for (let k = 0; k < 3; k += 1) burst(P, rnd(W * 0.2, W * 0.8), rnd(H * 0.15, H * 0.4), 70, 7, ['255, 210, 120', RED, '255, 255, 255'][k]); else burst(P, W / 2, H * 0.4, 40, 5); }
    const card = cards[i]; if (!card) return;
    // laser beams for "Laser-Augen", black hole spiral, etc.
    if (/Laser/.test(card.title)) { for (const sx of [-1, 1]) { c.strokeStyle = `rgba(${RED},0.9)`; c.lineWidth = 6; c.shadowColor = `rgb(${RED})`; c.shadowBlur = 25; c.beginPath(); c.moveTo(W / 2 + sx * 30, H * 0.36); c.lineTo(W / 2 + sx * W * 0.6 * Math.sin(ti / 300), H); c.stroke(); c.shadowBlur = 0; } }
    if (/Loch/.test(card.title)) { for (let k = 0; k < 60; k += 1) { const a = k * 0.5 + ti / 200; const r = (k / 60) * Math.min(W, H) * 0.45 * (1 - (ti % 950) / 1900); c.fillStyle = `rgba(${RED},${k / 60})`; c.beginPath(); c.arc(W / 2 + Math.cos(a) * r, H * 0.4 + Math.sin(a) * r * 0.6, 2.5, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#000'; c.beginPath(); c.arc(W / 2, H * 0.4, Math.min(W, H) * 0.08, 0, Math.PI * 2); c.fill(); }
    if (/Globus/.test(card.title)) { const r = Math.min(W, H) * 0.2; c.strokeStyle = `rgba(${RED},0.7)`; c.lineWidth = 1.2; c.beginPath(); c.arc(W / 2, H * 0.4, r, 0, Math.PI * 2); c.stroke(); for (let k = -3; k <= 3; k += 1) { c.beginPath(); c.ellipse(W / 2, H * 0.4, r * Math.abs(Math.cos(ti / 600 + k * 0.45)), r, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(W / 2, H * 0.4 + k * r / 4, r * Math.sqrt(1 - (k / 4) ** 2), r * 0.08, 0, 0, Math.PI * 2); c.stroke(); } }
    if (/Anzug/.test(card.title)) reactor(c, W / 2, H * 0.4, Math.min(W, H) * 0.12, ti * 3, 1);
    const f = Math.min(1, ti / 220); const sc = 1.6 - 0.6 * f;
    c.save(); c.translate(W / 2, H * 0.62); c.scale(sc, sc); c.globalAlpha = f; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `${Math.min(W * 0.18, 96)}px sans-serif`; c.fillText(card.icon, 0, -Math.min(W * 0.11, 64));
    c.font = `900 ${Math.min(W * 0.09, 56)}px Inter, Arial, sans-serif`; c.fillStyle = '#fff'; c.shadowColor = `rgb(${RED})`; c.shadowBlur = 20; c.fillText(card.title.toUpperCase(), 0, 10); c.restore();
    // progress pips
    cards.forEach((_, k) => { c.fillStyle = k <= i ? `rgb(${RED})` : 'rgba(255,255,255,0.2)'; c.fillRect(W / 2 - cards.length * 14 + k * 28, H * 0.75, 20, 4); });
  },
  outro(c, W, H, t, s, P) {
    const pulse = 1 + Math.sin(t / 260) * 0.06;
    reactor(c, W / 2, H * 0.36, Math.min(W, H) * 0.16 * pulse, t, 1);
    if (!s.f) { s.f = true; hit(0.12); burst(P, W / 2, H * 0.36, perf.tier === 'high' ? 140 : 70, 8); }
    const typed = '„Jarvis …“'.slice(0, Math.floor(t / 110));
    c.fillStyle = '#040001'; c.fillRect(0, H * 0.55, W, H * 0.17); // no motion-trail ghosts behind the text
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `500 ${Math.min(W * 0.05, 26)}px Inter, Arial, sans-serif`; c.fillStyle = '#ffd0d4'; c.fillText('Sag einfach', W / 2, H * 0.6);
    c.font = `900 ${Math.min(W * 0.11, 64)}px Inter, Arial, sans-serif`; c.fillStyle = '#fff'; c.fillText(typed + (Math.floor(t / 400) % 2 ? '' : '▌'), W / 2, H * 0.67);
  }
};

function captions(box, line, start, now) {
  const ws = words(line); const per = 420;
  const k = start ? Math.min(ws.length, Math.floor((now - start) / per) + 1) : 0; // current word (1-based)
  const chunk = Math.floor(Math.max(0, k - 1) / 6) * 6; // show 6 words at a time
  const html = ws.slice(chunk, chunk + 6).map((w, i) => `<span class="${chunk + i === k - 1 ? 'on' : chunk + i < k - 1 ? 'done' : ''}">${w.replace(/[<>&]/g, '')}</span>`).join(' ');
  if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
}

export function stopTikTok() {
  if (!show) return;
  const s = show; show = null;
  s.stop(); s.root.classList.add('out'); setTimeout(() => s.root.remove(), 600);
  deps.muteMic(false);
}

export async function startTikTok(scenes) {
  stopTikTok();
  if (!Array.isArray(scenes) || !scenes.length) return;
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'tiktok' }));
  const root = el('div', 'tt');
  root.innerHTML = '<canvas></canvas><div class="tt-top"><span class="tt-rec">● REC</span><span class="tt-brand">J.A.R.V.I.S.</span><button type="button" class="tt-x" aria-label="Show beenden">✕</button></div><p class="tt-title"></p><p class="tt-cap"></p><div class="tt-bar"><i></i></div>';
  document.body.append(root);
  const canvas = root.querySelector('canvas'); const title = root.querySelector('.tt-title'); const cap = root.querySelector('.tt-cap'); const bar = root.querySelector('.tt-bar i');
  let W = innerWidth; let H = innerHeight; let c = fitCanvas(canvas, W, H);
  const onResize = () => { W = innerWidth; H = innerHeight; c = fitCanvas(canvas, W, H); };
  addEventListener('resize', onResize);
  const P = [];
  const me = { root, scene: null, sceneAt: 0, speechStart: 0, stop: () => {} };
  show = me;
  root.querySelector('.tt-x').addEventListener('click', stopTikTok);
  deps.muteMic(true); // Jarvis' own voice must not interrupt the show
  const stopLoop = loop((t) => {
    c.fillStyle = 'rgba(4, 0, 1, 0.34)'; c.fillRect(0, 0, W, H); // motion trails
    if (!me.scene) return;
    const st = Math.max(0, t - me.sceneAt); // rAF time can be a hair before the scene start
    const fn = SCENES[me.scene.data.key]; if (fn) fn(c, W, H, st, me.scene, P);
    for (let i = P.length - 1; i >= 0; i -= 1) { const p = P[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.99; p.life -= 0.012; if (p.life <= 0) { P.splice(i, 1); continue; } c.fillStyle = `rgba(${p.c},${p.life})`; c.fillRect(p.x, p.y, p.s, p.s); }
    // scanlines + vignette
    c.fillStyle = 'rgba(255,255,255,0.025)'; for (let y = (t / 20) % 4; y < H; y += 4) c.fillRect(0, y, W, 1);
    captions(cap, me.scene.data.line, me.speechStart, performance.now());
  });
  me.stop = () => { stopLoop(); removeEventListener('resize', onResize); };
  // let "Kamera läuft!" finish first
  await waitFor(() => mode === 'speaking', 3500); await waitFor(() => mode !== 'speaking', 6000);
  for (let i = 0; i < scenes.length && show === me; i += 1) {
    me.scene = { data: scenes[i] }; me.sceneAt = performance.now(); me.speechStart = 0;
    title.textContent = scenes[i].title || ''; title.classList.remove('in'); void title.offsetWidth; title.classList.add('in');
    cap.dataset.h = ''; cap.innerHTML = '';
    bar.style.width = `${((i + 1) / scenes.length) * 100}%`;
    root.classList.toggle('flash', true); setTimeout(() => root.classList.remove('flash'), 220);
    await speak(i, scenes[i].line);
    if (show !== me) return;
    me.speechStart = me.speechStart || me.sceneAt; // captions show the full line at the end
    await new Promise((r) => setTimeout(r, 450));
  }
  if (show === me) setTimeout(() => { if (show === me) stopTikTok(); }, 2500);
}

export function initTikTok(options) { deps = { ...deps, ...options }; }
