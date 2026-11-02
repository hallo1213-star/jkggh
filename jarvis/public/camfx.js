// Camera effects – all on this device: repulsor in your palm, gesture control,
// teleport (you dissolve into particles and stay invisible until "Zurück").
import { cameraError, handTracker, openCamera, personSegmenter } from './mp.js';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let deps = { toast: () => {}, sendText: () => {} };
const fx = { mode: '', root: null, video: null, canvas: null, stream: null, raf: 0, hand: null, seg: null, lastTs: 0 };

let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); return audio; }
function sweep(f1, f2, dur, type = 'sine', vol = 0.15) {
  try { const a = ac(); const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ }
}
function noise(dur, vol = 0.4, freq = 1800) {
  try { const a = ac(); const len = a.sampleRate * dur; const b = a.createBuffer(1, len, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2; const s = a.createBufferSource(); const f = a.createBiquadFilter(); const g = a.createGain(); f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(); } catch { /* no audio */ }
}

function stop() {
  cancelAnimationFrame(fx.raf);
  fx.stream?.getTracks().forEach((t) => t.stop());
  fx.stream = null;
  fx.root?.remove();
  document.getElementById('gest-cursor')?.remove();
  fx.root = null;
  fx.mode = '';
  fx.tele = null;
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'camfx' && fx.mode && fx.mode !== 'gesten') stop(); });

async function start(mode) {
  if (fx.mode === mode) return;
  stop();
  if (mode !== 'gesten') document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'camfx' }));
  fx.mode = mode;
  const root = el('div', `camfx ${mode}`);
  root.innerHTML = `<div class="camfx-view"><video playsinline muted></video><canvas></canvas><p class="camfx-title"></p><p class="camfx-status">Kamera wird gestartet …</p><div class="camfx-flash"></div></div>${mode === 'gesten' ? '' : '<div class="camfx-bar"><button type="button" class="camfx-close">Beenden</button></div>'}`;
  root.querySelector('.camfx-title').textContent = { repulsor: 'REPULSOR', gesten: 'GESTEN', teleport: 'TELEPORTER' }[mode];
  document.body.append(root);
  fx.root = root;
  fx.video = root.querySelector('video');
  fx.canvas = root.querySelector('canvas');
  root.querySelector('.camfx-close')?.addEventListener('click', stop);
  const status = root.querySelector('.camfx-status');
  try { fx.stream = await openCamera(fx.video); } catch (error) { status.textContent = cameraError(error); return; }
  if (fx.root !== root) return;
  status.textContent = mode === 'teleport' ? 'Personenerkennung lädt …' : 'Handerkennung lädt …';
  try {
    if (mode === 'teleport') fx.seg = await personSegmenter('VIDEO');
    else fx.hand = await handTracker();
  } catch (error) { status.textContent = error.message; return; }
  if (fx.root !== root) return;
  status.textContent = { repulsor: 'Handfläche zeigen · Faust machen und öffnen = Schuss', gesten: 'Wischen = Bereich wechseln · 👍 = Ja · offene Hand halten = schließen', teleport: 'Bereit. Sag „Teleportier mich“.' }[mode];
  if (mode === 'gesten') { const c = el('div', 'gest-cursor'); c.id = 'gest-cursor'; document.body.append(c); }
  fx.raf = requestAnimationFrame(mode === 'repulsor' ? repulsorFrame : mode === 'gesten' ? gestureFrame : teleportFrame);
  if (mode === 'teleport' && fx.pendingTeleport) { fx.pendingTeleport = false; setTimeout(teleportOut, 600); }
}

function sizeCanvas() {
  const { video, canvas } = fx;
  if (!video.videoWidth) return false;
  const w = fx.mode === 'teleport' ? Math.min(480, video.videoWidth) : video.videoWidth;
  if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round((w * video.videoHeight) / video.videoWidth); }
  return true;
}
function handPoints() {
  const ts = performance.now();
  if (ts <= fx.lastTs) return null;
  fx.lastTs = ts;
  const res = fx.hand.detectForVideo(fx.video, ts);
  return res.landmarks?.[0] || null;
}
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function openness(p) { const size = d2(p[0], p[9]) || 1e-3; return [8, 12, 16, 20].reduce((s, i) => s + d2(p[i], p[0]), 0) / 4 / size; }

