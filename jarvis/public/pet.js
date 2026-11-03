// Holo-Katze: a realistic-looking kitten that lives in Jarvis (on this device).
// Fur is rendered once per body part (thousands of fur strokes, tabby stripes,
// fluffy edges) and then animated: breathing, blinking, ear twitches, tail,
// eyes that follow your finger, purring, meowing, yawning, grooming, sleeping.
// Interactions are real mini-games: fill the bowl and watch her eat, throw the
// yarn ball or steer a laser dot and she pounces, stroke her with your finger
// and she purrs. She grows from kitten to cat with care.
import { fitCanvas, loop, perf } from './cae/perf.js';
import { FOODS, FURS, MOODS, STAGES, act, asleep, migrate, mood, newPet, stageOf, summary, tick } from './pet-state.js';

export { STAGES, act, isNight, mood, newPet, stageOf, summary, tick } from './pet-state.js';

const KEY = 'jarvis.pet';
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
let deps = { send: () => {}, toast: () => {} };
let ui = null;

// ---------------------------------------------------------------------------
// Sound (synthesised, no files)
// ---------------------------------------------------------------------------
let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); return audio; }
function meow(pitch = 1, len = 0.6) {
  try {
    const a = ac(); const t = a.currentTime; const out = a.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.09, t + 0.06); out.gain.setValueAtTime(0.09, t + len * 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(900 * pitch, t); bp.frequency.linearRampToValueAtTime(1700 * pitch, t + len * 0.35); bp.frequency.linearRampToValueAtTime(800 * pitch, t + len);
    bp.connect(out).connect(a.destination);
    for (const [type, det] of [['sawtooth', 0], ['square', 7]]) { const o = a.createOscillator(); o.type = type; o.detune.value = det; o.frequency.setValueAtTime(480 * pitch, t); o.frequency.linearRampToValueAtTime(760 * pitch, t + len * 0.3); o.frequency.linearRampToValueAtTime(520 * pitch, t + len); o.connect(bp); o.start(t); o.stop(t + len + 0.05); }
  } catch { /* no audio */ }
}
function blip(f, d, v = 0.05, type = 'sine') { try { const a = ac(); const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch { /* no audio */ } }
function noise(d, freq, v = 0.08, q = 1.5) { try { const a = ac(); const t = a.currentTime; const len = Math.ceil(a.sampleRate * d); const b = a.createBuffer(1, len, a.sampleRate); const ch = b.getChannelData(0); for (let i = 0; i < len; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / len); const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = a.createGain(); g.gain.value = v; s.connect(f).connect(g).connect(a.destination); s.start(t); } catch { /* no audio */ } }
const crunch = () => { noise(0.05, rnd(1800, 3200), 0.12, 2); setTimeout(() => noise(0.04, rnd(1500, 2600), 0.08, 2), 70); };
let purrNode = null;
function purr(level) {
  try {
    const a = ac();
    if (!purrNode && level > 0.02) {
      const len = a.sampleRate * 2; const b = a.createBuffer(1, len, a.sampleRate); const ch = b.getChannelData(0); for (let i = 0; i < len; i += 1) ch[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource(); src.buffer = b; src.loop = true;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const am = a.createGain(); am.gain.value = 0.5;
      const lfo = a.createOscillator(); lfo.frequency.value = 24; const lfoGain = a.createGain(); lfoGain.gain.value = 0.5; lfo.connect(lfoGain).connect(am.gain);
      const master = a.createGain(); master.gain.value = 0;
      src.connect(lp).connect(am).connect(master).connect(a.destination); src.start(); lfo.start();
      purrNode = { src, lfo, master };
    }
    if (purrNode) { purrNode.master.gain.setTargetAtTime(level * 0.5, a.currentTime, 0.25); if (level <= 0.02) setTimeout(() => { if (purrNode && purrNode.master.gain.value < 0.02) { try { purrNode.src.stop(); purrNode.lfo.stop(); } catch { /* ignore */ } purrNode = null; } }, 1200); }
  } catch { /* no audio */ }
}

// ---------------------------------------------------------------------------
// Fur textures (rendered once per part, then only moved)
// ---------------------------------------------------------------------------
function furTexture(w, h, path, fur, opts = {}) {
  const R = Math.min(2, perf.dpr); const pad = opts.pad ?? 10;
  const c = document.createElement('canvas'); c.width = Math.ceil((w + pad * 2) * R); c.height = Math.ceil((h + pad * 2) * R);
  const x = c.getContext('2d'); x.scale(R, R); x.translate(pad, pad);
  const P = path();
  x.save(); x.clip(P);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, fur.light); g.addColorStop(0.45, fur.base); g.addColorStop(1, fur.dark);
  x.fillStyle = g; x.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
  if (opts.belly) { const [bx, by, brx, bry] = opts.belly; const bg = x.createRadialGradient(bx, by, 1, bx, by, Math.max(brx, bry)); bg.addColorStop(0, fur.belly); bg.addColorStop(0.65, fur.belly); bg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = bg; x.save(); x.translate(bx, by); x.scale(1, bry / brx); x.translate(-bx, -by); x.beginPath(); x.arc(bx, by, brx, 0, Math.PI * 2); x.fill(); x.restore(); }
  if (fur.stripes && opts.stripes) { x.strokeStyle = fur.dark; x.lineCap = 'round'; for (const s of opts.stripes) { x.globalAlpha = s.a ?? 0.55; x.lineWidth = s.w; x.beginPath(); x.moveTo(s.p[0], s.p[1]); x.quadraticCurveTo(s.p[2], s.p[3], s.p[4], s.p[5]); x.stroke(); } x.globalAlpha = 1; }
  // fur strokes
  const n = Math.round((w * h) / 9 * (perf.tier === 'high' ? 1 : 0.6));
  const cxp = opts.center ? opts.center[0] : w / 2; const cyp = opts.center ? opts.center[1] : h / 2;
  x.lineWidth = 0.9; x.lineCap = 'round';
  for (let i = 0; i < n; i += 1) {
    const px = Math.random() * w; const py = Math.random() * h;
    const ang = opts.dir ? opts.dir(px, py) : Math.atan2(py - cyp, px - cxp) * 0.35 + Math.PI / 2;
    const len = rnd(2.5, 5.5);
    const r = Math.random();
    x.strokeStyle = r < 0.33 ? fur.light : r < 0.75 ? fur.base : fur.dark;
    x.globalAlpha = rnd(0.18, 0.45);
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); x.stroke();
  }
  // soft shading
  const sh = x.createRadialGradient(w * 0.35, h * 0.3, 2, w / 2, h / 2, Math.max(w, h) * 0.75); sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.globalAlpha = 1; x.fillStyle = sh; x.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
  x.restore();
  // fluffy edge: strokes that stick out of the outline
  const m = Math.round((w + h) * (opts.fluff ?? 1.6));
  for (let i = 0, tries = 0; i < m && tries < m * 8; tries += 1) {
    const px = Math.random() * w; const py = Math.random() * h;
    const ang = Math.atan2(py - cyp, px - cxp); const ox = px + Math.cos(ang) * 3.5; const oy = py + Math.sin(ang) * 3.5;
    if (!x.isPointInPath(P, (px + pad) * R, (py + pad) * R) || x.isPointInPath(P, (ox + pad) * R, (oy + pad) * R)) continue;
    i += 1; x.strokeStyle = Math.random() < 0.5 ? fur.base : fur.light; x.globalAlpha = rnd(0.35, 0.8); x.lineWidth = rnd(0.8, 1.4);
    const len = rnd(2, 5.5); const a2 = ang + rnd(-0.35, 0.35);
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a2) * len, py + Math.sin(a2) * len); x.stroke();
  }
  x.globalAlpha = 1;
  return { canvas: c, w: w + pad * 2, h: h + pad * 2, pad };
}

