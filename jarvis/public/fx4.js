// Feuerwerk, Schwerkraft-Modus, Schwarzes Loch, Zeitkapsel, GPS-Schatzsuche.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let deps = { toast: () => {} };
const closeOthers = (me) => document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: me }));

let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); return audio; }
function tone(f, dur, type = 'sine', vol = 0.1, delay = 0, to = f) { try { const a = ac(); const t = a.currentTime + delay; const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ } }
function boom(vol = 0.5, freq = 900, dur = 1.2) { try { const a = ac(); const len = Math.floor(a.sampleRate * dur); const b = a.createBuffer(1, len, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; const s = a.createBufferSource(); const f = a.createBiquadFilter(); const g = a.createGain(); f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(); } catch { /* no audio */ } }

// =========================================================================================
// Feuerwerk – rockets, bursts, finale writes a name with sparks
// =========================================================================================
let fw = null;
function fireworks(text = '') {
  if (fw) return;
  closeOthers('fireworks');
  const root = el('div', 'fw');
  const c = el('canvas'); const x = el('button', 'fw-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Feuerwerk beenden');
  root.append(c, x); document.body.append(root);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = (c.width = innerWidth * dpr); const H = (c.height = innerHeight * dpr);
  const ctx = c.getContext('2d');
  const COLORS = [[255, 42, 61], [255, 190, 90], [255, 240, 235], [255, 110, 80]];
  const rockets = []; const sparks = []; let raf = 0; const t0 = performance.now(); let finale = false;
  const launch = (tx, ty, col, onBurst) => { rockets.push({ x: tx + (Math.random() - 0.5) * 80 * dpr, y: H, tx, ty, col, onBurst, t: performance.now() }); tone(500, 0.9, 'sine', 0.04, 0, 1800); };
  const burst = (bx, by, col, n = 110) => {
    boom(0.45, 700 + Math.random() * 600);
    for (let i = 0; i < n; i += 1) { const a = Math.random() * Math.PI * 2; const sp = (2 + Math.random() * 5) * dpr; sparks.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, col: Math.random() < 0.2 ? COLORS[2] : col, decay: 0.008 + Math.random() * 0.01 }); }
  };
  const schedule = [];
  for (let i = 0; i < 9; i += 1) schedule.push({ at: 300 + i * 650 + Math.random() * 300, fn: () => launch(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.3), COLORS[i % 4], (bx, by, col) => burst(bx, by, col)) });
  const word = String(text || '').trim().toUpperCase().slice(0, 14);
  if (word) {
    schedule.push({ at: 6800, fn: () => {
      finale = true;
      // sample the text as target points
      const off = document.createElement('canvas'); const fs = Math.min(W / (word.length * 0.62), H * 0.22);
      off.width = W; off.height = Math.ceil(fs * 1.4); const o = off.getContext('2d');
      o.fillStyle = '#fff'; o.font = `900 ${fs}px Inter, sans-serif`; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(word, W / 2, off.height / 2);
      const data = o.getImageData(0, 0, off.width, off.height).data; const pts = []; const step = Math.max(4, Math.round(fs / 16));
      for (let y = 0; y < off.height; y += step) for (let xx = 0; xx < off.width; xx += step) if (data[(y * off.width + xx) * 4 + 3] > 128) pts.push([xx, y + H * 0.3 - off.height / 2]);
      launch(W / 2, H * 0.3, COLORS[0], (bx, by) => {
        boom(0.8, 500, 1.8);
        for (const [px, py] of pts) sparks.push({ x: bx, y: by, tx: px, ty: py, k: 0, life: 1, hold: 2.6 + Math.random() * 0.5, col: Math.random() < 0.3 ? COLORS[1] : COLORS[0], text: true, decay: 0.004 });
      });
    } });
  }
  const end = word ? 12500 : 8200;
  const stop = () => { cancelAnimationFrame(raf); root.classList.add('out'); setTimeout(() => root.remove(), 600); fw = null; };
  x.addEventListener('click', stop);
  fw = { stop };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const t = now - t0;
    while (schedule.length && schedule[0].at <= t) schedule.shift().fn();
    schedule.sort((a, b) => a.at - b.at);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
      const r = rockets[i]; const k = Math.min(1, (now - r.t) / 900); const e = 1 - (1 - k) ** 2;
      const px = r.x + (r.tx - r.x) * e; const py = H + (r.ty - H) * e;
      ctx.fillStyle = 'rgba(255, 220, 200, 0.9)'; ctx.beginPath(); ctx.arc(px, py, 2.5 * dpr, 0, Math.PI * 2); ctx.fill();
      for (let j = 0; j < 3; j += 1) sparks.push({ x: px, y: py, vx: (Math.random() - 0.5) * dpr, vy: Math.random() * 2 * dpr, life: 0.6, col: COLORS[1], decay: 0.04 });
      if (k >= 1) { rockets.splice(i, 1); r.onBurst(px, py, r.col); }
    }
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      if (s.text) {
        s.k = Math.min(1, s.k + 0.02); const e = 1 - (1 - s.k) ** 3;
        const px = s.x + (s.tx - s.x) * e; const py = s.y + (s.ty - s.y) * e;
        if (s.k >= 1) { s.hold -= 1 / 60; if (s.hold < 0) { s.text = false; s.x = px; s.y = py; s.vx = (Math.random() - 0.5) * dpr; s.vy = 0; s.decay = 0.015; } }
        const tw = 0.6 + Math.random() * 0.4;
        ctx.fillStyle = `rgba(${s.col[0]}, ${s.col[1]}, ${s.col[2]}, ${tw})`; ctx.fillRect(px - 1.5 * dpr, py - 1.5 * dpr, 3 * dpr, 3 * dpr);
        continue;
      }
      s.vy += 0.06 * dpr; s.vx *= 0.985; s.vy *= 0.985; s.x += s.vx; s.y += s.vy; s.life -= s.decay;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(${s.col[0]}, ${s.col[1]}, ${s.col[2]}, ${s.life})`; ctx.fillRect(s.x, s.y, 2.2 * dpr, 2.2 * dpr);
    }
    if (t > end && !rockets.length && sparks.length < 5) stop();
  };
  raf = requestAnimationFrame(frame);
  return finale;
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'fireworks') fw?.stop(); });

// =========================================================================================
// Schwerkraft – the real interface elements fall, bounce and can be thrown
// =========================================================================================
const GRAV_SEL = ['.brand', '#film-tabs', '.topbar-right', '.film-head', '#transcript .msg', '.composer', '.film-side-tabs', '.hud-step', '.hud-result', '.hud-quote', '.reactor-wrap', '.status-line', '.film-hint', '.controls', '.level-badge'];
let grav = null;
function gravityOn() {
  if (grav) return;
  const els = [...document.querySelectorAll(GRAV_SEL.join(','))].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight; });
  if (!els.length) return;
  document.body.classList.add('gravity-on');
  tone(300, 0.6, 'sine', 0.1, 0, 60);
  const bodies = els.map((e) => { const r = e.getBoundingClientRect(); e.style.transition = 'none'; e.style.willChange = 'transform'; return { e, x0: r.left, y0: r.top, w: r.width, h: r.height, dx: 0, dy: 0, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, rot: 0, vr: (Math.random() - 0.5) * 2, drag: null }; });
  let raf = 0; let last = performance.now();
  const onDown = (ev) => {
    const b = bodies.find((q) => q.e.contains(ev.target));
    if (!b) return;
    ev.preventDefault();
    b.drag = { px: ev.clientX, py: ev.clientY, vx: 0, vy: 0, t: performance.now() };
  };
  const onMove = (ev) => { for (const b of bodies) if (b.drag) { const now = performance.now(); const dt = Math.max(1, now - b.drag.t); b.drag.vx = ((ev.clientX - b.drag.px) / dt) * 16; b.drag.vy = ((ev.clientY - b.drag.py) / dt) * 16; b.dx += ev.clientX - b.drag.px; b.dy += ev.clientY - b.drag.py; b.drag.px = ev.clientX; b.drag.py = ev.clientY; b.drag.t = now; } };
  const onUp = () => { for (const b of bodies) if (b.drag) { b.vx = b.drag.vx; b.vy = b.drag.vy; b.vr = b.vx * 0.3; b.drag = null; } };
  addEventListener('pointerdown', onDown, true); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
  const block = (ev) => { if (bodies.some((q) => q.e.contains(ev.target))) { ev.preventDefault(); ev.stopPropagation(); } };
  addEventListener('click', block, true);
  const step = (now) => {
    raf = requestAnimationFrame(step);
    const dt = Math.min(2, (now - last) / 16.7); last = now;
    for (const b of bodies) {
      if (b.drag) continue;
      b.vy += 0.6 * dt; b.dx += b.vx * dt; b.dy += b.vy * dt; b.rot += b.vr * dt;
      const left = b.x0 + b.dx; const top = b.y0 + b.dy;
      if (top + b.h > innerHeight) { b.dy = innerHeight - b.h - b.y0; if (Math.abs(b.vy) > 4) tone(120 + Math.random() * 80, 0.08, 'triangle', 0.05); b.vy *= -0.45; b.vx *= 0.8; b.vr *= 0.6; }
      if (left < 0) { b.dx = -b.x0; b.vx *= -0.6; }
      if (left + b.w > innerWidth) { b.dx = innerWidth - b.w - b.x0; b.vx *= -0.6; }
      b.rot = Math.max(-25, Math.min(25, b.rot)); b.vr *= 0.97;
    }
    // simple stacking: push overlapping boxes apart
    for (let i = 0; i < bodies.length; i += 1) for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i]; const b = bodies[j];
      const ax = a.x0 + a.dx; const ay = a.y0 + a.dy; const bx = b.x0 + b.dx; const by = b.y0 + b.dy;
      const ox = Math.min(ax + a.w, bx + b.w) - Math.max(ax, bx); const oy = Math.min(ay + a.h, by + b.h) - Math.max(ay, by);
      if (ox > 0 && oy > 0) {
        if (oy < ox) { const up = ay < by ? a : b; const down = up === a ? b : a; if (!up.drag) { up.dy -= oy; up.vy = Math.min(up.vy, 0) * 0.3; } else if (!down.drag) down.dy += oy; }
        else { const l = ax < bx ? a : b; const r = l === a ? b : a; if (!l.drag) l.dx -= ox / 2; if (!r.drag) r.dx += ox / 2; l.vx *= 0.5; r.vx *= 0.5; }
      }
    }
    for (const b of bodies) b.e.style.transform = `translate(${b.dx}px, ${b.dy}px) rotate(${b.rot}deg)`;
  };
  raf = requestAnimationFrame(step);
  grav = { stop: () => {
    cancelAnimationFrame(raf);
    removeEventListener('pointerdown', onDown, true); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('click', block, true);
    tone(200, 0.8, 'sine', 0.1, 0, 900);
    bodies.forEach((b, i) => { b.e.style.transition = `transform 0.9s cubic-bezier(.2, 1.3, .4, 1) ${i * 0.03}s`; b.e.style.transform = ''; });
    setTimeout(() => { bodies.forEach((b) => { b.e.style.transition = ''; b.e.style.willChange = ''; }); document.body.classList.remove('gravity-on'); }, 1600);
    grav = null;
  } };
}
function gravityOff() { grav?.stop(); }

// =========================================================================================
// Schwarzes Loch – the interface spirals into a vortex and comes back
// =========================================================================================
let hole = false;
function blackHole() {
  if (hole) return;
  hole = true;
  gravityOff();
  const cx = innerWidth / 2; const cy = innerHeight / 2;
  const targets = [...document.querySelectorAll('.topbar, .hud > *')];
  const layer = el('div', 'bh'); const c = el('canvas'); layer.append(c); document.body.append(layer);
  const dpr = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * dpr; c.height = innerHeight * dpr; const ctx = c.getContext('2d');
  // rumble
  try {
    const a = ac(); const o = a.createOscillator(); const g = a.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, a.currentTime); o.frequency.exponentialRampToValueAtTime(28, a.currentTime + 3.2);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 3.4);
    o.connect(f).connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 3.5);
  } catch { /* no audio */ }
  const anims = targets.map((e) => {
    const r = e.getBoundingClientRect();
    e.style.transformOrigin = `${cx - r.left}px ${cy - r.top}px`;
    return e.animate([
      { transform: 'none', filter: 'none', opacity: 1, offset: 0 },
      { transform: 'skewX(4deg) scale(0.97)', filter: 'blur(0px)', opacity: 1, offset: 0.18 },
      { transform: 'rotate(240deg) scale(0.35)', filter: 'blur(3px)', opacity: 0.9, offset: 0.5 },
      { transform: 'rotate(620deg) scale(0.01)', filter: 'blur(8px)', opacity: 0, offset: 0.7 },
      { transform: 'rotate(620deg) scale(0.01)', opacity: 0, offset: 0.82 },
      { transform: 'rotate(-30deg) scale(1.08)', filter: 'blur(1px)', opacity: 1, offset: 0.93 },
      { transform: 'none', filter: 'none', opacity: 1, offset: 1 }
    ], { duration: 5200, easing: 'cubic-bezier(.5, 0, .5, 1)' });
  });
  const t0 = performance.now(); let raf = 0;
  const parts = Array.from({ length: 420 }, () => ({ a: Math.random() * Math.PI * 2, r: (80 + Math.random() * Math.max(innerWidth, innerHeight) * 0.6) * dpr, s: 0.5 + Math.random() }));
  const frame = (now) => {
    const k = (now - t0) / 5200;
    ctx.clearRect(0, 0, c.width, c.height);
    const strength = k < 0.7 ? Math.min(1, k / 0.5) : k < 0.85 ? 1 : Math.max(0, 1 - (k - 0.85) / 0.1);
    const X = cx * dpr; const Y = cy * dpr;
    for (const p of parts) {
      p.a += (0.02 + (200 * dpr) / p.r * 0.02) * p.s * (1 + strength * 3);
      if (k < 0.82) p.r = Math.max(20 * dpr, p.r - p.s * 3 * dpr * strength); else p.r += 12 * dpr;
      const x = X + Math.cos(p.a) * p.r; const y = Y + Math.sin(p.a) * p.r * 0.55;
      ctx.fillStyle = `rgba(255, ${80 + Math.random() * 100}, 60, ${0.7 * strength})`;
      ctx.fillRect(x, y, 2 * dpr, 2 * dpr);
    }
    const hr = (30 + strength * 90) * dpr;
    const g = ctx.createRadialGradient(X, Y, hr * 0.6, X, Y, hr * 2.4);
    g.addColorStop(0, `rgba(255, 60, 40, ${0.6 * strength})`); g.addColorStop(1, 'rgba(255, 30, 40, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, hr * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, strength * 1.2)})`; ctx.beginPath(); ctx.arc(X, Y, hr, 0, Math.PI * 2); ctx.fill();
    if (k >= 0.82 && !layer.dataset.pop) { layer.dataset.pop = '1'; boom(0.6, 1600, 0.6); tone(80, 0.5, 'sine', 0.3, 0, 300); }
    if (k < 1) raf = requestAnimationFrame(frame);
    else { layer.remove(); targets.forEach((e) => { e.style.transformOrigin = ''; }); hole = false; }
  };
  raf = requestAnimationFrame(frame);
  return anims;
}