// --- repulsor -------------------------------------------------------------------------
const rep = { armed: false, charge: 0, blasts: [], cool: 0 };
function repulsorFrame(now) {
  fx.raf = requestAnimationFrame(repulsorFrame);
  if (!sizeCanvas()) return;
  const c = fx.canvas; const ctx = c.getContext('2d'); const W = c.width; const H = c.height;
  ctx.clearRect(0, 0, W, H);
  const p = handPoints();
  if (p) {
    const cx = ([0, 5, 9, 13, 17].reduce((s, i) => s + p[i].x, 0) / 5) * W;
    const cy = ([0, 5, 9, 13, 17].reduce((s, i) => s + p[i].y, 0) / 5) * H;
    const size = d2(p[0], p[9]) * W;
    const open = openness(p);
    if (open < 1.15) { rep.armed = true; rep.charge = Math.min(1, rep.charge + 0.05); }
    else if (open > 1.55) {
      if (rep.armed && now > rep.cool) { fire(cx, cy, size); rep.cool = now + 500; }
      rep.armed = false;
    }
    const glow = open > 1.4 ? 0.7 + Math.sin(now / 90) * 0.1 + rep.charge * 0.3 : 0.25 + rep.charge * 0.4;
    const r = size * (0.45 + rep.charge * 0.25);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
    g.addColorStop(0, `rgba(255,255,255,${glow})`);
    g.addColorStop(0.25, `rgba(160,235,255,${glow * 0.9})`);
    g.addColorStop(0.6, `rgba(60,170,255,${glow * 0.35})`);
    g.addColorStop(1, 'rgba(60,170,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(200,245,255,${glow})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
  } else rep.charge = Math.max(0, rep.charge - 0.05);
  for (const b of rep.blasts) {
    const k = (now - b.t) / 650;
    if (k > 1) continue;
    const rr = b.size * (1 + k * 9);
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rr);
    g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(0.4, `rgba(140,225,255,${0.8 * (1 - k)})`); g.addColorStop(1, 'rgba(60,160,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(220,250,255,${1 - k})`; ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, rr * 0.7, 0, Math.PI * 2); ctx.stroke();
  }
  rep.blasts = rep.blasts.filter((b) => now - b.t < 700);
}
function fire(x, y, size) {
  rep.blasts.push({ x, y, size, t: performance.now() });
  rep.charge = 0;
  sweep(1800, 120, 0.5, 'sawtooth', 0.12); noise(0.45, 0.5, 900);
  fx.root.classList.remove('shake', 'flash'); void fx.root.offsetWidth; fx.root.classList.add('shake', 'flash');
  navigator.vibrate?.(60);
}

// --- gestures --------------------------------------------------------------------------
const gest = { hist: [], cool: 0, thumbSince: 0, openSince: 0 };
const TABS = ['normal', 'business', 'apps', 'anzug', 'websites'];
function gestureFrame(now) {
  fx.raf = requestAnimationFrame(gestureFrame);
  if (!sizeCanvas()) return;
  const c = fx.canvas; const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const cursor = document.getElementById('gest-cursor');
  const p = handPoints();
  if (!p) { cursor?.classList.add('hidden'); gest.hist = []; gest.thumbSince = 0; gest.openSince = 0; return; }
  cursor?.classList.remove('hidden');
  const sx = (1 - p[8].x) * innerWidth; const sy = p[8].y * innerHeight;
  if (cursor) cursor.style.transform = `translate(${sx}px, ${sy}px)`;
  ctx.fillStyle = 'rgba(255,42,61,0.9)';
  for (const q of p) { ctx.beginPath(); ctx.arc(q.x * c.width, q.y * c.height, 3, 0, Math.PI * 2); ctx.fill(); }
  // swipe: fast horizontal movement of the wrist
  gest.hist.push({ x: 1 - p[0].x, t: now });
  gest.hist = gest.hist.filter((h) => now - h.t < 380);
  const dx = gest.hist[gest.hist.length - 1].x - gest.hist[0].x;
  if (now > gest.cool && Math.abs(dx) > 0.28) {
    gest.cool = now + 900; gest.hist = [];
    swipeTab(dx < 0 ? 1 : -1);
    return;
  }
  const size = d2(p[0], p[9]);
  const curled = [8, 12, 16, 20].every((i) => d2(p[i], p[0]) < size * 1.15);
  const thumbUp = curled && p[4].y < p[3].y && p[4].y < Math.min(p[8].y, p[6].y) - size * 0.35;
  const open = openness(p) > 1.7;
  if (thumbUp) { gest.thumbSince = gest.thumbSince || now; if (now - gest.thumbSince > 600 && now > gest.cool) { gest.cool = now + 2000; gest.thumbSince = 0; deps.sendText('Ja'); pop('👍 Ja'); sweep(660, 990, 0.2, 'triangle', 0.1); } } else gest.thumbSince = 0;
  if (open && Math.abs(dx) < 0.05) {
    gest.openSince = gest.openSince || now;
    const k = Math.min(1, (now - gest.openSince) / 1200);
    cursor?.style.setProperty('--k', String(k));
    if (k >= 1 && now > gest.cool) { gest.cool = now + 1500; gest.openSince = 0; closeTop(); }
  } else { gest.openSince = 0; cursor?.style.setProperty('--k', '0'); }
}
function swipeTab(dir) {
  const tabs = [...document.querySelectorAll('#film-tabs button')];
  if (!tabs.length) return;
  const cur = Math.max(0, tabs.findIndex((b) => b.getAttribute('aria-pressed') === 'true'));
  const next = (cur + dir + tabs.length) % tabs.length;
  pop(dir > 0 ? '→' : '←');
  sweep(400, 900, 0.18, 'triangle', 0.08);
  tabs[next].click();
}
function closeTop() {
  const btn = [...document.querySelectorAll('.biz-x, .fab-x, .suit-x, .rocket-x, .radio-x, .gift-x, .poster-x, .recap-x, .camfx-close, .studio-overlay:not([hidden]) [aria-label*="chließen"], .modal:not([hidden]) .icon-btn')].find((b) => b.offsetParent !== null);
  pop('✋ Schließen');
  if (btn) btn.click(); else document.querySelector('#film-tabs [data-tab="normal"]')?.click();
}
function pop(text) {
  const n = el('div', 'gest-pop', text);
  document.body.append(n);
  setTimeout(() => n.remove(), 900);
}

// --- teleport ---------------------------------------------------------------------------
// The background behind you is learned while you move; when you are "gone" your
// shape is filled with that background (unknown spots shimmer like a cloak).
function teleportFrame(now) {
  fx.raf = requestAnimationFrame(teleportFrame);
  if (!sizeCanvas()) return;
  const c = fx.canvas; const ctx = c.getContext('2d', { willReadFrequently: true }); const W = c.width; const H = c.height;
  const t = fx.tele || (fx.tele = { state: 'live', plate: null, known: null, parts: [], at: 0, mask: null });
  ctx.drawImage(fx.video, 0, 0, W, H);
  const frame = ctx.getImageData(0, 0, W, H);
  const ts = performance.now();
  if (ts > fx.lastTs) {
    fx.lastTs = ts;
    fx.seg.segmentForVideo(fx.video, ts, (res) => {
      const m = res.confidenceMasks?.[0];
      if (!m) return;
      const arr = m.getAsFloat32Array();
      t.mask = { data: arr.slice(), w: m.width, h: m.height };
    });
  }
  if (!t.plate) { t.plate = new Uint8ClampedArray(frame.data); t.known = new Uint8Array(W * H); }
  const mk = t.mask;
  const conf = (x, y) => (mk ? mk.data[Math.floor((y / H) * mk.h) * mk.w + Math.floor((x / W) * mk.w)] : 0);
  // learn background where you are not
  if (mk) for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (conf(x, y) < 0.3) { const k = y * W + x; const i = k * 4; t.plate[i] = frame.data[i]; t.plate[i + 1] = frame.data[i + 1]; t.plate[i + 2] = frame.data[i + 2]; t.known[k] = 1; }
  }
  if (t.state === 'live') return;
  // cloak: your pixels replaced by the learned background; where it is still
  // unknown, a shimmering ghost in the colours of the surroundings
  if (!t.bg || now - (t.bgAt || 0) > 500) {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let x = 0; x < W; x += 8) for (const y of [2, H - 3]) { const i = (y * W + x) * 4; r += frame.data[i]; g += frame.data[i + 1]; b += frame.data[i + 2]; n += 1; }
    t.bg = [r / n, g / n, b / n]; t.bgAt = now;
  }
  const out = ctx.createImageData(W, H);
  const o = out.data; const f = frame.data;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const k = y * W + x; const i = k * 4; const cf = conf(x, y);
    if (cf > 0.4) {
      if (t.known[k]) { o[i] = t.plate[i]; o[i + 1] = t.plate[i + 1]; o[i + 2] = t.plate[i + 2]; }
      else { const sx = Math.min(W - 1, Math.max(0, x + Math.round(Math.sin(y / 7 + now / 110) * 28))); const j = (y * W + sx) * 4; const glint = 1 + 0.25 * Math.sin(x / 5 + y / 7 + now / 90); o[i] = (f[j] * 0.22 + t.bg[0] * 0.78) * glint; o[i + 1] = (f[j + 1] * 0.22 + t.bg[1] * 0.78) * glint; o[i + 2] = (f[j + 2] * 0.22 + t.bg[2] * 0.78) * glint + 8; }
    } else { o[i] = f[i]; o[i + 1] = f[i + 1]; o[i + 2] = f[i + 2]; }
    o[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  // particles
  const k = Math.min(1, (now - t.at) / 1600);
  for (const p of t.parts) {
    let x; let y; let a;
    if (t.state === 'out') { x = p.x + p.vx * k * 160 + Math.sin(p.ph + k * 8) * 6; y = p.y - k * (120 + p.vy * 200); a = 1 - k; }
    else { const e = 1 - (1 - k) ** 3; x = p.x + (1 - e) * (p.vx * 160); y = p.y - (1 - e) * (140 + p.vy * 200); a = Math.min(1, k * 1.4); }
    ctx.fillStyle = `rgba(${Math.min(255, p.r + 80 * (t.state === 'out' ? k : 1 - k))},${Math.min(255, p.g + 120 * (t.state === 'out' ? k : 1 - k))},255,${a})`;
    ctx.fillRect(x, y, 2.4, 2.4);
  }
  if (k >= 1) {
    if (t.state === 'out') { t.state = 'gone'; t.parts = []; }
    else if (t.state === 'in') { t.state = 'live'; t.parts = []; }
  }
}
function captureParticles() {
  const t = fx.tele; const c = fx.canvas; const W = c.width; const H = c.height;
  if (!t?.mask) return [];
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(fx.video, 0, 0, W, H);
  const f = ctx.getImageData(0, 0, W, H).data;
  const parts = [];
  const step = Math.max(2, Math.round(W / 260));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const cf = t.mask.data[Math.floor((y / H) * t.mask.h) * t.mask.w + Math.floor((x / W) * t.mask.w)];
    if (cf > 0.5) { const i = (y * W + x) * 4; parts.push({ x, y, r: f[i], g: f[i + 1], b: f[i + 2], vx: Math.random() - 0.5, vy: Math.random(), ph: Math.random() * 6 }); }
  }
  return parts;
}
function teleportOut() {
  if (fx.mode !== 'teleport' || !fx.seg) { fx.pendingTeleport = true; start('teleport'); return; }
  const t = fx.tele;
  if (!t || t.state !== 'live') return;
  t.parts = captureParticles();
  if (!t.parts.length) { deps.toast('Ich sehe dich nicht im Bild – stell dich vor die Kamera.', 'error'); return; }
  t.state = 'out'; t.at = performance.now();
  sweep(300, 2400, 1.4, 'sine', 0.12); noise(1.2, 0.25, 3000);
  fx.root.querySelector('.camfx-status').textContent = 'Teleportiert. Sag „Zurück!“';
}
function teleportBack() {
  const t = fx.tele;
  if (!t || t.state !== 'gone') return;
  t.parts = captureParticles();
  t.state = 'in'; t.at = performance.now();
  sweep(2400, 300, 1.4, 'sine', 0.12); noise(1.2, 0.25, 3000);
  fx.root.querySelector('.camfx-status').textContent = 'Zurück!';
}

export function initCamFx(options) { deps = { ...deps, ...options }; }
export function handleEffectMessage(message) {
  const a = message.action;
  if (a === 'repulsor' || a === 'gesten') start(a);
  else if (a === 'teleport') teleportOut();
  else if (a === 'zurueck') teleportBack();
  else if (a === 'aus') stop();
}