function buildCat(furKey, stageKey) {
  const fur = FURS[furKey] || FURS.rot;
  const k = stageKey === 'baby' ? 0 : stageKey === 'kind' ? 0.5 : 1; // growth
  const geo = { hw: lerp(132, 120, k), hh: lerp(112, 104, k), bw: lerp(108, 138, k), bh: lerp(112, 150, k), lw: lerp(24, 27, k), lh: lerp(54, 74, k), er: lerp(17, 13.5, k), ear: lerp(40, 46, k), tail: lerp(70, 120, k), k };
  const { hw, hh, bw, bh, lw, lh } = geo;
  const head = furTexture(hw, hh, () => { const p = new Path2D(); p.ellipse(hw / 2, hh * 0.47, hw * 0.47, hh * 0.44, 0, 0, Math.PI * 2); p.ellipse(hw * 0.27, hh * 0.66, hw * 0.25, hh * 0.27, 0.3, 0, Math.PI * 2); p.ellipse(hw * 0.73, hh * 0.66, hw * 0.25, hh * 0.27, -0.3, 0, Math.PI * 2); return p; }, fur, {
    belly: [hw / 2, hh * 0.78, hw * 0.3, hh * 0.22], center: [hw / 2, hh * 0.55],
    stripes: [{ w: 3.2, p: [hw * 0.5, hh * 0.06, hw * 0.5, hh * 0.18, hw * 0.5, hh * 0.3] }, { w: 2.6, p: [hw * 0.4, hh * 0.08, hw * 0.41, hh * 0.18, hw * 0.43, hh * 0.27] }, { w: 2.6, p: [hw * 0.6, hh * 0.08, hw * 0.59, hh * 0.18, hw * 0.57, hh * 0.27] }, { w: 2.4, p: [hw * 0.06, hh * 0.52, hw * 0.16, hh * 0.5, hw * 0.25, hh * 0.53] }, { w: 2.4, p: [hw * 0.94, hh * 0.52, hw * 0.84, hh * 0.5, hw * 0.75, hh * 0.53] }, { w: 2, a: 0.4, p: [hw * 0.08, hh * 0.64, hw * 0.16, hh * 0.62, hw * 0.24, hh * 0.65] }, { w: 2, a: 0.4, p: [hw * 0.92, hh * 0.64, hw * 0.84, hh * 0.62, hw * 0.76, hh * 0.65] }]
  });
  const body = furTexture(bw, bh, () => { const p = new Path2D(); p.moveTo(bw * 0.34, 0); p.bezierCurveTo(bw * 0.12, bh * 0.25, -bw * 0.02, bh * 0.7, bw * 0.06, bh * 0.94); p.quadraticCurveTo(bw * 0.5, bh * 1.04, bw * 0.94, bh * 0.94); p.bezierCurveTo(bw * 1.02, bh * 0.7, bw * 0.88, bh * 0.25, bw * 0.66, 0); p.closePath(); return p; }, fur, {
    belly: [bw / 2, bh * 0.45, bw * 0.24, bh * 0.42], center: [bw / 2, bh * 0.2], fluff: 2,
    dir: (px, py) => Math.PI / 2 + (px - bw / 2) / bw * 0.8,
    stripes: [0.3, 0.48, 0.66, 0.82].flatMap((f) => [{ w: 4, a: 0.45, p: [bw * 0.04, bh * f, bw * 0.14, bh * (f - 0.05), bw * 0.26, bh * (f + 0.01)] }, { w: 4, a: 0.45, p: [bw * 0.96, bh * f, bw * 0.86, bh * (f - 0.05), bw * 0.74, bh * (f + 0.01)] }])
  });
  const leg = furTexture(lw, lh, () => { const p = new Path2D(); p.roundRect(0, 0, lw, lh - lw * 0.3, lw * 0.45); p.ellipse(lw / 2, lh - lw * 0.38, lw * 0.6, lw * 0.4, 0, 0, Math.PI * 2); return p; }, furKey === 'schwarz' ? { ...fur, light: fur.belly, base: fur.belly, dark: '#cfc8bf' } : fur, {
    center: [lw / 2, 0], dir: () => Math.PI / 2, stripes: [{ w: 3, a: 0.4, p: [0, lh * 0.25, lw / 2, lh * 0.22, lw, lh * 0.25] }, { w: 3, a: 0.4, p: [0, lh * 0.5, lw / 2, lh * 0.47, lw, lh * 0.5] }], fluff: 1
  });
  const ear = (flip) => furTexture(geo.ear, geo.ear * 1.05, () => { const p = new Path2D(); const e = geo.ear; if (flip) { p.moveTo(e, e * 1.05); p.quadraticCurveTo(e * 0.9, e * 0.2, e * 0.25, 0); p.quadraticCurveTo(e * 0.1, e * 0.6, 0, e * 1.05); } else { p.moveTo(0, e * 1.05); p.quadraticCurveTo(e * 0.1, e * 0.2, e * 0.75, 0); p.quadraticCurveTo(e * 0.9, e * 0.6, e, e * 1.05); } p.closePath(); return p; }, fur, { fluff: 0.8, center: [geo.ear / 2, geo.ear] });
  // pink inner ear drawn on top of the ear textures
  for (const [t, flip] of [[ear(false), false], [ear(true), true]]) {
    const x = t.canvas.getContext('2d'); const e = geo.ear; x.save(); x.translate(t.pad, t.pad);
    const g = x.createLinearGradient(0, e * 0.2, 0, e); g.addColorStop(0, '#e8a3a8'); g.addColorStop(1, 'rgba(200,110,120,0.4)');
    x.fillStyle = g; x.beginPath(); if (flip) { x.moveTo(e * 0.82, e); x.quadraticCurveTo(e * 0.75, e * 0.35, e * 0.32, e * 0.18); x.quadraticCurveTo(e * 0.25, e * 0.6, e * 0.2, e); } else { x.moveTo(e * 0.18, e); x.quadraticCurveTo(e * 0.25, e * 0.35, e * 0.68, e * 0.18); x.quadraticCurveTo(e * 0.75, e * 0.6, e * 0.8, e); } x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 0.8; for (let i = 0; i < 9; i += 1) { const bx = e * (flip ? rnd(0.3, 0.75) : rnd(0.25, 0.7)); const by = e * rnd(0.6, 0.98); x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + rnd(-4, 4), by - rnd(6, 12)); x.stroke(); }
    x.restore();
    if (flip) geo.earR = t; else geo.earL = t;
  }
  return { fur, geo, head, body, leg };
}

// ---------------------------------------------------------------------------
// Drawing the cat (front view, sitting)
// ---------------------------------------------------------------------------
function blit(ctx, t, x, y, sx = 1, sy = 1) { ctx.drawImage(t.canvas, x - t.pad * sx, y - t.pad * sy, t.w * sx, t.h * sy); }