// =========================================================================================
// Zeitkapsel – sealed on this device, opens after the chosen time
// =========================================================================================
const CAP_KEY = 'jarvis.capsules';
const capsules = () => { try { return JSON.parse(localStorage.getItem(CAP_KEY) || '[]'); } catch { return []; } };
const saveCaps = (list) => { try { localStorage.setItem(CAP_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
const fmtDate = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
function capsuleOverlay() {
  closeOthers('capsule');
  document.querySelector('.cap')?.remove();
  const root = el('div', 'cap');
  root.innerHTML = '<header class="cap-top"><p>JARVIS · ZEITKAPSEL</p><button type="button" class="cap-x" aria-label="Schließen">✕</button></header><main class="cap-stage"></main>';
  root.querySelector('.cap-x').addEventListener('click', () => root.remove());
  document.body.append(root);
  return root;
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'capsule') document.querySelector('.cap')?.remove(); });
function sealCapsule(text, days) {
  const now = Date.now();
  const cap = { id: Math.random().toString(36).slice(2, 10), text: String(text).slice(0, 1000), created: now, opens: now + days * 86400000, opened: false };
  saveCaps([...capsules(), cap]);
  const root = capsuleOverlay(); const stage = root.querySelector('.cap-stage');
  stage.innerHTML = `<div class="cap-scene"><div class="cap-paper"><small>AN MEIN ZUKÜNFTIGES ICH</small><p></p></div><div class="cap-tube"><span class="cap-lid"></span><span class="cap-body"></span><span class="cap-lock"></span></div><div class="cap-seal">VERSIEGELT<br><small>ÖFFNET AM ${fmtDate(cap.opens).toUpperCase()}</small></div></div>`;
  stage.querySelector('.cap-paper p').textContent = cap.text;
  const scene = stage.querySelector('.cap-scene');
  setTimeout(() => { scene.classList.add('fold'); tone(900, 0.3, 'triangle', 0.06, 0, 400); }, 1800);
  setTimeout(() => { scene.classList.add('closed'); boom(0.3, 400, 0.4); tone(160, 0.3, 'square', 0.1); }, 3000);
  setTimeout(() => { scene.classList.add('locked'); tone(1200, 0.08, 'square', 0.08); tone(1600, 0.08, 'square', 0.08, 0.1); }, 3700);
  setTimeout(() => { scene.classList.add('sealed'); tone(220, 0.6, 'sawtooth', 0.1, 0, 110); }, 4300);
  setTimeout(() => scene.classList.add('away'), 6400);
  setTimeout(() => showCapsules(root), 7600);
}
function showCapsules(root = capsuleOverlay()) {
  const stage = root.querySelector('.cap-stage');
  const list = capsules().filter((c) => !c.opened);
  stage.replaceChildren();
  stage.append(el('h2', 'cap-h', list.length ? `${list.length} versiegelte Kapsel(n)` : 'Keine versiegelten Kapseln'));
  const grid = el('div', 'cap-grid');
  for (const c of list) {
    const card = el('div', 'cap-card');
    const cd = el('b', 'cap-cd');
    card.append(el('span', 'cap-icon'), el('small', '', `Versiegelt am ${fmtDate(c.created)}`), cd, el('small', '', `öffnet am ${fmtDate(c.opens)}`));
    grid.append(card);
    const tick = () => { const ms = c.opens - Date.now(); if (ms <= 0) { cd.textContent = 'BEREIT'; return; } const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); const m = Math.floor((ms % 3600000) / 60000); cd.textContent = `${d} T ${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} m`; };
    tick(); setInterval(tick, 30000);
  }
  stage.append(grid, el('p', 'cap-note', 'Die Kapseln liegen nur auf diesem Gerät. Erst wenn die Zeit um ist, öffnet Jarvis sie – vorher kann niemand hineinsehen.'));
}
function openDueCapsules() {
  const list = capsules();
  const due = list.find((c) => !c.opened && c.opens <= Date.now());
  if (!due) return;
  setTimeout(() => {
    const root = capsuleOverlay(); const stage = root.querySelector('.cap-stage');
    stage.innerHTML = '<div class="cap-scene opening"><div class="cap-tube"><span class="cap-lid"></span><span class="cap-body"></span><span class="cap-lock"></span></div><div class="cap-beams"></div><div class="cap-paper"><small></small><p></p></div></div>';
    stage.querySelector('.cap-paper small').textContent = `GESCHRIEBEN AM ${fmtDate(due.created).toUpperCase()}`;
    stage.querySelector('.cap-paper p').textContent = due.text;
    const scene = stage.querySelector('.cap-scene');
    tone(400, 0.5, 'triangle', 0.08);
    setTimeout(() => { scene.classList.add('unlock'); tone(1600, 0.08, 'square', 0.08); }, 1200);
    setTimeout(() => { scene.classList.add('open'); boom(0.3, 2000, 0.6); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.08, i * 0.1)); }, 2000);
    due.opened = true; saveCaps(list);
  }, 7000);
}

