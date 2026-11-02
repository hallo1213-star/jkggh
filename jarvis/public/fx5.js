// Camera effects, all on this device (MediaPipe): suit on YOUR body (pose),
// laser eyes and cyborg face (face mesh), air drawing (hand), clones
// (person segmentation + delay) and slow-motion replay.
import { cameraError, faceTracker, handTracker, openCamera, personSegmenter, poseTracker } from './mp.js';
import { helmetSvg, ownedSuit } from './suit.js';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let deps = { toast: () => {} };
let cur = null;
const TITLES = { anzug_ar: 'ANZUG-FILTER', laser: 'LASER-AUGEN', malen: 'LUFT-MALEN', klon: 'KLON-EFFEKT', zeitlupe: 'MATRIX-MOMENT', cyborg: 'CYBORG' };

let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); return audio; }
function tone(f, dur, type = 'sine', vol = 0.1, to = f, delay = 0) { try { const a = ac(); const t = a.currentTime + delay; const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ } }

function stop() {
  if (!cur) return;
  const c = cur; cur = null;
  cancelAnimationFrame(c.raf);
  try { c.cleanup?.(); } catch { /* ignore */ }
  c.stream?.getTracks().forEach((t) => t.stop());
  c.root.remove();
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'fx5') stop(); });

async function shell(kind) {
  stop();
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx5' }));
  const root = el('div', `fx5 ${kind}`);
  root.innerHTML = `<div class="fx5-view"><video playsinline muted></video><canvas class="fx5-main"></canvas><p class="fx5-title">${TITLES[kind]}</p><p class="fx5-status">Kamera wird gestartet …</p><div class="fx5-flash"></div></div><div class="fx5-bar"><button type="button" class="fx5-close">Beenden</button></div>`;
  document.body.append(root);
  const me = { kind, root, raf: 0, stream: null, video: root.querySelector('video'), canvas: root.querySelector('canvas'), status: root.querySelector('.fx5-status'), bar: root.querySelector('.fx5-bar') };
  cur = me;
  root.querySelector('.fx5-close').addEventListener('click', stop);
  try { me.stream = await openCamera(me.video); } catch (e) { me.status.textContent = cameraError(e); return null; }
  return cur === me ? me : null;
}
const alive = (me) => cur === me;
function fit(me, maxW = 1280) {
  const v = me.video; if (!v.videoWidth) return false;
  const w = Math.min(maxW, v.videoWidth);
  if (me.canvas.width !== w) { me.canvas.width = w; me.canvas.height = Math.round((w * v.videoHeight) / v.videoWidth); }
  return true;
}
const button = (me, label, cls, fn) => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); me.bar.prepend(b); return b; };