function drawTail(ctx, cat, ox, oy, a, time) {
  const { geo, fur } = cat; const u = 1; const L = geo.tail; const segs = 18;
  const sway = a.sleep > 0.5 ? 0.1 : a.tailAmp; const speed = a.tailSpeed;
  ctx.save();
  let x = ox + geo.bw * 0.34; let y = oy - 8; let ang = a.sleep > 0.5 ? Math.PI * 0.95 : -Math.PI * 0.18;
  const pts = [];
  for (let i = 0; i <= segs; i += 1) {
    const f = i / segs; pts.push([x, y, f]);
    ang += (a.sleep > 0.5 ? 0.09 : -0.055) + Math.sin(time / speed - f * 2.6) * sway * f * 0.5;
    x += Math.cos(ang) * (L / segs) * u; y += Math.sin(ang) * (L / segs) * u;
  }
  const w0 = geo.lw * 0.55;
  for (let i = pts.length - 1; i >= 0; i -= 1) { const [px, py, f] = pts[i]; const r = w0 * (1 - f * 0.35); const ringDark = fur.stripes && Math.floor(f * 7) % 2 === 1; const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 1, px, py, r); g.addColorStop(0, ringDark ? fur.base : fur.light); g.addColorStop(1, ringDark ? fur.dark : fur.base); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); }
  if (fur.stripes || fur === FURS.schwarz) { const [px, py] = pts[pts.length - 1]; ctx.fillStyle = fur === FURS.schwarz ? fur.dark : fur.dark; ctx.beginPath(); ctx.arc(px, py, w0 * 0.62, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawEye(ctx, ex, ey, r, a, side, fur, stageK) {
  const open = 1 - a.eyesClosed;
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(side * -0.08);
  if (open < 0.08) { // closed: happy curve
    ctx.strokeStyle = '#1a0d08'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, a.purr > 0.3 ? -r * 0.55 : r * 0.35, r, 0); ctx.stroke(); ctx.restore(); return;
  }
  const ry = r * 0.88;
  ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2); ctx.fillStyle = '#120806'; ctx.fill();
  ctx.save(); ctx.clip();
  const iris = stageK < 0.5 ? ['#bfe3ff', '#5aa7e0', '#2b5f8f'] : stageK < 1 ? ['#e2f5c0', '#9bc85a', '#4f7a24'] : ['#fff1a8', '#d9a52b', '#8a5a10'];
  const lx = a.lookX * r * 0.28; const ly = a.lookY * r * 0.2;
  const g = ctx.createRadialGradient(lx, ly, r * 0.1, lx, ly, r * 1.05); g.addColorStop(0, iris[0]); g.addColorStop(0.45, iris[1]); g.addColorStop(1, iris[2]);
  ctx.fillStyle = g; ctx.fillRect(-r, -ry, r * 2, ry * 2);
  // iris fibres
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.7; for (let i = 0; i < 18; i += 1) { const t = (i / 18) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(lx + Math.cos(t) * r * 0.3, ly + Math.sin(t) * r * 0.3); ctx.lineTo(lx + Math.cos(t) * r * 0.9, ly + Math.sin(t) * r * 0.9); ctx.stroke(); }
  // pupil: slit when calm, round when excited
  const pw = r * lerp(0.16, 0.62, a.pupil); ctx.fillStyle = '#050202'; ctx.beginPath(); ctx.ellipse(lx, ly, pw, ry * 0.84, 0, 0, Math.PI * 2); ctx.fill();
  // highlights
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.ellipse(lx - r * 0.32, ly - ry * 0.38, r * 0.2, r * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(lx + r * 0.3, ly + ry * 0.32, r * 0.08, 0, Math.PI * 2); ctx.fill();
  // eyelid (blink / sleepy)
  const lid = (1 - open) * ry * 2;
  if (lid > 0.5) { const yl = -ry + lid; const sag = Math.min(ry * 0.45, lid * 0.5); ctx.fillStyle = fur.base; ctx.beginPath(); ctx.moveTo(-r - 2, -ry - 2); ctx.lineTo(r + 2, -ry - 2); ctx.lineTo(r + 2, yl - sag * 0.6); ctx.quadraticCurveTo(0, yl + sag, -r - 2, yl - sag * 0.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#1a0d08'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(r, yl - sag * 0.6); ctx.quadraticCurveTo(0, yl + sag, -r, yl - sag * 0.6); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,8,5,0.9)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawCat(ctx, cat, a, ox, floorY, time) {
  const { geo, head, body, leg, fur } = cat; const { hw, hh, bw, bh, lw, lh } = geo;
  const breath = 1 + Math.sin(time / (a.sleep > 0.5 ? 1300 : 700)) * (a.purr > 0.2 ? 0.022 : 0.012);
  const cx = ox + a.catX; const base = floorY - a.jumpY;
  const crouch = a.crouch; const bodyH = bh * (1 - crouch * 0.22) * breath; const bodyTop = base - bodyH;
  // shadow
  const sh = ctx.createRadialGradient(cx, floorY + 4, 2, cx, floorY + 4, bw * 0.9);
  sh.addColorStop(0, `rgba(0,0,0,${0.45 - Math.min(0.3, a.jumpY / 300)})`); sh.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(cx, floorY + 4, bw * 0.85, bw * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  drawTail(ctx, cat, cx, base, a, time);
  // butt wiggle before pounce
  const wig = a.wiggle ? Math.sin(time / 45) * 3 * a.wiggle : 0;
  blit(ctx, body, cx - bw / 2 + wig, bodyTop, 1, bodyH / bh);
  // front legs (paw raise = swipe / groom / knead)
  for (const [side, raise] of [[-1, a.pawL], [1, a.pawR]]) {
    const lx = cx + side * bw * 0.17 - lw / 2; const ly = base - lh;
    ctx.save(); ctx.translate(lx + lw / 2, ly + 6); ctx.rotate(side * -raise * 1.25); ctx.translate(-(lx + lw / 2), -(ly + 6) - raise * 14);
    blit(ctx, leg, lx, ly, 1, 1);
    ctx.strokeStyle = 'rgba(40,20,10,0.45)'; ctx.lineWidth = 1; for (const tx of [-0.18, 0.05, 0.28]) { ctx.beginPath(); ctx.moveTo(lx + lw * (0.5 + tx), base - lw * 0.18); ctx.lineTo(lx + lw * (0.5 + tx), base - lw * 0.42); ctx.stroke(); }
    ctx.restore();
  }
  // head
  const hx = cx + a.headDx; const hy = bodyTop - hh * 0.62 + a.headDy + crouch * 10;
  ctx.save(); ctx.translate(hx, hy + hh / 2); ctx.rotate(a.tilt); ctx.translate(-hx, -(hy + hh / 2));
  for (const [side, t] of [[-1, geo.earL], [1, geo.earR]]) {
    const ex = hx + side * hw * 0.28; const ey = hy + hh * 0.12;
    const back = a.earBack + (side < 0 ? a.twitchL : a.twitchR);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(side * (0.18 + back * 0.7)); ctx.scale(1, 1 - back * 0.25);
    blit(ctx, t, -geo.ear / 2, -geo.ear * 0.95, 1, 1); ctx.restore();
  }
  blit(ctx, head, hx - hw / 2, hy, 1, 1);
  // eyes
  const er = geo.er; const eyY = hy + hh * 0.43;
  drawEye(ctx, hx - hw * 0.2, eyY, er, a, -1, fur, geo.k);
  drawEye(ctx, hx + hw * 0.2, eyY, er, a, 1, fur, geo.k);
  // nose
  const nx = hx; const ny = hy + hh * 0.6;
  const ng = ctx.createLinearGradient(nx, ny - 5, nx, ny + 5); ng.addColorStop(0, '#f2a6ae'); ng.addColorStop(1, '#c9707b');
  ctx.fillStyle = ng; ctx.beginPath(); ctx.moveTo(nx - 7, ny - 3); ctx.quadraticCurveTo(nx, ny - 6, nx + 7, ny - 3); ctx.quadraticCurveTo(nx + 2, ny + 4, nx, ny + 5); ctx.quadraticCurveTo(nx - 2, ny + 4, nx - 7, ny - 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(nx - 2, ny - 2.5, 2.2, 1.2, 0, 0, Math.PI * 2); ctx.fill();
  // mouth
  ctx.strokeStyle = '#3a1e14'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const mo = a.mouth;
  if (mo > 0.08) {
    ctx.fillStyle = '#5a1e22'; ctx.beginPath(); ctx.ellipse(nx, ny + 10 + mo * 4, 5 + mo * 4, 2 + mo * 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(nx + s * (3 + mo * 3), ny + 8); ctx.lineTo(nx + s * (2 + mo * 3), ny + 8 + mo * 4); ctx.lineTo(nx + s * (1 + mo * 3), ny + 8); ctx.fill(); }
  }
  if (a.tongue > 0.05) { ctx.fillStyle = '#e8737f'; ctx.beginPath(); ctx.ellipse(nx + a.tongueX, ny + 12 + a.tongue * 6, 4.5, 3 + a.tongue * 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(160,50,60,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(nx + a.tongueX, ny + 10); ctx.lineTo(nx + a.tongueX, ny + 13 + a.tongue * 7); ctx.stroke(); ctx.strokeStyle = '#3a1e14'; ctx.lineWidth = 1.5; }
  ctx.beginPath(); ctx.moveTo(nx, ny + 5); ctx.lineTo(nx, ny + 8); ctx.moveTo(nx, ny + 8); ctx.quadraticCurveTo(nx - 4, ny + 12, nx - 9, ny + 9); ctx.moveTo(nx, ny + 8); ctx.quadraticCurveTo(nx + 4, ny + 12, nx + 9, ny + 9); ctx.stroke();
  // blush when purring
  if (a.purr > 0.1) { for (const s of [-1, 1]) { const bg = ctx.createRadialGradient(hx + s * hw * 0.3, ny + 2, 1, hx + s * hw * 0.3, ny + 2, 14); bg.addColorStop(0, `rgba(255,120,140,${0.35 * a.purr})`); bg.addColorStop(1, 'rgba(255,120,140,0)'); ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(hx + s * hw * 0.3, ny + 2, 14, 0, Math.PI * 2); ctx.fill(); } }
  // whiskers
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.9;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i += 1) { const wy = ny + 4 + i * 4; const tw = Math.sin(time / 500 + i) * 1.5 + a.whisker * 6; ctx.beginPath(); ctx.moveTo(nx + s * 12, wy); ctx.quadraticCurveTo(nx + s * 40, wy - 4 + i * 2 - tw, nx + s * (62 + i * 4), wy - 6 + i * 6 - tw); ctx.stroke(); }
  ctx.restore();
  return { cx, hx, hy, base, headR: hw / 2, bodyTop };
}

// bowl, yarn ball, laser dot, holo hand
function drawBowl(ctx, x, y, food, amount) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createLinearGradient(-46, -10, 46, 18); g.addColorStop(0, '#ff5c6c'); g.addColorStop(0.5, '#b3121f'); g.addColorStop(1, '#5a0010');
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 20, 52, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-46, -4); ctx.lineTo(-36, 18); ctx.quadraticCurveTo(0, 26, 36, 18); ctx.lineTo(46, -4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a0408'; ctx.beginPath(); ctx.ellipse(0, -4, 46, 10, 0, 0, Math.PI * 2); ctx.fill();
  if (amount > 0.02) {
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, -4, 42, 8, 0, 0, Math.PI * 2); ctx.clip();
    if (food === 'milch') { ctx.fillStyle = '#fbf6ee'; ctx.beginPath(); ctx.ellipse(0, -4 + (1 - amount) * 6, 40 * (0.6 + amount * 0.4), 7 * (0.6 + amount * 0.4), 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-12, -6, 8, 2, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (food === 'fisch') { const n = Math.ceil(amount * 3); for (let i = 0; i < n; i += 1) { const fx = -18 + i * 18; ctx.fillStyle = '#e9a36a'; ctx.beginPath(); ctx.ellipse(fx, -6, 9, 4, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx + 8, -6); ctx.lineTo(fx + 14, -10); ctx.lineTo(fx + 14, -2); ctx.fill(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(fx - 5, -7, 1, 0, Math.PI * 2); ctx.fill(); } }
    else { const n = Math.ceil(amount * 46); for (let i = 0; i < n; i += 1) { const t = i * 2.39996; const rr = Math.sqrt(i / 46) * 38; ctx.fillStyle = i % 3 ? '#8a5226' : '#b06a32'; ctx.beginPath(); ctx.ellipse(Math.cos(t) * rr, -5 + Math.sin(t) * rr * 0.2 - amount * 2, 3.2, 2.4, t, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-24, 6, 6, 3, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawYarn(ctx, b, time) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  const g = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.3, 2, 0, 0, b.r); g.addColorStop(0, '#ff8a95'); g.addColorStop(1, '#a3101d');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,225,0.55)'; ctx.lineWidth = 1.4; for (let i = 0; i < 6; i += 1) { ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.95, b.r * (0.25 + i * 0.12), i * 0.55, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  // loose thread
  ctx.strokeStyle = 'rgba(255,92,108,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.x, b.y + b.r * 0.6); ctx.bezierCurveTo(b.x - 20 - b.vx * 2, b.y + b.r + 4, b.x - 34 - b.vx * 3, b.y + b.r + 2 + Math.sin(time / 200) * 2, b.x - 48 - b.vx * 4, b.y + b.r + 6); ctx.stroke();
}
function drawLaser(ctx, d, time) { const r = 5 + Math.sin(time / 60) * 1.2; const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r * 4); g.addColorStop(0, '#fff'); g.addColorStop(0.2, '#ff2a3d'); g.addColorStop(1, 'rgba(255,42,61,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, r * 4, 0, Math.PI * 2); ctx.fill(); }
function drawHand(ctx, x, y, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.25); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255, 92, 108, 0.22)'; ctx.strokeStyle = 'rgba(255, 140, 150, 0.9)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.roundRect(-22, -6, 44, 40, 14); for (let i = 0; i < 4; i += 1) ctx.roundRect(-22 + i * 11.5, -38 + Math.abs(i - 1.5) * 6, 10, 38, 5); ctx.roundRect(18, 6, 26, 10, 5); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Behaviour + UI
// ---------------------------------------------------------------------------
function load() { try { const p = migrate(JSON.parse(localStorage.getItem(KEY) || 'null')); return p && p.born ? tick(p) : null; } catch { return null; } }
let saveTimer = 0;
function save(p, now = false) { const run = () => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } deps.send(summary(p)); }; clearTimeout(saveTimer); if (now) run(); else saveTimer = setTimeout(run, 1200); }
export function petState() { const p = load(); return p ? summary(p) : { type: 'pet_state', exists: false }; }

function render() {
  if (!ui) return;
  const p = ui.pet; const s = stageOf(p); const next = STAGES[STAGES.indexOf(s) + 1];
  ui.title.textContent = p.hatched ? `${p.name || 'Deine Katze'} · ${s.name}` : 'Eine Überraschung …';
  ui.mood.textContent = p.hatched ? `${p.name || 'Sie'} ${MOODS[mood(p)]}${next ? ` · noch ${Math.max(0, Math.ceil(next.xp - p.xp))} XP bis „${next.name}“` : ''}` : 'Da bewegt sich was in der Kiste!';
  ui.stats.replaceChildren(...[['🍽️ Satt', 100 - p.hunger], ['🧶 Spaß', p.fun], ['⚡ Energie', p.energy]].map(([l, v]) => { const row = el('div', 'pet-bar'); const b = el('b'); const fill = el('i'); fill.style.width = `${Math.round(v)}%`; b.append(fill); if (v < 30) row.classList.add('low'); row.append(el('span', '', l), b); return row; }));
  ui.root.querySelectorAll('[data-fur]').forEach((b) => b.classList.toggle('on', b.dataset.fur === p.fur));
}
function update(action, opts = {}, { now = false } = {}) {
  const before = ui.pet; ui.pet = act(ui.pet, action, opts);
  if (stageOf(before).key !== stageOf(ui.pet).key) { ui.cat = buildCat(ui.pet.fur, stageOf(ui.pet).key); ui.fx.evolve = performance.now(); meow(1.1, 0.8); deps.toast(`✨ ${ui.pet.name || 'Deine Katze'} ist gewachsen: ${stageOf(ui.pet).name}!`); now = true; }
  save(ui.pet, now); render();
}
function setMode(mode, data = {}) {
  const t = performance.now();
  ui.mode = mode; ui.modeAt = t; ui.data = data;
  if (mode !== 'idle') ui.root.querySelectorAll('.pet-sub').forEach((s) => { s.hidden = true; });
  ui.hint.textContent = { essen: '', ball: 'Wirf das Wollknäuel: auf die Fläche tippen oder wischen.', laser: 'Bewege den Laserpunkt mit dem Finger / der Maus.', streicheln: 'Streich mit dem Finger über den Kopf oder Rücken.' }[mode] || 'Tipp sie an oder streichel sie mit dem Finger.';
}
function wake() { if (asleep(ui.pet)) { update('aufwecken', {}, { now: true }); ui.event = { kind: 'yawn', until: performance.now() + 1600 }; meow(0.8, 0.5); } }

function feed(food) {
  wake();
  if (!FOODS[food]) food = 'trocken';
  if (ui.pet.hunger < 8) { deps.toast(`${ui.pet.name || 'Sie'} ist pappsatt.`); meow(1.2, 0.3); return; }
  setMode('essen', { food, amount: 1, bowlX: 1.4, startedAt: performance.now(), lastBite: 0 });
}
function play(kind) { wake(); if (ui.pet.energy < 12) { deps.toast(`${ui.pet.name || 'Sie'} ist zu müde zum Spielen.`); return; } setMode(kind === 'laser' ? 'laser' : 'ball', { auto: false }); }

function close() { if (!ui) return; ui.stop(); purr(0); clearTimeout(saveTimer); try { localStorage.setItem(KEY, JSON.stringify(ui.pet)); } catch { /* ignore */ } deps.send(summary(ui.pet)); ui.root.remove(); ui = null; }
if (typeof document !== 'undefined') document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'pet') close(); });

export function openPet(action = 'zeigen', opts = {}) {
  if (!ui) {
    document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'pet' }));
    const root = el('div', 'pet');
    root.innerHTML = `<div class="pet-card"><header><p class="pet-kicker">JARVIS · HOLO-KATZE</p><button type="button" class="pet-x" aria-label="Schließen">✕</button></header><h3 class="pet-title"></h3><p class="pet-mood"></p><div class="pet-stage"><canvas></canvas><p class="pet-hint"></p></div><div class="pet-stats"></div>
      <div class="pet-actions"><button type="button" data-open="food">🍽️ Füttern</button><button type="button" data-open="toys">🧶 Spielen</button><button type="button" data-a="streicheln">🤚 Streicheln</button></div>
      <div class="pet-sub" data-sub="food" hidden>${Object.entries(FOODS).map(([k, f]) => `<button type="button" data-food="${k}">${k === 'milch' ? '🥛' : k === 'fisch' ? '🐟' : '🥣'} ${f.name}</button>`).join('')}</div>
      <div class="pet-sub" data-sub="toys" hidden><button type="button" data-toy="ball">🧶 Wollknäuel</button><button type="button" data-toy="laser">🔴 Laserpunkt</button></div>
      <form class="pet-name"><input maxlength="20" placeholder="Name geben …" aria-label="Name"><button type="submit">OK</button></form>
      <div class="pet-fur">${Object.entries(FURS).map(([k, f]) => `<button type="button" data-fur="${k}" style="--c:${f.base};--c2:${f.belly}" title="${f.name}" aria-label="${f.name}"></button>`).join('')}<span>Fell</span></div></div>`;
    document.body.append(root);
    const q = (s) => root.querySelector(s);
    let pet = load(); const fresh = !pet; if (!pet) pet = newPet();
    const stage = q('.pet-stage'); const canvas = q('canvas');
    const W = Math.min(440, innerWidth - 50); const H = Math.round(W * 0.8);
    const ctx = fitCanvas(canvas, W, H);
    const scale = W / 440; // the cat is designed for 440 px
    ui = { root, pet, cat: buildCat(pet.fur, stageOf(pet).key), fx: {}, title: q('.pet-title'), mood: q('.pet-mood'), stats: q('.pet-stats'), hint: q('.pet-hint'), stop: () => {}, mode: 'idle', modeAt: 0, data: {}, event: null, pointer: null, trail: [], hearts: [], strokeDist: 0, lastStroke: 0 };
    const A = { lookX: 0, lookY: 0, eyesClosed: 0, pupil: 0.2, mouth: 0, tongue: 0, tongueX: 0, tilt: 0, headDx: 0, headDy: 0, pawL: 0, pawR: 0, crouch: 0, jumpY: 0, catX: 0, earBack: 0, twitchL: 0, twitchR: 0, tailAmp: 0.4, tailSpeed: 900, purr: 0, sleep: 0, wiggle: 0, whisker: 0, blink: 0 };
    const floorY = H / scale - 44;
    const Z = 1.25; // zoom around the floor centre so the cat fills the stage
    const XMIN = 220 - 220 / Z + 8; const XMAX = 220 + 220 / Z - 8; const REACH = 220 / Z - 70;
    const ball = { x: 330, y: floorY - 14, vx: 0, vy: 0, r: 14, rot: 0 };
    const dot = { x: 300, y: floorY - 60, still: 0 };
    let nextIdle = performance.now() + 2500; let introAt = fresh || !pet.hatched ? performance.now() : 0; let lastMeow = 0; let blinkAt = performance.now() + 2000;
    const local = (e) => { const r = canvas.getBoundingClientRect(); const sx = (e.clientX - r.left) / scale; const sy = (e.clientY - r.top) / scale; return { x: 220 + (sx - 220) / Z, y: floorY + (sy - floorY) / Z }; };
    let down = null; let geom = { cx: 220, hx: 220, hy: 100, base: floorY, headR: 60, bodyTop: 150 };
    const onCat = (p) => Math.hypot(p.x - geom.hx, p.y - (geom.hy + 55)) < geom.headR * 1.1 || (Math.abs(p.x - geom.cx) < 70 && p.y > geom.bodyTop - 10 && p.y < geom.base);
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId); const p = local(e); down = { ...p, t: performance.now(), sx: p.x, sy: p.y }; ui.pointer = { ...p, t: performance.now() };
      if (asleep(ui.pet)) { wake(); return; }
      if (ui.mode === 'laser' && !onCat(p)) { dot.x = p.x; dot.y = Math.min(floorY - 4, p.y); return; }
      if (ui.mode === 'ball' && !onCat(p)) return;
      if (onCat(p) && ui.mode !== 'essen') { if (ui.mode !== 'streicheln') setMode('streicheln'); ui.trail.push({ ...p, t: performance.now() }); }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = local(e); ui.pointer = { ...p, t: performance.now() };
      if (ui.mode === 'laser') { if (down || e.pointerType === 'mouse') { dot.x = p.x; dot.y = Math.min(floorY - 4, p.y); } return; }
      if (down && ui.mode === 'streicheln' && onCat(p)) {
        const last = ui.trail[ui.trail.length - 1]; const d = last ? Math.hypot(p.x - last.x, p.y - last.y) : 0;
        ui.trail.push({ ...p, t: performance.now() }); if (ui.trail.length > 40) ui.trail.shift();
        ui.strokeDist += d; ui.lastStroke = performance.now();
        if (ui.strokeDist > 140) { ui.strokeDist = 0; update('strich'); if (Math.random() < 0.5) ui.hearts.push({ x: p.x, y: p.y - 10, t: performance.now() }); }
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      const p = local(e);
      if (down && ui.mode === 'ball') { const dt = Math.max(60, performance.now() - down.t); const vx = (p.x - down.sx) / dt * 16; const vy = (p.y - down.sy) / dt * 16; if (Math.hypot(vx, vy) > 2) { ball.vx = vx; ball.vy = Math.min(-2, vy); } else { ball.x = p.x; ball.y = Math.min(floorY - ball.r, p.y); ball.vx = rnd(-4, 4); ball.vy = -6; } }
      down = null;
    });
    q('.pet-x').addEventListener('click', close);
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { const s = q(`[data-sub="${b.dataset.open}"]`); const was = !s.hidden; root.querySelectorAll('.pet-sub').forEach((x) => { x.hidden = true; }); s.hidden = was; }));
    root.querySelectorAll('[data-food]').forEach((b) => b.addEventListener('click', () => feed(b.dataset.food)));
    root.querySelectorAll('[data-toy]').forEach((b) => b.addEventListener('click', () => play(b.dataset.toy)));
    q('[data-a="streicheln"]').addEventListener('click', () => { wake(); setMode('streicheln', { auto: true, until: performance.now() + 5200 }); });
    root.querySelectorAll('[data-fur]').forEach((b) => b.addEventListener('click', () => { update('fell', { fur: b.dataset.fur }, { now: true }); ui.cat = buildCat(ui.pet.fur, stageOf(ui.pet).key); meow(1.15, 0.35); }));
    q('.pet-name').addEventListener('submit', (e) => { e.preventDefault(); const v = q('.pet-name input').value.trim(); if (v) { update('name', { name: v }, { now: true }); q('.pet-name input').value = ''; meow(1.2, 0.5); ui.event = { kind: 'happy', until: performance.now() + 1500 }; } });

    ui.stop = loop((t, dt) => {
      const k = Math.min(1, dt * 7); const k2 = Math.min(1, dt * 14);
      const p = ui.pet; const sleeping = asleep(p) && ui.mode === 'idle';
      const tgt = { lookX: 0, lookY: 0.1, eyesClosed: 0, pupil: 0.22, mouth: 0, tongue: 0, tilt: Math.sin(t / 2300) * 0.04, headDx: 0, headDy: 0, pawL: 0, pawR: 0, crouch: 0, earBack: 0, tailAmp: 0.35, tailSpeed: 1100, purr: 0, sleep: sleeping ? 1 : 0, wiggle: 0, whisker: 0, catX: A.catX * 0.98 };
      // look at the pointer when it is near
      if (ui.pointer && t - ui.pointer.t < 2500) { tgt.lookX = Math.max(-1, Math.min(1, (ui.pointer.x - geom.hx) / 140)); tgt.lookY = Math.max(-1, Math.min(1, (ui.pointer.y - geom.hy - 50) / 140)); }
      // blinking
      if (t > blinkAt) { A.blink = 1; blinkAt = t + rnd(2200, 5200); }
      A.blink = Math.max(0, A.blink - dt * 7);
      // intro: kitten climbs out of a box
      let intro = 0;
      if (introAt) {
        intro = (t - introAt) / 3200;
        if (intro >= 1) { introAt = 0; ui.pet = { ...ui.pet, hatched: true, last: Date.now() }; save(ui.pet, true); render(); meow(1.25, 0.7); ui.event = { kind: 'happy', until: t + 1600 }; }
      }
      if (sleeping) { tgt.eyesClosed = 1; tgt.headDy = 26; tgt.crouch = 0.55; tgt.tailAmp = 0.05; tgt.earBack = 0.15; tgt.tilt = 0.12; }
      else if (ui.mode === 'essen') {
        const d = ui.data; d.bowlX = lerp(d.bowlX, 0, Math.min(1, dt * 4));
        const el2 = (t - d.startedAt) / 1000;
        if (el2 > 0.8 && d.amount > 0) {
          tgt.headDy = 46; tgt.tilt = 0; tgt.eyesClosed = 0.4; tgt.lookY = 1; tgt.crouch = 0.25; tgt.earBack = 0.1;
          if (d.food === 'milch') { tgt.tongue = (Math.sin(t / 90) + 1) / 2; if (t - d.lastBite > 260) { d.lastBite = t; blip(rnd(800, 1100), 0.03, 0.03); } }
          else { tgt.mouth = (Math.sin(t / 110) + 1) * 0.3; if (t - d.lastBite > 380) { d.lastBite = t; crunch(); } }
          d.amount = Math.max(0, d.amount - dt / 4.5);
          if (d.amount <= 0) { d.doneAt = t; update('fuettern', { food: d.food }, { now: true }); }
        } else if (d.doneAt) { tgt.tongue = t - d.doneAt < 900 ? 1 : 0; A.tongueX = Math.sin(t / 120) * 6; tgt.eyesClosed = 0.6; if (t - d.doneAt > 1600) { d.bowlX = lerp(d.bowlX, 1.6, 0.2); if (t - d.doneAt > 2200) { setMode('idle'); meow(1.1, 0.45); ui.event = { kind: 'happy', until: t + 1200 }; } } }
        else tgt.lookY = 1;
      } else if (ui.mode === 'ball' || ui.mode === 'laser') {
        const target = ui.mode === 'ball' ? ball : dot;
        if (ui.data.auto && ui.mode === 'ball' && Math.hypot(ball.vx, ball.vy) < 0.3 && Math.random() < 0.02) { ball.vx = rnd(-7, 7); ball.vy = rnd(-9, -4); }
        if (ui.data.auto && ui.mode === 'laser') { dot.x = 220 + Math.sin(t / 700) * (REACH - 10) + Math.sin(t / 260) * 20; dot.y = floorY - 30 - Math.abs(Math.sin(t / 500)) * 80; }
        if (ui.mode === 'ball') { ball.vy += 0.45; ball.x += ball.vx; ball.y += ball.vy; ball.rot += ball.vx * 0.05; if (ball.y > floorY - ball.r) { ball.y = floorY - ball.r; ball.vy *= -0.45; ball.vx *= 0.92; if (Math.abs(ball.vy) < 1) ball.vy = 0; } if (ball.x < XMIN + ball.r) { ball.x = XMIN + ball.r; ball.vx *= -0.7; } if (ball.x > XMAX - ball.r) { ball.x = XMAX - ball.r; ball.vx *= -0.7; } }
        const tx = target.x - 220; const dx = tx - A.catX; const speed = ui.mode === 'ball' ? Math.hypot(ball.vx, ball.vy) : Math.hypot(dot.x - (dot.px ?? dot.x), dot.y - (dot.py ?? dot.y));
        dot.px = dot.x; dot.py = dot.y;
        tgt.lookX = Math.max(-1, Math.min(1, (target.x - geom.hx) / 110)); tgt.lookY = Math.max(-1, Math.min(1, (target.y - geom.hy - 50) / 110));
        tgt.pupil = 0.95; tgt.earBack = -0.05; tgt.tailAmp = 0.9; tgt.tailSpeed = 300; tgt.whisker = 0.6;
        const pc = ui.data.pounce;
        if (pc) {
          const f = Math.min(1, (t - pc.t) / 520); A.jumpY = Math.sin(f * Math.PI) * 70; A.catX = lerp(pc.from, pc.to, f); tgt.pawL = f > 0.4 ? 1 : 0; tgt.crouch = 0; tgt.headDy = -6;
          if (f >= 1) { ui.data.pounce = null; A.jumpY = 0; const hit = Math.abs(target.x - (220 + A.catX)) < 55 && target.y > floorY - 110; if (hit) { update('treffer'); noise(0.08, 700, 0.06); if (ui.mode === 'ball') { ball.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(5, 9); ball.vy = rnd(-9, -5); } else if (ui.data.auto) { dot.x = rnd(XMIN + 20, XMAX - 20); } ui.hearts.push({ x: target.x, y: target.y - 20, t, star: true }); } }
        } else {
          // stalk: follow slowly, crouch + wiggle when close and the toy is slow → pounce
          A.catX += Math.max(-1, Math.min(1, dx / 60)) * dt * 90;
          A.catX = Math.max(-REACH, Math.min(REACH, A.catX));
          const near = Math.abs(target.x - (220 + A.catX)) < 150 && target.y > floorY - 140;
          if (near && speed < 4) { ui.data.stalk = (ui.data.stalk || 0) + dt; tgt.crouch = 0.45; tgt.wiggle = Math.min(1, ui.data.stalk * 2); tgt.headDy = 12; }
          else ui.data.stalk = 0;
          if (ui.data.stalk > 0.7 && ui.pet.energy >= 8) { ui.data.pounce = { t, from: A.catX, to: Math.max(-REACH, Math.min(REACH, target.x - 220)) }; ui.data.stalk = 0; noise(0.15, 400, 0.05, 0.7); }
        }
        if (t - ui.modeAt > 45000 || ui.pet.energy < 8) { setMode('idle'); A.jumpY = 0; if (ui.pet.energy < 8) deps.toast(`${ui.pet.name || 'Sie'} ist erschöpft vom Spielen.`); }
      } else if (ui.mode === 'streicheln') {
        const strokingNow = t - ui.lastStroke < 600;
        let hand = null;
        if (ui.data.auto) {
          if (t > ui.data.until) { setMode('idle'); update('streicheln', {}, { now: true }); }
          else { const f = ((t - ui.modeAt) % 1400) / 1400; hand = { x: geom.hx - 40 + f * 110, y: geom.hy + 10 + f * 70, a: Math.sin(f * Math.PI) }; ui.lastStroke = t; if (Math.random() < 0.03) ui.hearts.push({ x: hand.x, y: hand.y - 20, t }); }
        }
        if (strokingNow || hand) { tgt.purr = 1; tgt.eyesClosed = 1; tgt.earBack = 0.2; tgt.tilt = ((hand ? hand.x : ui.pointer?.x || geom.hx) - geom.hx) / 300; tgt.headDy = 6; tgt.tailAmp = 0.15; tgt.tailSpeed = 1600; }
        else if (t - ui.lastStroke > 4000 && !ui.data.auto) setMode('idle');
        ui.data.hand = hand;
      } else {
        // idle life: random small events
        if (t > nextIdle && !intro) {
          const m = mood(ui.pet); const r = Math.random();
          const kind = m === 'hungrig' && t - lastMeow > 7000 ? 'meow' : r < 0.25 ? 'twitch' : r < 0.42 ? 'groom' : r < 0.55 ? 'yawn' : r < 0.75 ? 'look' : r < 0.85 ? 'meow' : 'stretch';
          ui.event = { kind, until: t + ({ groom: 2600, yawn: 1500, meow: 700, look: 1800, stretch: 1600, twitch: 400 }[kind]), side: Math.random() < 0.5 ? -1 : 1 };
          if (kind === 'meow') { lastMeow = t; meow(m === 'hungrig' ? 0.95 : 1.15, m === 'hungrig' ? 0.75 : 0.45); }
          nextIdle = t + rnd(3000, 7000);
        }
        if (mood(ui.pet) === 'muede') { tgt.eyesClosed = 0.5; tgt.earBack = 0.1; }
      }
      // events
      const ev = ui.event;
      if (ev && t < ev.until && ui.mode === 'idle' && !sleeping) {
        if (ev.kind === 'meow') { tgt.mouth = 0.8; tgt.eyesClosed = 0.2; tgt.headDy = -4; }
        if (ev.kind === 'yawn') { tgt.mouth = 1; tgt.eyesClosed = 1; tgt.earBack = 0.35; tgt.headDy = -6; tgt.tongue = 0.5; }
        if (ev.kind === 'groom') { tgt.pawL = 0.85; tgt.tongue = (Math.sin(t / 110) + 1) / 2; tgt.eyesClosed = 1; tgt.headDy = 10; tgt.tilt = -0.18; A.tongueX = -6; }
        if (ev.kind === 'look') { tgt.lookX = ev.side; tgt.tilt = ev.side * 0.12; }
        if (ev.kind === 'twitch') { if (ev.side < 0) A.twitchL = 0.5; else A.twitchR = 0.5; }
        if (ev.kind === 'stretch') { tgt.crouch = 0.4; tgt.pawL = 0.3; tgt.pawR = 0.3; tgt.eyesClosed = 0.8; tgt.mouth = 0.4; }
        if (ev.kind === 'happy') { tgt.eyesClosed = 1; tgt.tailAmp = 0.8; tgt.purr = 0.3; }
      }
      A.twitchL = Math.max(0, A.twitchL - dt * 2.5); A.twitchR = Math.max(0, A.twitchR - dt * 2.5);
      for (const key of ['lookX', 'lookY', 'mouth', 'tongue', 'tilt', 'headDx', 'headDy', 'crouch', 'earBack', 'tailAmp', 'tailSpeed', 'sleep', 'wiggle', 'whisker', 'pupil']) A[key] = lerp(A[key], tgt[key], key === 'mouth' || key === 'tongue' ? k2 : k);
      for (const key of ['pawL', 'pawR']) A[key] = lerp(A[key], tgt[key], k2);
      A.eyesClosed = lerp(A.eyesClosed, Math.max(tgt.eyesClosed, A.blink), k2);
      A.purr = lerp(A.purr, tgt.purr, Math.min(1, dt * 3));
      if (Math.abs((ui.lastPurr || 0) - A.purr) > 0.05) { ui.lastPurr = A.purr; purr(A.purr); }
      if (!ui.data?.pounce) A.jumpY = Math.max(0, A.jumpY - dt * 200);
      if (ui.mode === 'idle' || ui.mode === 'streicheln' || ui.mode === 'essen') A.catX = lerp(A.catX, 0, Math.min(1, dt * 1.5));

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);
      ctx.save(); ctx.scale(scale, scale); ctx.translate(220, floorY); ctx.scale(Z, Z); ctx.translate(-220, -floorY);
      // room: holo floor grid + soft light
      const bg = ctx.createRadialGradient(220, floorY - 120, 10, 220, floorY - 60, 320); bg.addColorStop(0, sleeping ? 'rgba(80, 20, 40, 0.35)' : 'rgba(255, 60, 80, 0.16)'); bg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 440, H / scale);
      ctx.strokeStyle = 'rgba(255, 42, 61, 0.12)'; ctx.lineWidth = 1; for (let i = -10; i <= 10; i += 1) { ctx.beginPath(); ctx.moveTo(220 + i * 18, floorY); ctx.lineTo(220 + i * 60, H / scale + 40); ctx.stroke(); } for (let j = 0; j < 4; j += 1) { const yy = floorY + j * j * 6 + j * 4; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(440, yy); ctx.stroke(); }
      if (introAt && intro < 1) {
        // box + kitten rising out of it
        const rise = Math.max(0, Math.min(1, (intro - 0.15) / 0.5)); const hop = intro > 0.72 ? Math.sin((intro - 0.72) / 0.28 * Math.PI) * 60 : 0;
        const boxY = floorY - 70; const boxAlpha = intro > 0.8 ? 1 - (intro - 0.8) / 0.2 : 1;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 440, intro > 0.72 ? H / scale : boxY + 2); ctx.clip();
        A.jumpY = (1 - rise) * -140 + hop; A.lookX = Math.sin(t / 500) * 0.6; A.eyesClosed = A.blink;
        geom = drawCat(ctx, ui.cat, A, 220, floorY, t);
        ctx.restore();
        if (intro > 0.08 && intro < 0.5) { const wob = Math.sin(t / 40) * 3; ctx.translate(wob, 0); }
        ctx.globalAlpha = boxAlpha; const bxg = ctx.createLinearGradient(0, boxY, 0, floorY); bxg.addColorStop(0, '#b98a52'); bxg.addColorStop(1, '#7a5530'); ctx.fillStyle = bxg; ctx.fillRect(130, boxY, 180, 70); ctx.fillStyle = '#a4763f'; ctx.beginPath(); ctx.moveTo(130, boxY); ctx.lineTo(100, boxY - 24); ctx.lineTo(160, boxY - 22); ctx.lineTo(180, boxY); ctx.fill(); ctx.beginPath(); ctx.moveTo(310, boxY); ctx.lineTo(340, boxY - 24); ctx.lineTo(280, boxY - 22); ctx.lineTo(260, boxY); ctx.fill(); ctx.strokeStyle = 'rgba(60,35,15,0.5)'; ctx.beginPath(); ctx.moveTo(220, boxY); ctx.lineTo(220, floorY); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 13px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♥ FÜR DICH ♥', 220, boxY + 40); ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(perf.dpr, perf.dpr); ctx.scale(scale, scale); ctx.translate(220, floorY); ctx.scale(Z, Z); ctx.translate(-220, -floorY);
      } else {
        geom = drawCat(ctx, ui.cat, A, 220, floorY, t);
        if (ui.mode === 'essen') drawBowl(ctx, 220 + A.catX + ui.data.bowlX * 260, floorY + 4, ui.data.food, ui.data.amount); // bowl in front of the paws
        if (ui.mode === 'ball') drawYarn(ctx, ball, t);
        if (ui.mode === 'laser') drawLaser(ctx, dot, t);
        if (ui.data?.hand) drawHand(ctx, ui.data.hand.x, ui.data.hand.y, 0.85);
      }
      // stroke trail (fur shine where you pet)
      ui.trail = ui.trail.filter((p) => t - p.t < 500);
      for (let i = 1; i < ui.trail.length; i += 1) { const a1 = ui.trail[i - 1]; const b1 = ui.trail[i]; ctx.strokeStyle = `rgba(255, 230, 235, ${0.5 * (1 - (t - b1.t) / 500)})`; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke(); }
      ui.hearts = ui.hearts.filter((h) => t - h.t < 1400);
      for (const h of ui.hearts) { const f = (t - h.t) / 1400; ctx.globalAlpha = 1 - f; ctx.fillStyle = h.star ? '#ffd27a' : '#ff5c6c'; ctx.font = `${16 + f * 8}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(h.star ? '★' : '♥', h.x + Math.sin(f * 6) * 6, h.y - f * 60); }
      ctx.globalAlpha = 1;
      if (sleeping) { ctx.fillStyle = 'rgba(255, 208, 212, 0.9)'; ctx.font = 'bold 18px Inter, sans-serif'; for (let i = 0; i < 3; i += 1) { const f = ((t / 1800 + i / 3) % 1); ctx.globalAlpha = 1 - f; ctx.fillText('z', geom.hx + 60 + f * 30, geom.hy + 10 - f * 50); } ctx.globalAlpha = 1; }
      if (ui.fx.evolve && t - ui.fx.evolve < 1200) { const f = (t - ui.fx.evolve) / 1200; ctx.strokeStyle = `rgba(255, 220, 225, ${1 - f})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(geom.hx, geom.hy + 80, 60 + f * 160, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    });
    setMode('idle'); render();
    if (fresh) save(pet, true);
  }
  const startAt = ui.pet.hatched ? 150 : 3500;
  if (action === 'fuettern') setTimeout(() => ui && feed(opts.food || 'trocken'), startAt);
  else if (action === 'spielen') setTimeout(() => { if (ui) { play(opts.toy || 'ball'); if (ui.mode === 'ball' || ui.mode === 'laser') ui.data.auto = true; } }, startAt);
  else if (action === 'streicheln') setTimeout(() => { if (ui) { wake(); setMode('streicheln', { auto: true, until: performance.now() + 5200 }); } }, startAt);
  else if (action === 'name' && opts.name) setTimeout(() => { if (ui) { update('name', { name: opts.name }, { now: true }); meow(1.2, 0.5); ui.event = { kind: 'happy', until: performance.now() + 1500 }; } }, startAt);
  else if (action === 'aufwecken') setTimeout(() => ui && wake(), startAt);
  else if (action === 'schlafen') setTimeout(() => { if (ui) { update('schlafen', {}, { now: true }); } }, startAt);
}
export function initPet(options) { deps = { ...deps, ...options }; }