// =========================================================================================
// GPS-Schatzsuche – 3 virtual treasures 100–300 m away, radar with direction
// =========================================================================================
const TR_KEY = 'jarvis.treasure';
let tr = null;
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function distBearing(a, b) {
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  const dist = 2 * R * Math.asin(Math.sqrt(h));
  const y = Math.sin(dLon) * Math.cos(rad(b.lat)); const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return { dist, bearing: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 };
}
function offset(p, dist, bearing) {
  const br = rad(bearing); const d = dist / R; const la = rad(p.lat); const lo = rad(p.lon);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI };
}
function treasure(action) {
  if (action === 'stopp') { tr?.stop(); try { localStorage.removeItem(TR_KEY); } catch { /* ignore */ } return; }
  if (tr) return;
  closeOthers('treasure');
  let game = null;
  try { game = JSON.parse(localStorage.getItem(TR_KEY) || 'null'); } catch { game = null; }
  if (action === 'start') game = null;
  const root = el('div', 'tr');
  root.innerHTML = `<header class="tr-top"><p>JARVIS · SCHATZSUCHE</p><button type="button" class="tr-x" aria-label="Schließen">✕</button></header>
    <div class="tr-radar"><canvas></canvas><div class="tr-arrow"><i></i></div></div>
    <div class="tr-info"><b class="tr-dist">Standort wird gesucht …</b><span class="tr-found"></span><small class="tr-acc"></small></div>
    <div class="tr-bar"><button type="button" class="tr-compass">🧭 Kompass aktivieren</button></div>
    <p class="tr-safe">Achte auf den Verkehr und geh nur auf öffentlichen Wegen. Liegt ein Schatz an einer unerreichbaren Stelle: Schatzsuche neu starten.</p>`;
  document.body.append(root);
  const c = root.querySelector('canvas'); const ctx = c.getContext('2d');
  const distEl = root.querySelector('.tr-dist'); const foundEl = root.querySelector('.tr-found'); const accEl = root.querySelector('.tr-acc'); const arrow = root.querySelector('.tr-arrow');
  let pos = null; let heading = null; let watch = null; let raf = 0; let lastBeep = 0;
  const onOrient = (e) => { const h = e.webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null); if (h != null) heading = h; };
  root.querySelector('.tr-compass').addEventListener('click', async (ev) => {
    ac();
    try { if (typeof DeviceOrientationEvent?.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') throw new Error('nicht erlaubt'); } addEventListener('deviceorientationabsolute', onOrient); addEventListener('deviceorientation', onOrient); ev.target.textContent = '🧭 Kompass an'; } catch (e) { ev.target.textContent = `Kompass ${e.message}`; }
  });
  const save = () => { try { localStorage.setItem(TR_KEY, JSON.stringify(game)); } catch { /* ignore */ } };
  watch = navigator.geolocation?.watchPosition((p) => {
    pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    if (!game) {
      game = { started: Date.now(), items: [0, 1, 2].map((i) => ({ ...offset(pos, 100 + Math.random() * 200, i * 120 + Math.random() * 90), found: false })) };
      save();
    }
    accEl.textContent = `GPS-Genauigkeit ±${Math.round(pos.acc)} m`;
  }, (err) => { distEl.textContent = err.code === 1 ? 'Standort nicht erlaubt – bitte im Browser freigeben.' : 'Standort nicht verfügbar.'; }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  if (!navigator.geolocation) distEl.textContent = 'Dieses Gerät hat kein GPS.';
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (c.width !== c.clientWidth * 2) { c.width = c.clientWidth * 2; c.height = c.clientHeight * 2; }
    const W = c.width; const cx = W / 2; const rr = W / 2 - 8;
    ctx.clearRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(255, 42, 61, 0.35)'; ctx.lineWidth = 2;
    for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cx, rr * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - rr, cx); ctx.lineTo(cx + rr, cx); ctx.moveTo(cx, cx - rr); ctx.lineTo(cx, cx + rr); ctx.stroke();
    const sweep = (now / 1000) % (Math.PI * 2);
    const g = ctx.createConicGradient ? ctx.createConicGradient(sweep - Math.PI / 2, cx, cx) : null;
    if (g) { g.addColorStop(0, 'rgba(255, 42, 61, 0.45)'); g.addColorStop(0.12, 'rgba(255, 42, 61, 0)'); g.addColorStop(1, 'rgba(255, 42, 61, 0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cx, rr, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cx, 6, 0, Math.PI * 2); ctx.fill();
    if (!pos || !game) return;
    const rot = heading ?? 0;
    let best = null;
    game.items.forEach((it, i) => {
      const { dist, bearing } = distBearing(pos, it);
      if (!it.found && dist < Math.max(20, Math.min(40, pos.acc))) { it.found = true; save(); chest(i, game.items.filter((q) => q.found).length === 3); }
      if (!it.found && (!best || dist < best.dist)) best = { dist, bearing };
      const a = rad(bearing - rot - 90); const rd = Math.min(rr, (dist / 400) * rr);
      const x = cx + Math.cos(a) * rd; const y = cx + Math.sin(a) * rd;
      ctx.fillStyle = it.found ? 'rgba(255, 210, 120, 0.9)' : '#ff2a3d'; ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, it.found ? 7 : 9 + Math.sin(now / 200) * 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    });
    const n = game.items.filter((q) => q.found).length;
    foundEl.textContent = `${n} von 3 Schätzen gefunden`;
    if (best) {
      distEl.textContent = `Nächster Schatz: ${Math.round(best.dist)} m`;
      arrow.style.transform = `rotate(${best.bearing - rot}deg)`;
      arrow.classList.toggle('noheading', heading == null);
      const interval = Math.max(180, Math.min(2500, best.dist * 8));
      if (now - lastBeep > interval) { lastBeep = now; tone(best.dist < 50 ? 1400 : 900, 0.06, 'square', 0.05); }
    } else distEl.textContent = 'Alle Schätze gefunden! 🏆';
  };
  raf = requestAnimationFrame(frame);
  const stop = () => { cancelAnimationFrame(raf); if (watch != null) navigator.geolocation.clearWatch(watch); removeEventListener('deviceorientation', onOrient); removeEventListener('deviceorientationabsolute', onOrient); root.remove(); tr = null; };
  root.querySelector('.tr-x').addEventListener('click', stop);
  tr = { stop };
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'treasure') tr?.stop(); });
function chest(i, all) {
  const fx = el('div', 'tr-chest');
  fx.innerHTML = `<div class="chest"><span class="chest-lid"></span><span class="chest-body"></span><span class="chest-glow"></span></div><b>${all ? 'ALLE SCHÄTZE GEFUNDEN!' : `SCHATZ ${i + 1} GEFUNDEN!`}</b>`;
  for (let k = 0; k < 30; k += 1) { const s = el('i', 'tr-coin'); s.style.setProperty('--a', `${-90 + (Math.random() - 0.5) * 120}deg`); s.style.setProperty('--d', `${120 + Math.random() * 180}px`); s.style.animationDelay = `${0.4 + Math.random() * 0.3}s`; fx.append(s); }
  document.body.append(fx);
  [523, 659, 784, 1046, all ? 1318 : 0].filter(Boolean).forEach((f, k) => tone(f, 0.4, 'triangle', 0.1, k * 0.1));
  navigator.vibrate?.([100, 60, 200]);
  setTimeout(() => fx.classList.add('out'), 3200);
  setTimeout(() => fx.remove(), 3900);
}

// =========================================================================================
export function initFx4(options) { deps = { ...deps, ...options }; openDueCapsules(); }
export function handleFx4(message) {
  switch (message.type) {
    case 'fireworks': fireworks(message.text); break;
    case 'gravity': if (message.action === 'an') gravityOn(); else gravityOff(); break;
    case 'blackhole': blackHole(); break;
    case 'capsule': if (message.action === 'neu') sealCapsule(message.text, message.days); else showCapsules(); break;
    case 'treasure': treasure(message.action); break;
    default:
  }
}