// =========================================================================================
// 1. Anzug auf dir (pose): armour plates fly in and follow your body
// =========================================================================================
function svgImg(svg) { return new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); }); }
async function bodySuit() {
  const me = await shell('anzug_ar'); if (!me) return;
  me.status.textContent = 'Körpererkennung lädt …';
  let pose; try { pose = await poseTracker(); } catch (e) { me.status.textContent = e.message; return; }
  if (!alive(me)) return;
  const suit = ownedSuit() || { farben: { haupt: '#b3121f', akzent: '#d4a64a', leuchten: '#ff6b78' }, helm: 'klassisch' };
  const col = suit.farben || {};
  const [shellImg, faceImg] = await Promise.all([svgImg(helmetSvg(suit, { part: 'shell' })), svgImg(helmetSvg(suit, { part: 'face' }))]);
  me.status.textContent = 'Stell dich so hin, dass man dich bis zur Hüfte sieht.';
  const PARTS = ['brust', 'schulterL', 'schulterR', 'armL', 'armR', 'unterarmL', 'unterarmR', 'helm', 'reaktor'];
  const prog = Object.fromEntries(PARTS.map((p) => [p, 0]));
  let started = 0; let lastT = 0; const clanked = new Set();
  const main = col.haupt || '#b3121f'; const acc = col.akzent || '#d4a64a'; const glow = col.leuchten || '#ff6b78';
  const metal = (ctx, x0, y0, x1, y1, c) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#ffffff55'); g.addColorStop(0.15, c); g.addColorStop(0.6, c); g.addColorStop(1, '#00000099'); return g; };
  const frame = (now) => {
    me.raf = requestAnimationFrame(frame);
    if (!fit(me, 960)) return;
    const c = me.canvas; const ctx = c.getContext('2d'); const W = c.width; const H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (now <= lastT) return; lastT = now;
    const lm = pose.detectForVideo(me.video, now).landmarks?.[0];
    if (!lm) return;
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility ?? 1 });
    const ls = P(11); const rs = P(12); const le = P(13); const re = P(14); const lw = P(15); const rw = P(16); const lh = P(23); const rh = P(24); const nose = P(0); const lear = P(7); const rear = P(8);
    if (ls.v < 0.4 || rs.v < 0.4) return;
    if (!started) { started = now; me.status.textContent = 'Anzug wird angelegt …'; tone(120, 1.2, 'sawtooth', 0.1, 900); }
    const sw = Math.hypot(rs.x - ls.x, rs.y - ls.y);
    PARTS.forEach((p, i) => { const k = Math.min(1, Math.max(0, (now - started - i * 280) / 450)); prog[p] = k; if (k >= 1 && !clanked.has(p)) { clanked.add(p); tone(p === 'reaktor' ? 90 : 200, p === 'reaktor' ? 0.5 : 0.12, p === 'reaktor' ? 'sawtooth' : 'square', 0.1, p === 'reaktor' ? 40 : 90); if (p === 'reaktor') { me.root.classList.remove('flash'); void me.root.offsetWidth; me.root.classList.add('flash'); me.status.textContent = 'ANZUG ONLINE'; } } });
    // a part flies in from outside and eases into place
    const place = (key, draw, fromX, fromY) => { const k = prog[key]; if (k <= 0) return; const e = 1 - (1 - k) ** 3; ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5); ctx.translate((1 - e) * fromX, (1 - e) * fromY); draw(); ctx.restore(); };
    const hipY = (lh.v > 0.3 && rh.v > 0.3) ? (lh.y + rh.y) / 2 : Math.min(H, (ls.y + rs.y) / 2 + sw * 1.4);
    // chest plate
    place('brust', () => {
      const cx = (ls.x + rs.x) / 2; const top = (ls.y + rs.y) / 2 - sw * 0.05; const bot = top + (hipY - top) * 0.78;
      ctx.beginPath(); ctx.moveTo(rs.x - sw * 0.05, top); ctx.lineTo(ls.x + sw * 0.05, top); ctx.lineTo(ls.x - sw * 0.08, top + (bot - top) * 0.55); ctx.lineTo(cx + sw * 0.22, bot); ctx.lineTo(cx - sw * 0.22, bot); ctx.lineTo(rs.x + sw * 0.08, top + (bot - top) * 0.55); ctx.closePath();
      ctx.fillStyle = metal(ctx, rs.x, top, ls.x, bot, main); ctx.shadowColor = '#000'; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = acc; ctx.lineWidth = Math.max(2, sw * 0.02); ctx.stroke();
      for (let i = 1; i <= 3; i += 1) { const y = top + (bot - top) * (0.55 + i * 0.1); ctx.beginPath(); ctx.moveTo(cx - sw * 0.18, y); ctx.lineTo(cx + sw * 0.18, y); ctx.strokeStyle = '#00000088'; ctx.lineWidth = 2; ctx.stroke(); }
    }, 0, H);
    // shoulders
    for (const [key, s, dir] of [['schulterL', ls, 1], ['schulterR', rs, -1]]) place(key, () => { ctx.beginPath(); ctx.ellipse(s.x + dir * sw * 0.05, s.y - sw * 0.02, sw * 0.2, sw * 0.14, dir * 0.3, 0, Math.PI * 2); ctx.fillStyle = metal(ctx, s.x - sw * 0.2, s.y - sw * 0.2, s.x + sw * 0.2, s.y + sw * 0.2, main); ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke(); }, dir * W, -H * 0.3);
    // arms
    const limb = (a, b, w, c2) => { if (a.v < 0.3 || b.v < 0.3) return; ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#000000aa'; ctx.lineWidth = w + 6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = metal(ctx, a.x, a.y, b.x, b.y, c2); ctx.lineWidth = w; ctx.stroke(); ctx.restore(); };
    place('armL', () => limb(ls, le, sw * 0.22, main), W, 0);
    place('armR', () => limb(rs, re, sw * 0.22, main), -W, 0);
    place('unterarmL', () => { limb(le, lw, sw * 0.18, acc); if (lw.v > 0.3) { ctx.beginPath(); ctx.arc(lw.x, lw.y, sw * 0.08, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0; } }, W, H * 0.3);
    place('unterarmR', () => { limb(re, rw, sw * 0.18, acc); if (rw.v > 0.3) { ctx.beginPath(); ctx.arc(rw.x, rw.y, sw * 0.08, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0; } }, -W, H * 0.3);
    // helmet on the head
    place('helm', () => {
      if (!shellImg || nose.v < 0.3) return;
      const headW = Math.max(sw * 0.62, Math.hypot(lear.x - rear.x, lear.y - rear.y) * 1.45);
      const hh = headW * (98 / 84); const ang = Math.atan2(lear.y - rear.y, lear.x - rear.x);
      ctx.save(); ctx.translate(nose.x, nose.y - headW * 0.12); ctx.rotate(ang);
      ctx.drawImage(shellImg, -headW / 2, -hh * 0.55, headW, hh); if (faceImg) ctx.drawImage(faceImg, -headW / 2, -hh * 0.55, headW, hh);
      ctx.restore();
    }, 0, -H);
    // chest reactor
    place('reaktor', () => {
      const cx = (ls.x + rs.x) / 2; const cy = (ls.y + rs.y) / 2 + (hipY - (ls.y + rs.y) / 2) * 0.22; const r = sw * 0.1 * (1 + Math.sin(now / 160) * 0.05);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3); g.addColorStop(0, '#fff'); g.addColorStop(0.25, glow); g.addColorStop(1, 'rgba(255,40,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2); ctx.stroke();
    }, 0, 0);
  };
  me.raf = requestAnimationFrame(frame);
}

// =========================================================================================
// 2. Laser-Augen + 6. Cyborg (face mesh)
// =========================================================================================
const SIL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
async function faceEffect(kind) {
  const me = await shell(kind); if (!me) return;
  me.status.textContent = 'Gesichtserkennung lädt …';
  let face; try { face = await faceTracker(); } catch (e) { me.status.textContent = e.message; return; }
  if (!alive(me)) return;
  me.status.textContent = kind === 'laser' ? 'Reiß die Augen weit auf – oder tippe auf den Bildschirm.' : 'Schau in die Kamera. Sag „Upgrade!“ oder tippe auf Upgrade.';
  let lastT = 0; let base = 0; let baseN = 0; let firing = 0; let manual = 0; let hum = null; let stage = 1; let stageAt = performance.now();
  if (kind === 'laser') me.root.querySelector('.fx5-view').addEventListener('pointerdown', () => { manual = performance.now() + 1200; });
  if (kind === 'cyborg') { me.upgrade = () => { if (stage < 3) { stage += 1; stageAt = performance.now(); tone(300, 0.6, 'sawtooth', 0.1, 1200); } }; button(me, '⬆ Upgrade', 'fx5-go', () => me.upgrade()); }
  const traces = [];
  for (let i = 0; i < SIL.length; i += 2) traces.push([SIL[i], [4, 1, 168, 6, 197, 195][i % 6]]);
  const frame = (now) => {
    me.raf = requestAnimationFrame(frame);
    if (!fit(me, 960)) return;
    const c = me.canvas; const ctx = c.getContext('2d'); const W = c.width; const H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (now <= lastT) return; lastT = now;
    const lm = face.detectForVideo(me.video, now).faceLandmarks?.[0];
    if (!lm) return;
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
    const eyeW = Math.hypot(P(33).x - P(133).x, P(33).y - P(133).y) || 1;
    const open = (Math.hypot(P(159).x - P(145).x, P(159).y - P(145).y) + Math.hypot(P(386).x - P(374).x, P(386).y - P(374).y)) / 2 / eyeW;
    if (kind === 'laser') {
      if (baseN < 40) { base = (base * baseN + open) / (baseN + 1); baseN += 1; }
      const wide = baseN >= 40 && open > base * 1.28;
      const on = wide || now < manual;
      firing += ((on ? 1 : 0) - firing) * 0.3;
      if (on && !hum) { const a = ac(); const o = a.createOscillator(); const g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 70; g.gain.value = 0.06; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; o.connect(f).connect(g).connect(a.destination); o.start(); hum = { stop: () => { try { o.stop(); } catch { /* ignore */ } } }; tone(1500, 0.3, 'square', 0.06, 300); }
      if (!on && hum) { hum.stop(); hum = null; }
      if (firing < 0.03) return;
      const irisL = lm[468] ? P(468) : P(33); const irisR = lm[473] ? P(473) : P(263);
      const mid = { x: (irisL.x + irisR.x) / 2, y: (irisL.y + irisR.y) / 2 }; const tip = P(1);
      let dx = tip.x - mid.x; let dy = tip.y - mid.y + eyeW * 0.6; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      for (const e of [irisL, irisR]) {
        const end = { x: e.x + dx * Math.max(W, H) * 1.5, y: e.y + dy * Math.max(W, H) * 1.5 };
        ctx.lineCap = 'round';
        for (const [w, colr] of [[eyeW * 0.9, `rgba(255,20,40,${0.18 * firing})`], [eyeW * 0.45, `rgba(255,50,60,${0.5 * firing})`], [eyeW * 0.16, `rgba(255,230,230,${firing})`]]) { ctx.strokeStyle = colr; ctx.lineWidth = w; ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 25; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(end.x, end.y); ctx.stroke(); }
        ctx.shadowBlur = 0;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, eyeW * 1.4); g.addColorStop(0, `rgba(255,255,255,${firing})`); g.addColorStop(0.4, `rgba(255,40,60,${0.7 * firing})`); g.addColorStop(1, 'rgba(255,40,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, eyeW * 1.4, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 6; k += 1) { const t = Math.random(); ctx.fillStyle = `rgba(255,${150 + Math.random() * 100},120,${firing})`; ctx.fillRect(e.x + dx * t * W + (Math.random() - 0.5) * 20, e.y + dy * t * W + (Math.random() - 0.5) * 20, 3, 3); }
      }
      return;
    }
    // cyborg: circuit traces (stage 1), scanner eye (2), metal jaw + forehead plate (3)
    const reveal = Math.min(1, (now - stageAt) / 900);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    traces.forEach(([a, b], i) => {
      const A = P(a); const B = P(b); const k = stage > 1 ? 1 : Math.min(1, reveal * 2 - i / traces.length);
      if (k <= 0) return;
      const mx = A.x + (B.x - A.x) * 0.5; const ex = A.x + (B.x - A.x) * k; const ey = A.y + (B.y - A.y) * k;
      ctx.strokeStyle = `rgba(255, 50, 70, ${0.85})`; ctx.lineWidth = Math.max(1.5, eyeW * 0.05); ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(Math.min(mx, ex), A.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = '#ffd0d4'; ctx.beginPath(); ctx.arc(A.x, A.y, eyeW * 0.06, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 42, 61, 0.55)'; ctx.lineWidth = 2; ctx.beginPath(); SIL.forEach((i, k) => { const p = P(i); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.stroke();
    if (stage >= 2) {
      const e = P(33); const e2 = P(133); const cx = (e.x + e2.x) / 2; const cy = (e.y + e2.y) / 2; const r = eyeW * 0.75 * (stage === 2 ? reveal : 1);
      ctx.fillStyle = 'rgba(20, 0, 3, 0.85)'; ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff2a3d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.stroke();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#ff2a3d'); g.addColorStop(1, 'rgba(255,42,61,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(now / 600); ctx.strokeStyle = '#ffd0d4'; ctx.lineWidth = 1.5; for (let k = 0; k < 4; k += 1) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 1.15, 0); ctx.stroke(); } ctx.restore();
    }
    if (stage >= 3) {
      ctx.globalAlpha = stage === 3 ? reveal : 1;
      const jaw = [...LIPS.map(P).reverse(), P(397), P(365), P(379), P(378), P(400), P(377), P(152), P(148), P(176), P(149), P(150), P(136), P(172)];
      ctx.beginPath(); jaw.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      const top = P(17); const chin = P(152); const g = ctx.createLinearGradient(top.x - eyeW * 2, top.y, top.x + eyeW * 2, chin.y); g.addColorStop(0, '#d9d9df'); g.addColorStop(0.4, '#6b6f78'); g.addColorStop(0.7, '#2a2d33'); g.addColorStop(1, '#9aa0a8');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#ff2a3d'; ctx.lineWidth = 2; ctx.stroke();
      for (const i of [148, 377, 176, 400]) { const p = P(i); ctx.fillStyle = '#1a1c20'; ctx.beginPath(); ctx.arc(p.x, p.y - eyeW * 0.25, eyeW * 0.06, 0, Math.PI * 2); ctx.fill(); }
      const f1 = P(54); const f2 = P(284); const f0 = P(10); const fy = P(151);
      ctx.beginPath(); ctx.moveTo(f1.x, f1.y + eyeW * 0.4); ctx.quadraticCurveTo(f0.x, f0.y - eyeW * 0.1, f2.x, f2.y + eyeW * 0.4); ctx.lineTo(fy.x + eyeW * 0.6, fy.y); ctx.lineTo(fy.x - eyeW * 0.6, fy.y); ctx.closePath();
      ctx.fillStyle = 'rgba(80, 84, 92, 0.85)'; ctx.fill(); ctx.strokeStyle = '#ff2a3d'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };
  me.raf = requestAnimationFrame(frame);
  me.cleanup = () => hum?.stop();
}

// =========================================================================================
// 3. Luft-Malen (hand): index finger draws neon lines, fist pauses, open hand clears
// =========================================================================================
async function airDraw() {
  const me = await shell('malen'); if (!me) return;
  me.status.textContent = 'Handerkennung lädt …';
  let hand; try { hand = await handTracker(); } catch (e) { me.status.textContent = e.message; return; }
  if (!alive(me)) return;
  me.status.textContent = 'Zeigefinger ausstrecken = malen · Faust = Pause · offene Hand halten = löschen';
  const ink = document.createElement('canvas'); let color = '#ff2a3d'; let last = null; let lastT = 0; let openSince = 0;
  const colors = el('div', 'fx5-colors');
  for (const cc of ['#ff2a3d', '#ffffff', '#ffb347']) { const b = el('button'); b.type = 'button'; b.style.background = cc; b.addEventListener('click', () => { color = cc; colors.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }); colors.append(b); }
  colors.firstChild.classList.add('on');
  me.root.querySelector('.fx5-view').append(colors);
  button(me, '💾 Bild speichern', 'fx5-go', () => {
    const out = document.createElement('canvas'); out.width = me.canvas.width; out.height = me.canvas.height; const o = out.getContext('2d');
    o.translate(out.width, 0); o.scale(-1, 1); o.drawImage(me.video, 0, 0, out.width, out.height); o.drawImage(ink, 0, 0);
    out.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'jarvis-luftbild.png'; a.click(); }, 'image/png');
  });
  button(me, 'Löschen', 'fx5-ghost', () => ink.getContext('2d').clearRect(0, 0, ink.width, ink.height));
  const frame = (now) => {
    me.raf = requestAnimationFrame(frame);
    if (!fit(me, 1280)) return;
    const c = me.canvas; const W = c.width; const H = c.height;
    if (ink.width !== W) { ink.width = W; ink.height = H; }
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, W, H);
    if (now <= lastT) return; lastT = now;
    const p = hand.detectForVideo(me.video, now).landmarks?.[0];
    if (!p) { last = null; ctx.drawImage(ink, 0, 0); return; }
    const d = (i, j) => Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y); const size = d(0, 9) || 1e-3;
    const indexOut = d(8, 0) > size * 1.6; const othersIn = [12, 16, 20].every((i) => d(i, 0) < size * 1.3);
    const open = [8, 12, 16, 20].every((i) => d(i, 0) > size * 1.6);
    const tip = { x: p[8].x * W, y: p[8].y * H };
    const ic = ink.getContext('2d');
    if (indexOut && othersIn) {
      if (last) { ic.lineCap = 'round'; ic.lineJoin = 'round'; for (const [w, a] of [[16, 0.25], [8, 0.6], [3, 1]]) { ic.strokeStyle = color; ic.globalAlpha = a; ic.lineWidth = w; ic.shadowColor = color; ic.shadowBlur = 18; ic.beginPath(); ic.moveTo(last.x, last.y); ic.lineTo(tip.x, tip.y); ic.stroke(); } ic.globalAlpha = 1; ic.shadowBlur = 0; }
      last = tip; openSince = 0;
    } else { last = null; }
    if (open) { openSince = openSince || now; if (now - openSince > 1300) { ic.clearRect(0, 0, W, H); openSince = 0; tone(800, 0.3, 'triangle', 0.08, 200); } } else openSince = 0;
    ctx.drawImage(ink, 0, 0);
    ctx.fillStyle = indexOut && othersIn ? color : 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2); ctx.fill();
    if (openSince) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tip.x, tip.y, 22, -Math.PI / 2, -Math.PI / 2 + ((now - openSince) / 1300) * Math.PI * 2); ctx.stroke(); }
  };
  me.raf = requestAnimationFrame(frame);
}

