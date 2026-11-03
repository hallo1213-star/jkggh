// Holo-Haustier: a small holographic robot that lives in Jarvis (stored on this
// device). It hatches from an egg, grows with care (baby → kid → grown-up),
// gets hungry and bored over time, sleeps at night (22–7 Uhr) and reacts to
// feeding, playing and petting. Jarvis knows its real state (pet_state).
import { fitCanvas, loop, perf } from './cae/perf.js';

const KEY = 'jarvis.pet';
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
let deps = { send: () => {}, toast: () => {} };
let ui = null;

let audio = null;
function tone(f, d, type = 'sine', v = 0.06, to = f, delay = 0) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); const t = audio.currentTime + delay; const o = audio.createOscillator(); const g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.05); } catch { /* no audio */ } }
const chirp = () => { tone(880, 0.08, 'triangle', 0.06, 1320); tone(1320, 0.1, 'triangle', 0.05, 990, 0.09); };

// ---------------------------------------------------------------------------
// State (pure, testable)
// ---------------------------------------------------------------------------
export const STAGES = [{ key: 'baby', name: 'Baby', xp: 0 }, { key: 'kind', name: 'Kind', xp: 60 }, { key: 'gross', name: 'Groß', xp: 180 }];
export const isNight = (d = new Date()) => d.getHours() >= 22 || d.getHours() < 7;
export function newPet(now = Date.now()) { return { name: '', born: now, hatched: false, xp: 0, hunger: 20, fun: 80, energy: 90, last: now, wokeAt: 0 }; }
export function stageOf(p) { return [...STAGES].reverse().find((s) => p.xp >= s.xp) || STAGES[0]; }
// time passes: hungry +1 every 12 min, fun −1 every 15 min; sleeping refills energy
export function tick(p, now = Date.now()) {
  const min = Math.max(0, (now - p.last) / 60000);
  const asleep = isNight(new Date(now)) && now - (p.wokeAt || 0) > 30 * 60000;
  return { ...p, hunger: clamp(p.hunger + min / 12), fun: clamp(p.fun - min / 15), energy: clamp(p.energy + (asleep ? min / 4 : -min / 30)), last: now };
}
export function act(p, action, { name = '', now = Date.now() } = {}) {
  const q = tick(p, now);
  if (action === 'fuettern') return { ...q, hunger: clamp(q.hunger - 35), xp: q.xp + (q.hunger > 15 ? 8 : 2) };
  if (action === 'spielen') return q.energy < 15 ? q : { ...q, fun: clamp(q.fun + 30), energy: clamp(q.energy - 12), hunger: clamp(q.hunger + 5), xp: q.xp + 10 };
  if (action === 'streicheln') return { ...q, fun: clamp(q.fun + 12), xp: q.xp + 4 };
  if (action === 'aufwecken') return { ...q, wokeAt: now };
  if (action === 'schlafen') return { ...q, wokeAt: 0, energy: clamp(q.energy + 10) };
  if (action === 'name' && name) return { ...q, name: String(name).replace(/[<>]/g, '').trim().slice(0, 20) };
  return q;
}
export function mood(p, now = Date.now()) {
  if (isNight(new Date(now)) && now - (p.wokeAt || 0) > 30 * 60000) return 'schlaeft';
  if (p.hunger >= 70) return 'hungrig';
  if (p.energy <= 15) return 'muede';
  if (p.fun <= 30) return 'langweilig';
  return 'gluecklich';
}
const MOODS = { schlaeft: 'schläft 💤', hungrig: 'hat Hunger', muede: 'ist müde', langweilig: 'langweilt sich', gluecklich: 'ist glücklich' };
export function summary(p, now = Date.now()) {
  const s = stageOf(p); const next = STAGES[STAGES.indexOf(s) + 1];
  return { type: 'pet_state', exists: true, hatched: p.hatched, name: p.name || null, stufe: s.name, xp: p.xp, naechsteStufeBei: next ? next.xp : null, hunger: p.hunger, spass: p.fun, energie: p.energy, stimmung: MOODS[mood(p, now)], tage: Math.floor((now - p.born) / 86400000) };
}