// =========================================================================================
// 4. Klon-Effekt (segmentation + delayed copies of you)
// =========================================================================================
async function clones() {
  const me = await shell('klon'); if (!me) return;
  me.status.textContent = 'Personenerkennung lädt …';
  let seg; try { seg = await personSegmenter('VIDEO'); } catch (e) { me.status.textContent = e.message; return; }
  if (!alive(me)) return;
  me.status.textContent = 'Beweg dich – deine Klone machen es nach!';
  me.root.classList.add('own-draw');
  const W = 480; const work = document.createElement('canvas'); const buf = []; let lastT = 0; let count = 4;
  button(me, '+ Klon', 'fx5-ghost', () => { count = Math.min(6, count + 1); tone(600, 0.15, 'triangle', 0.08, 900); });
  const frame = (now) => {
    me.raf = requestAnimationFrame(frame);
    const v = me.video; if (!v.videoWidth) return;
    const H = Math.round((W * v.videoHeight) / v.videoWidth);
    if (work.width !== W) { work.width = W; work.height = H; me.canvas.width = W; me.canvas.height = H; }
    const wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.save(); wctx.translate(W, 0); wctx.scale(-1, 1); wctx.drawImage(v, 0, 0, W, H); wctx.restore();
    if (now <= lastT) return; lastT = now;
    let mask = null;
    seg.segmentForVideo(work, now, (res) => { const m = res.confidenceMasks?.[0]; if (m) mask = { d: m.getAsFloat32Array(), w: m.width, h: m.height }; });
    if (!mask) return;
    const frameData = wctx.getImageData(0, 0, W, H);
    const cut = document.createElement('canvas'); cut.width = W; cut.height = H; const cc = cut.getContext('2d');
    const img = cc.createImageData(W, H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { const i = (y * W + x) * 4; const m = mask.d[Math.floor((y / H) * mask.h) * mask.w + Math.floor((x / W) * mask.w)]; img.data[i] = frameData.data[i]; img.data[i + 1] = frameData.data[i + 1]; img.data[i + 2] = frameData.data[i + 2]; img.data[i + 3] = Math.max(0, Math.min(255, (m - 0.3) * 2.5 * 255)); }
    cc.putImageData(img, 0, 0);
    buf.push(cut); if (buf.length > 70) buf.shift();
    const ctx = me.canvas.getContext('2d');
    ctx.drawImage(work, 0, 0);
    for (let k = count; k >= 1; k -= 1) {
      const idx = buf.length - 1 - k * 9; if (idx < 0) continue;
      const side = k % 2 ? 1 : -1; const off = Math.ceil(k / 2) * W * 0.2 * side;
      ctx.globalAlpha = 0.9 - k * 0.08; ctx.drawImage(buf[idx], off, 0);
      ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255, 30, 50, ${0.08 * k})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1; ctx.drawImage(cut, 0, 0);
  };
  me.raf = requestAnimationFrame(frame);
}

// =========================================================================================
// 5. Matrix-Moment: 3 s recording, replay in slow motion with ghost trails, save
// =========================================================================================
async function slowmo() {
  const me = await shell('zeitlupe'); if (!me) return;
  me.root.classList.add('own-draw');
  me.status.textContent = 'Gleich geht\'s los – mach eine coole Bewegung!';
  const frames = []; const W = 640;
  const go = async () => {
    for (const n of [3, 2, 1]) { me.status.textContent = `Aufnahme in ${n} …`; tone(660, 0.12, 'square', 0.07); await new Promise((r) => setTimeout(r, 900)); if (!alive(me)) return; }
    me.status.textContent = 'AUFNAHME!'; tone(1200, 0.2, 'triangle', 0.1);
    const v = me.video; const H = Math.round((W * v.videoHeight) / (v.videoWidth || 640)); me.canvas.width = W; me.canvas.height = H;
    const t0 = performance.now();
    await new Promise((resolve) => {
      let lastGrab = 0;
      const grab = (now = performance.now()) => {
        if (!alive(me)) { resolve(); return; }
        if (now - lastGrab < 30) { requestAnimationFrame(grab); return; }
        lastGrab = now;
        const f = document.createElement('canvas'); f.width = W; f.height = H; const fc = f.getContext('2d'); fc.translate(W, 0); fc.scale(-1, 1); fc.drawImage(v, 0, 0, W, H); frames.push(f);
        const ctx = me.canvas.getContext('2d'); ctx.drawImage(f, 0, 0);
        if (performance.now() - t0 < 3000) requestAnimationFrame(grab); else resolve();
      };
      grab();
    });
    if (!alive(me)) return;
    me.stream.getTracks().forEach((t) => t.stop());
    play();
  };
  const play = () => {
    me.status.textContent = 'MATRIX-MOMENT';
    const ctx = me.canvas.getContext('2d'); const W2 = me.canvas.width; const H2 = me.canvas.height;
    const dur = Math.min(10000, frames.length * (1000 / 30) * 4); const t0 = performance.now();
    const out = me.canvas.captureStream?.(30); let rec = null; const chunks = [];
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
    if (out && mime) { rec = new MediaRecorder(out, { mimeType: mime }); rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; rec.onstop = () => { const blob = new Blob(chunks, { type: mime.split(';')[0] }); button(me, '💾 Video speichern', 'fx5-go', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `jarvis-matrix.${mime.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); }); button(me, '↻ Nochmal', 'fx5-ghost', () => slowmo()); }; rec.start(); }
    tone(300, dur / 1000, 'sine', 0.06, 60);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur); const pos = k * (frames.length - 1); const i = Math.floor(pos);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W2, H2);
      const z = 1 + k * 0.18; ctx.save(); ctx.translate(W2 / 2, H2 / 2); ctx.scale(z, z); ctx.translate(-W2 / 2, -H2 / 2);
      for (let g = 6; g >= 1; g -= 1) { const j = i - g * 3; if (j < 0) continue; ctx.globalAlpha = 0.12 * (7 - g) / 6; ctx.drawImage(frames[j], 0, 0); }
      ctx.globalAlpha = 1; ctx.drawImage(frames[i], 0, 0); ctx.restore();
      ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255, 30, 50, 0.12)'; ctx.fillRect(0, 0, W2, H2); ctx.globalCompositeOperation = 'source-over';
      const vg = ctx.createRadialGradient(W2 / 2, H2 / 2, H2 * 0.3, W2 / 2, H2 / 2, H2 * 0.9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.8)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W2, H2);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W2, H2 * 0.08); ctx.fillRect(0, H2 * 0.92, W2, H2 * 0.08);
      if (k < 1 && alive(me)) requestAnimationFrame(step); else { rec?.state === 'recording' && rec.stop(); me.status.textContent = 'Fertig!'; }
    };
    requestAnimationFrame(step);
  };
  setTimeout(go, 800);
}

// Picker for "Schalte die Kamera an" without a specific effect.
const MENU = [['laser', '👁️', 'Laser-Augen'], ['malen', '✍️', 'Luft-Malen'], ['klon', '👥', 'Klone'], ['zeitlupe', '⏱️', 'Matrix-Moment'], ['cyborg', '🤖', 'Cyborg'], ['anzug_ar', '🦾', 'Anzug auf dir'], ['klinge', '⚔️', 'Energieklinge'], ['repulsor', '✋', 'Repulsor'], ['teleport', '✨', 'Teleport'], ['hologramm', '📡', 'Hologramm']];
function menu() {
  stop();
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx5' }));
  const root = el('div', 'fx5 fx5-menu');
  root.innerHTML = `<div class="fx5-pick"><p class="fx5-pick-kicker">JARVIS · KAMERA-EFFEKTE</p><h2>Was willst du ausprobieren?</h2><div class="fx5-grid">${MENU.map(([a, i, t]) => `<button type="button" data-a="${a}"><span>${i}</span>${t}</button>`).join('')}</div><p class="fx5-pick-hint">Oder sag es einfach, z. B. „Laser-Augen“.</p></div><div class="fx5-bar"><button type="button" class="fx5-close">Schließen</button></div>`;
  document.body.append(root);
  cur = { kind: 'menu', root, raf: 0 };
  root.querySelector('.fx5-close').addEventListener('click', stop);
  root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { tone(900, 0.08, 'triangle', 0.06); stop(); deps.runEffect?.(b.dataset.a); }));
}

export function initFx5(options) { deps = { ...deps, ...options }; }
export function handleFx5(action) {
  if (action === 'anzug_ar') bodySuit();
  else if (action === 'laser') faceEffect('laser');
  else if (action === 'cyborg') faceEffect('cyborg');
  else if (action === 'upgrade') { if (cur?.kind === 'cyborg') cur.upgrade?.(); else faceEffect('cyborg'); }
  else if (action === 'malen') airDraw();
  else if (action === 'klon') clones();
  else if (action === 'zeitlupe') slowmo();
  else if (action === 'menu') menu();
  else if (action === 'aus') stop();
}
export const FX5_ACTIONS = ['menu', 'anzug_ar', 'laser', 'cyborg', 'upgrade', 'malen', 'klon', 'zeitlupe'];