function load() { try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); return p && p.born ? tick(p) : null; } catch { return null; } }
function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } deps.send(summary(p)); }
export function petState() { const p = load(); return p ? summary(p) : { type: 'pet_state', exists: false }; }

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawPet(ctx, W, H, t, p, fx) {
  const st = stageOf(p).key; const m = mood(p);
  const scale = st === 'baby' ? 0.72 : st === 'kind' ? 0.88 : 1.05;
  const cx = W / 2; const base = H * 0.62;
  const sleeping = m === 'schlaeft';
  const bob = sleeping ? Math.sin(t / 900) * 2 : Math.sin(t / 380) * 6 - (fx.jump || 0);
  const r = Math.min(W, H) * 0.23 * scale;
  const cy = base - r + bob;
  // holo floor
  const fl = ctx.createRadialGradient(cx, base + 6, 2, cx, base + 6, r * 1.8);
  fl.addColorStop(0, 'rgba(255, 42, 61, 0.45)'); fl.addColorStop(1, 'rgba(255, 42, 61, 0)');
  ctx.fillStyle = fl; ctx.beginPath(); ctx.ellipse(cx, base + 8, r * 1.7, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.globalAlpha = sleeping ? 0.75 : 1;
  // antenna (grows with stage)
  if (st !== 'baby') {
    ctx.strokeStyle = '#ff8a95'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.95); ctx.quadraticCurveTo(cx + 6, cy - r * 1.35, cx + Math.sin(t / 300) * 6, cy - r * 1.55); ctx.stroke();
    const tip = ctx.createRadialGradient(cx + Math.sin(t / 300) * 6, cy - r * 1.55, 0, cx + Math.sin(t / 300) * 6, cy - r * 1.55, 9);
    tip.addColorStop(0, '#fff'); tip.addColorStop(0.4, '#ff5c6c'); tip.addColorStop(1, 'rgba(255,92,108,0)'); ctx.fillStyle = tip; ctx.beginPath(); ctx.arc(cx + Math.sin(t / 300) * 6, cy - r * 1.55, 9, 0, Math.PI * 2); ctx.fill();
  }
  // arms (grown-up)
  if (st === 'gross') { ctx.strokeStyle = 'rgba(255, 92, 108, 0.85)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; const wave = fx.play ? Math.sin(t / 90) * 0.6 : Math.sin(t / 700) * 0.15; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * r * 0.85, cy + r * 0.1); ctx.lineTo(cx + s * r * 1.35, cy - r * (0.1 + (s > 0 ? wave : 0.1))); ctx.stroke(); } }
  // body
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
  g.addColorStop(0, 'rgba(255, 200, 205, 0.95)'); g.addColorStop(0.35, 'rgba(255, 70, 90, 0.85)'); g.addColorStop(1, 'rgba(90, 0, 15, 0.9)');
  ctx.fillStyle = g; ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.ellipse(cx, cy, r, r * (0.95 + Math.sin(t / 380) * 0.03), 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  // scan lines (hologram)
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'; for (let y = cy - r + ((t / 40) % 6); y < cy + r; y += 6) ctx.fillRect(cx - r, y, r * 2, 1.5);
  ctx.restore();
  // face screen
  ctx.fillStyle = 'rgba(15, 1, 4, 0.85)'; ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.05, r * 0.66, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  const blink = !sleeping && (t % 4200) < 140;
  ctx.fillStyle = '#ffe3e6'; ctx.strokeStyle = '#ffe3e6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = cx + s * r * 0.27; const ey = cy - r * 0.1;
    if (sleeping || blink || m === 'muede') { ctx.beginPath(); ctx.moveTo(ex - r * 0.1, ey); ctx.lineTo(ex + r * 0.1, ey); ctx.stroke(); }
    else if (fx.love || m === 'gluecklich' && fx.pet) { ctx.font = `${r * 0.32}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♥', ex, ey); }
    else { ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.08, r * (m === 'hungrig' ? 0.07 : 0.11), 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // mouth
  ctx.beginPath();
  const my = cy + r * 0.14;
  if (fx.eat) { ctx.ellipse(cx, my, r * 0.09, r * 0.07 * (1 + Math.sin(t / 70)), 0, 0, Math.PI * 2); ctx.fill(); }
  else if (m === 'hungrig' || m === 'langweilig') { ctx.moveTo(cx - r * 0.12, my + 4); ctx.quadraticCurveTo(cx, my - 4, cx + r * 0.12, my + 4); ctx.stroke(); }
  else if (!sleeping) { ctx.moveTo(cx - r * 0.13, my); ctx.quadraticCurveTo(cx, my + r * 0.12, cx + r * 0.13, my); ctx.stroke(); }
  ctx.restore();
  // Zzz
  if (sleeping) { ctx.fillStyle = 'rgba(255, 208, 212, 0.9)'; ctx.font = 'bold 18px Inter, sans-serif'; for (let i = 0; i < 3; i += 1) { const k = ((t / 1600 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.fillText('Z', cx + r * 0.7 + k * 30, cy - r * 0.6 - k * 50 - i * 4); } ctx.globalAlpha = 1; }
  return { cx, cy, r };
}

function drawEgg(ctx, W, H, t, crack) {
  const cx = W / 2; const cy = H * 0.5; const r = Math.min(W, H) * 0.22;
  const wob = crack > 0 ? Math.sin(t / 40) * crack * 0.15 : Math.sin(t / 600) * 0.04;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(wob);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.5, 2, 0, 0, r * 1.4); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ff8a95'); g.addColorStop(1, '#5a0010');
  ctx.fillStyle = g; ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 40; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  if (crack > 0.2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.05); for (let i = 0; i < 7; i += 1) ctx.lineTo(-r * 0.7 + i * r * 0.23, (i % 2 ? -1 : 1) * r * 0.12 * crack); ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function bars(p) { return [['🍖 Satt', 100 - p.hunger], ['🎾 Spaß', p.fun], ['⚡ Energie', p.energy]]; }
function render() {
  if (!ui) return;
  const p = ui.pet; const s = stageOf(p); const next = STAGES[STAGES.indexOf(s) + 1];
  ui.title.textContent = p.hatched ? `${p.name || 'Dein Haustier'} · ${s.name}` : 'Ein Ei …';
  ui.mood.textContent = p.hatched ? `${p.name || 'Es'} ${MOODS[mood(p)]}${next ? ` · noch ${next.xp - p.xp} XP bis „${next.name}“` : ' · voll ausgewachsen'}` : 'Gleich schlüpft es!';
  ui.stats.replaceChildren(...bars(p).map(([l, v]) => { const row = el('div', 'pet-bar'); const fill = el('i'); fill.style.width = `${clamp(v)}%`; if (v < 30) row.classList.add('low'); row.append(el('span', '', l), el('b'), fill); row.querySelector('b').append(fill); return row; }));
}
function doAction(action, opts = {}) {
  if (!ui) return;
  const before = ui.pet;
  if (!before.hatched) return;
  if (action === 'spielen' && before.energy < 15 && mood(before) !== 'schlaeft') { deps.toast(`${before.name || 'Es'} ist zu müde zum Spielen.`); return; }
  if (mood(before) === 'schlaeft' && !['aufwecken', 'name'].includes(action)) { ui.pet = act(before, 'aufwecken'); tone(300, 0.3, 'sine', 0.05, 200); }
  ui.pet = act(ui.pet, action, opts);
  const st0 = stageOf(before).key; const st1 = stageOf(ui.pet).key;
  const now = performance.now();
  if (action === 'fuettern') { ui.fx.eat = now + 1600; ui.fx.food = now; tone(520, 0.08, 'square', 0.04, 700); tone(700, 0.08, 'square', 0.04, 900, 0.3); }
  if (action === 'spielen') { ui.fx.play = now + 2400; ui.fx.ball = now; chirp(); }
  if (action === 'streicheln') { ui.fx.pet = now + 1800; ui.fx.hearts = now; tone(660, 0.25, 'sine', 0.05, 880); }
  if (action === 'name') { ui.fx.love = now + 1500; chirp(); }
  if (st1 !== st0) { ui.fx.evolve = now; tone(400, 0.9, 'sawtooth', 0.06, 1600); deps.toast(`✨ ${ui.pet.name || 'Dein Haustier'} ist gewachsen: ${stageOf(ui.pet).name}!`); }
  save(ui.pet); render();
}
function close() { ui?.stop(); ui?.root.remove(); ui = null; }
if (typeof document !== 'undefined') document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'pet') close(); });

export function openPet(action = 'zeigen', opts = {}) {
  if (!ui) {
    document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'pet' }));
    const root = el('div', 'pet');
    root.innerHTML = '<div class="pet-card"><header><p class="pet-kicker">JARVIS · HOLO-HAUSTIER</p><button type="button" class="pet-x" aria-label="Schließen">✕</button></header><h3 class="pet-title"></h3><p class="pet-mood"></p><div class="pet-stage"><canvas></canvas></div><div class="pet-stats"></div><div class="pet-actions"><button type="button" data-a="fuettern">🍖 Füttern</button><button type="button" data-a="spielen">🎾 Spielen</button><button type="button" data-a="streicheln">🤚 Streicheln</button></div><form class="pet-name"><input maxlength="20" placeholder="Name geben …" aria-label="Name"><button type="submit">OK</button></form></div>';
    document.body.append(root);
    const q = (s) => root.querySelector(s);
    let pet = load();
    const fresh = !pet;
    if (!pet) pet = newPet();
    const stage = q('.pet-stage'); const canvas = q('canvas');
    const W = Math.min(420, innerWidth - 56); const H = Math.round(W * 0.72);
    const ctx = fitCanvas(canvas, W, H);
    ui = { root, pet, fx: {}, title: q('.pet-title'), mood: q('.pet-mood'), stats: q('.pet-stats'), stop: () => {} };
    q('.pet-x').addEventListener('click', close);
    root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => doAction(b.dataset.a)));
    q('.pet-name').addEventListener('submit', (e) => { e.preventDefault(); const v = q('.pet-name input').value.trim(); if (v) { doAction('name', { name: v }); q('.pet-name input').value = ''; } });
    stage.addEventListener('pointerdown', () => doAction('streicheln'));
    const hatchStart = performance.now() + (fresh || !pet.hatched ? 400 : -1e9);
    const particles = [];
    ui.stop = loop((t) => {
      ctx.clearRect(0, 0, W, H);
      const p = ui.pet;
      if (!p.hatched) {
        const k = (t - hatchStart) / 2600;
        if (k < 1) { drawEgg(ctx, W, H, t, Math.max(0, k)); if (k > 0.4 && Math.random() < 0.2) tone(1200 + Math.random() * 600, 0.03, 'square', 0.02); return; }
        ui.pet = { ...p, hatched: true, last: Date.now() }; save(ui.pet); render();
        ui.fx.evolve = t; tone(500, 0.5, 'triangle', 0.08, 1500); chirp();
        for (let i = 0; i < (perf.tier === 'high' ? 60 : 30); i += 1) particles.push({ x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.8) * 7, life: 1, c: '255, 220, 225' });
      }
      const fx = { eat: ui.fx.eat > t, play: ui.fx.play > t, pet: ui.fx.pet > t, love: ui.fx.love > t, jump: ui.fx.play > t ? Math.abs(Math.sin(t / 160)) * 26 : 0 };
      const body = drawPet(ctx, W, H, t, ui.pet, fx);
      // food orb flies into the mouth
      if (ui.fx.food && t - ui.fx.food < 700) { const k = (t - ui.fx.food) / 700; const x = W * 0.12 + (body.cx - W * 0.12) * k; const y = H * 0.15 + (body.cy + body.r * 0.14 - H * 0.15) * k - Math.sin(k * Math.PI) * 40; const g = ctx.createRadialGradient(x, y, 0, x, y, 12); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#ffb347'); g.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); }
      // ball bounces while playing
      if (fx.play) { const k = ((t - ui.fx.ball) % 900) / 900; const x = body.cx + Math.cos(t / 300) * body.r * 1.8; const y = H * 0.66 - Math.abs(Math.sin(k * Math.PI)) * H * 0.35; ctx.fillStyle = '#ff5c6c'; ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
      // hearts when petted
      if (ui.fx.hearts && t - ui.fx.hearts < 1600) { const k = (t - ui.fx.hearts) / 1600; ctx.fillStyle = `rgba(255, 92, 108, ${1 - k})`; ctx.font = '20px sans-serif'; for (let i = 0; i < 3; i += 1) ctx.fillText('♥', body.cx - 30 + i * 28, body.cy - body.r - k * 60 - i * 6); }
      // evolution flash
      if (ui.fx.evolve && t - ui.fx.evolve < 900) { const k = (t - ui.fx.evolve) / 900; ctx.strokeStyle = `rgba(255, 220, 225, ${1 - k})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(body.cx, body.cy, body.r * (1 + k * 2), 0, Math.PI * 2); ctx.stroke(); }
      for (let i = particles.length - 1; i >= 0; i -= 1) { const pt = particles[i]; pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life -= 0.02; if (pt.life <= 0) { particles.splice(i, 1); continue; } ctx.fillStyle = `rgba(${pt.c}, ${pt.life})`; ctx.fillRect(pt.x, pt.y, 3, 3); }
    });
    render();
    if (fresh) save(pet);
  }
  if (action && action !== 'zeigen') setTimeout(() => doAction(action, opts), ui.pet.hatched ? 200 : 3200);
}
export function initPet(options) { deps = { ...deps, ...options }; }
