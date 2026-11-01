// Jarvis' own video renderer (Canvas 2D). Every frame is computed from the
// project and the time t – deterministic, so preview and export look the same.
// Scenes: city, hologram, interface, logo, particles, space, synthwave, text,
// image (AI still + camera move) and ai_video (real AI clip, optional).

export const FORMAT_SIZE = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
export const TRANSITION_SECONDS = 0.7;

// --- helpers --------------------------------------------------------------------
function rng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOut = (x) => 1 - (1 - clamp(x)) ** 3;
function rgba(hex, a) {
  const n = parseInt(String(hex).slice(1), 16) || 0xff7a1a;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const CYAN = '#5fe3ff';
const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) {
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    cache.set(key, make());
  }
  return cache.get(key);
}
function offscreen(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return c;
}

export function timeline(project) {
  let t = 0;
  const items = project.scenes.map((scene) => {
    const item = { scene, start: t, end: t + scene.duration };
    t += scene.duration;
    return item;
  });
  return { items, total: t };
}

// --- camera moves -------------------------------------------------------------------
function applyCamera(g, W, H, camera, p) {
  const e = ease(clamp(p));
  let s = 1;
  let x = 0;
  let r = 0;
  if (camera === 'push') s = 1 + 0.14 * e;
  else if (camera === 'pull') s = 1.14 - 0.14 * e;
  else if (camera === 'pan-left') { s = 1.12; x = W * 0.05 * (1 - 2 * e); }
  else if (camera === 'pan-right') { s = 1.12; x = -W * 0.05 * (1 - 2 * e); }
  else if (camera === 'orbit') { s = 1.08; r = (e - 0.5) * 0.05; x = Math.sin(e * Math.PI) * W * 0.02; }
  g.translate(W / 2 + x, H / 2);
  g.rotate(r);
  g.scale(s, s);
  g.translate(-W / 2, -H / 2);
}

// --- scenes ---------------------------------------------------------------------------
function bgGradient(g, W, H, top, bottom) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(-W, -H, W * 3, H * 3);
}

function stars(g, W, H, seed, count, t, twinkle = true) {
  const pts = cached(`stars:${seed}:${count}`, () => { const r = rng(seed); return Array.from({ length: count }, () => [r(), r() * 0.75, r() * 1.6 + 0.3, r() * 6]); });
  g.fillStyle = '#ffffff';
  for (const [x, y, size, ph] of pts) {
    g.globalAlpha = twinkle ? 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + ph)) : 0.8;
    g.fillRect(x * W, y * H, size, size);
  }
  g.globalAlpha = 1;
}

function cityLayer(W, H, seed, depth, accent) {
  return cached(`city:${seed}:${depth}:${W}x${H}:${accent}`, () => {
    const r = rng(seed + depth * 101);
    const width = Math.round(W * 1.5);
    const c = offscreen(width, H);
    const g = c.getContext('2d');
    const base = H * (0.62 + depth * 0.1);
    const shade = [18, 12, 6][depth];
    let x = 0;
    while (x < width) {
      const w = (W * (0.03 + r() * 0.05)) * (1 + depth * 0.4);
      const h = H * (0.12 + r() * (0.36 - depth * 0.08)) * (1 + depth * 0.12);
      const top = base - h;
      const grad = g.createLinearGradient(0, top, 0, H);
      grad.addColorStop(0, `rgb(${shade + 10},${shade + 14},${shade + 28})`);
      grad.addColorStop(1, `rgb(${shade},${shade},${shade + 8})`);
      g.fillStyle = grad;
      g.fillRect(x, top, w, H - top);
      if (r() > 0.6) { g.fillRect(x + w * 0.4, top - h * 0.12, w * 0.12, h * 0.12); }
      // windows
      const cols = Math.max(2, Math.floor(w / (6 + depth * 3)));
      const rows = Math.floor(h / (9 + depth * 4));
      const cw = w / cols;
      const rh = h / Math.max(rows, 1);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (r() > 0.28) continue;
          const warm = r() > 0.25;
          g.fillStyle = warm ? `rgba(255,${180 + Math.floor(r() * 60)},${110 + Math.floor(r() * 60)},${0.5 + r() * 0.5})` : rgba(accent, 0.8);
          g.fillRect(x + i * cw + cw * 0.25, top + j * rh + rh * 0.3, cw * 0.5, rh * 0.4);
        }
      }
      x += w + W * 0.004;
    }
    return c;
  });
}

function drawCity(g, W, H, lt, dur, sc, project) {
  const p = lt / dur;
  bgGradient(g, W, H, '#03040c', '#160a14');
  const glow = g.createRadialGradient(W * 0.5, H * 0.7, 0, W * 0.5, H * 0.7, W * 0.7);
  glow.addColorStop(0, rgba(project.accent, 0.35));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  stars(g, W, H, sc.seed, 160, lt);
  for (let depth = 0; depth < 3; depth++) {
    const layer = cityLayer(W, H, sc.seed, depth, project.accent);
    const shift = (layer.width - W) * (0.15 + p * (0.25 + depth * 0.2));
    g.drawImage(layer, -shift, 0);
    if (depth === 1) {
      // flying light trails between the layers
      const r = rng(sc.seed + 7);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const y = H * (0.25 + r() * 0.4);
        const speed = 0.15 + r() * 0.35;
        const dir = r() > 0.5 ? 1 : -1;
        const x = ((r() + lt * speed * dir) % 1 + 1) % 1 * W * 1.3 - W * 0.15;
        const len = W * (0.05 + r() * 0.08);
        const trail = g.createLinearGradient(x, y, x - len * dir, y);
        const color = r() > 0.5 ? project.accent : CYAN;
        trail.addColorStop(0, rgba(color, 1));
        trail.addColorStop(1, rgba(color, 0));
        g.strokeStyle = trail;
        g.lineWidth = Math.max(2, H * 0.003);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - len * dir, y + H * 0.004);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }
  const fog = g.createLinearGradient(0, H * 0.55, 0, H);
  fog.addColorStop(0, 'rgba(10,6,14,0)');
  fog.addColorStop(1, rgba(project.accent, 0.18));
  g.fillStyle = fog;
  g.fillRect(0, H * 0.55, W, H * 0.45);
}

function drawHologram(g, W, H, lt, dur, sc, project) {
  const u = Math.min(W, H);
  bgGradient(g, W, H, '#020509', '#070a12');
  const cx = W / 2;
  const cy = H * 0.46;
  const appear = easeOut(lt / 1.2);
  // projector beam
  const beam = g.createLinearGradient(0, H * 0.85, 0, cy - u * 0.3);
  beam.addColorStop(0, rgba(CYAN, 0.35 * appear));
  beam.addColorStop(1, rgba(CYAN, 0));
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(cx - u * 0.06, H * 0.85);
  g.lineTo(cx + u * 0.06, H * 0.85);
  g.lineTo(cx + u * 0.32, cy - u * 0.3);
  g.lineTo(cx - u * 0.32, cy - u * 0.3);
  g.closePath();
  g.fill();
  g.strokeStyle = rgba(CYAN, 0.9);
  g.lineWidth = u * 0.004;
  g.beginPath();
  g.ellipse(cx, H * 0.85, u * 0.12, u * 0.025, 0, 0, Math.PI * 2);
  g.stroke();
  // wireframe sphere
  const R = u * 0.22 * appear;
  const rot = lt * 0.8;
  const flicker = 0.85 + 0.15 * Math.sin(lt * 37) * Math.sin(lt * 13);
  g.globalCompositeOperation = 'lighter';
  g.lineWidth = Math.max(1, u * 0.0022);
  for (let i = 1; i < 9; i++) {
    const lat = (i / 9) * Math.PI - Math.PI / 2;
    g.strokeStyle = rgba(CYAN, 0.45 * flicker);
    g.beginPath();
    g.ellipse(cx, cy + Math.sin(lat) * R, Math.cos(lat) * R, Math.cos(lat) * R * 0.28, 0, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const lon = rot + (i / 10) * Math.PI;
    g.strokeStyle = rgba(i % 3 === 0 ? project.accent : CYAN, 0.5 * flicker);
    g.beginPath();
    g.ellipse(cx, cy, Math.abs(Math.cos(lon)) * R, R, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // orbit rings
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = rgba(project.accent, 0.8);
    g.lineWidth = u * 0.003;
    g.beginPath();
    g.ellipse(cx, cy, R * (1.35 + i * 0.22), R * (0.32 + i * 0.05), Math.sin(lt * 0.4 + i) * 0.4 + i * 0.6, lt * (1 + i * 0.4), lt * (1 + i * 0.4) + Math.PI * 1.3);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  if (sc.title) {
    const a = easeOut((lt - 0.6) / 0.8);
    g.globalAlpha = a * flicker;
    g.textAlign = 'center';
    g.font = `700 ${Math.round(u * 0.075)}px "Orbitron", "Segoe UI", sans-serif`;
    g.shadowColor = CYAN;
    g.shadowBlur = u * 0.03;
    g.fillStyle = '#d8fbff';
    g.fillText(sc.title, cx, Math.max(u * 0.11, cy - u * 0.22 - u * 0.12));
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }
}

function panel(g, x, y, w, h, accent, a) {
  g.globalAlpha = a;
  g.fillStyle = 'rgba(12,16,24,0.82)';
  g.strokeStyle = rgba(accent, 0.8);
  g.lineWidth = Math.max(1.5, h * 0.012);
  g.beginPath();
  g.roundRect(x, y, w, h, h * 0.06);
  g.fill();
  g.stroke();
}

function drawInterface(g, W, H, lt, dur, sc, project) {
  const u = Math.min(W, H);
  const A = project.accent;
  bgGradient(g, W, H, '#05070c', '#0c0d14');
  g.strokeStyle = 'rgba(255,255,255,0.04)';
  g.lineWidth = 1;
  const step = u * 0.06;
  for (let x = (lt * 20) % step; x < W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const portrait = H > W;
  const cx = W / 2;
  const cy = portrait ? H * 0.32 : H / 2;
  // central orb
  const pulse = 1 + 0.06 * Math.sin(lt * 3);
  const orb = g.createRadialGradient(cx - u * 0.03, cy - u * 0.03, 0, cx, cy, u * 0.12 * pulse);
  orb.addColorStop(0, '#ffd9bf');
  orb.addColorStop(0.5, A);
  orb.addColorStop(1, rgba(A, 0));
  g.fillStyle = orb;
  g.beginPath();
  g.arc(cx, cy, u * 0.12 * pulse, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = rgba(A, 0.5 - i * 0.12);
    g.lineWidth = u * 0.003;
    g.beginPath();
    g.arc(cx, cy, u * (0.16 + i * 0.05), lt * (0.8 + i * 0.5), lt * (0.8 + i * 0.5) + Math.PI * (1.2 - i * 0.2));
    g.stroke();
  }
  // panels
  const boxes = portrait
    ? [[0.06, 0.5, 0.42, 0.15], [0.52, 0.5, 0.42, 0.15], [0.06, 0.67, 0.88, 0.13]]
    : [[0.04, 0.12, 0.28, 0.34], [0.04, 0.54, 0.28, 0.34], [0.68, 0.12, 0.28, 0.34], [0.68, 0.54, 0.28, 0.34]];
  boxes.forEach(([bx, by, bw, bh], i) => {
    const t0 = 0.2 + i * 0.25;
    const a = easeOut((lt - t0) / 0.6);
    if (a <= 0) return;
    const fromLeft = bx < 0.5;
    const x = bx * W + (1 - a) * (fromLeft ? -W * 0.1 : W * 0.1);
    const y = by * H;
    const w = bw * W;
    const h = bh * H;
    panel(g, x, y, w, h, A, a);
    const pad = h * 0.1;
    g.fillStyle = rgba(A, 0.95);
    g.font = `600 ${Math.round(h * 0.09)}px "Inter", "Segoe UI", sans-serif`;
    g.textAlign = 'left';
    g.fillText(['SYSTEM', 'ANALYSE', 'PLANUNG', 'NETZWERK'][i % 4], x + pad, y + pad + h * 0.06);
    const k = clamp((lt - t0) / 1.6);
    if (i % 3 === 0) {
      // bar chart
      const n = 7;
      for (let j = 0; j < n; j++) {
        const v = (0.3 + 0.7 * Math.abs(Math.sin(j * 1.7 + sc.seed))) * ease(k);
        g.fillStyle = j % 2 ? rgba(A, 0.9) : rgba(CYAN, 0.8);
        const bwid = (w - pad * 2) / n * 0.6;
        g.fillRect(x + pad + j * (w - pad * 2) / n, y + h - pad - v * h * 0.55, bwid, v * h * 0.55);
      }
    } else if (i % 3 === 1) {
      // line chart
      g.strokeStyle = CYAN;
      g.lineWidth = Math.max(2, h * 0.015);
      g.beginPath();
      const pts = 30;
      for (let j = 0; j <= pts * k; j++) {
        const px = x + pad + (j / pts) * (w - pad * 2);
        const py = y + h * 0.62 - Math.sin(j * 0.45 + sc.seed) * h * 0.15 - (j / pts) * h * 0.15;
        if (j === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    } else {
      // gauge + typing text
      const r = Math.min(w, h) * 0.2;
      g.lineWidth = r * 0.18;
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.beginPath(); g.arc(x + w - pad - r, y + h / 2 + h * 0.05, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = A;
      g.beginPath(); g.arc(x + w - pad - r, y + h / 2 + h * 0.05, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.87 * ease(k)); g.stroke();
      const lines = ['> Systeme online', '> Sprache erkannt', '> Bereit'];
      g.fillStyle = '#e8eef5';
      g.font = `500 ${Math.round(h * 0.085)}px "Consolas", monospace`;
      lines.forEach((line, li) => {
        const chars = Math.floor(clamp((lt - t0 - li * 0.5) / 0.8) * line.length);
        g.fillText(line.slice(0, chars), x + pad, y + h * 0.42 + li * h * 0.15);
      });
    }
    g.globalAlpha = 1;
  });
}

function drawLogo(g, W, H, lt, dur, sc, project) {
  const u = Math.min(W, H);
  const A = project.accent;
  bgGradient(g, W, H, '#040406', '#0d0806');
  const cx = W / 2;
  const cy = H / 2;
  const p = lt / dur;
  // converging particles
  const pts = cached(`logo:${sc.seed}`, () => { const r = rng(sc.seed); return Array.from({ length: 260 }, () => [r() * Math.PI * 2, 0.4 + r() * 0.8, r()]); });
  const k = easeOut(clamp(lt / (dur * 0.45)));
  g.globalCompositeOperation = 'lighter';
  for (const [ang, dist, sz] of pts) {
    const d = u * dist * (1 - k) + u * 0.18 * k;
    const a2 = ang + lt * 0.5 * (1 - k);
    g.fillStyle = rgba(sz > 0.7 ? CYAN : A, 0.8 * (1 - k * 0.6));
    g.beginPath();
    g.arc(cx + Math.cos(a2) * d, cy + Math.sin(a2) * d * 0.9, u * 0.003 * (1 + sz * 2), 0, Math.PI * 2);
    g.fill();
  }
  // rings
  for (let i = 0; i < 3; i++) {
    const rr = u * (0.2 + i * 0.06) * easeOut(clamp((lt - dur * 0.35 - i * 0.12) / 0.8));
    if (rr <= 0) continue;
    g.strokeStyle = rgba(A, 0.7 - i * 0.18);
    g.lineWidth = u * (0.004 - i * 0.001);
    g.beginPath();
    g.arc(cx, cy, rr, lt * (0.6 + i * 0.3), lt * (0.6 + i * 0.3) + Math.PI * 1.6);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  const text = sc.title || project.title || 'JARVIS';
  const reveal = easeOut(clamp((lt - dur * 0.4) / 0.9));
  if (reveal > 0) {
    const size = Math.min(u * 0.14, (W * 0.8) / Math.max(text.length, 4) * 1.6);
    g.font = `800 ${Math.round(size)}px "Orbitron", "Segoe UI", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = reveal;
    if ('letterSpacing' in g) g.letterSpacing = `${Math.round(size * 0.25 * (1 - reveal) + size * 0.06)}px`;
    g.shadowColor = A;
    g.shadowBlur = u * 0.04;
    g.fillStyle = '#ffffff';
    g.fillText(text, cx, cy);
    g.shadowBlur = 0;
    // light sweep: only over the letters (drawn on a separate layer)
    const layer = cached(`sweep:${W}x${H}`, () => offscreen(W, Math.ceil(size * 2.4)));
    const lh = layer.height;
    const lg = layer.getContext('2d');
    lg.clearRect(0, 0, W, lh);
    lg.font = g.font;
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    if ('letterSpacing' in lg) lg.letterSpacing = g.letterSpacing;
    lg.globalCompositeOperation = 'source-over';
    lg.fillStyle = '#ffffff';
    lg.fillText(text, cx, lh / 2);
    const sweepX = cx - W * 0.4 + clamp((lt - dur * 0.55) / 1.2) * W * 0.8;
    const sw = lg.createLinearGradient(sweepX - u * 0.1, 0, sweepX + u * 0.1, 0);
    sw.addColorStop(0, 'rgba(255,255,255,0)');
    sw.addColorStop(0.5, rgba(project.accent, 0.95));
    sw.addColorStop(1, 'rgba(255,255,255,0)');
    lg.globalCompositeOperation = 'source-atop';
    lg.fillStyle = sw;
    lg.fillRect(0, 0, W, lh);
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(layer, 0, cy - lh / 2);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.globalAlpha = 1;
    g.textBaseline = 'alphabetic';
  }
  const flare = g.createRadialGradient(cx, cy, 0, cx, cy, u * 0.5);
  flare.addColorStop(0, rgba(A, 0.25 * Math.sin(Math.PI * clamp(p))));
  flare.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = flare;
  g.fillRect(0, 0, W, H);
}

function drawParticles(g, W, H, lt, dur, sc, project) {
  const u = Math.min(W, H);
  bgGradient(g, W, H, '#020206', '#07040a');
  const pts = cached(`gal:${sc.seed}`, () => { const r = rng(sc.seed); return Array.from({ length: 1400 }, (_, i) => { const arm = i % 3; const d = r() ** 0.6; return [arm * (Math.PI * 2 / 3) + d * 4 + (r() - 0.5) * 0.6, d, r()]; }); });
  g.globalCompositeOperation = 'lighter';
  const rot = lt * 0.25;
  for (const [ang, d, z] of pts) {
    const a2 = ang + rot * (1.2 - d);
    const x = W / 2 + Math.cos(a2) * d * u * 0.55;
    const y = H / 2 + Math.sin(a2) * d * u * 0.32;
    g.fillStyle = d < 0.25 ? 'rgba(255,230,200,0.9)' : rgba(z > 0.5 ? project.accent : CYAN, 0.55);
    g.fillRect(x, y, 1.5 + z * 2.5, 1.5 + z * 2.5);
  }
  const core = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, u * 0.18);
  core.addColorStop(0, 'rgba(255,220,190,0.7)');
  core.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}

function drawSpace(g, W, H, lt, dur, sc, project) {
  const u = Math.min(W, H);
  g.fillStyle = '#010104';
  g.fillRect(-W, -H, W * 3, H * 3);
  const pts = cached(`warp:${sc.seed}`, () => { const r = rng(sc.seed); return Array.from({ length: 500 }, () => [r() * Math.PI * 2, r(), r()]); });
  const speed = 0.15 + 0.85 * Math.sin(Math.PI * clamp(lt / dur));
  g.strokeStyle = '#ffffff';
  for (const [ang, z0, b] of pts) {
    const z = (z0 + lt * 0.25 * (0.5 + speed)) % 1;
    const d = z ** 2.2 * Math.max(W, H) * 0.8;
    const len = d * 0.08 * speed + 1;
    g.globalAlpha = clamp(z * 1.4) * (0.4 + b * 0.6);
    g.lineWidth = 1 + z * 2;
    g.beginPath();
    g.moveTo(W / 2 + Math.cos(ang) * d, H / 2 + Math.sin(ang) * d);
    g.lineTo(W / 2 + Math.cos(ang) * (d + len), H / 2 + Math.sin(ang) * (d + len));
    g.stroke();
  }
  g.globalAlpha = 1;
  // planet
  const k = easeOut(clamp(lt / dur));
  const px = W * (0.9 - 0.2 * k);
  const py = H * 0.75;
  const pr = u * 0.42;
  const planet = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
  planet.addColorStop(0, rgba(project.accent, 1));
  planet.addColorStop(0.6, '#3a1608');
  planet.addColorStop(1, '#050202');
  g.fillStyle = planet;
  g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = rgba(CYAN, 0.35);
  g.lineWidth = u * 0.01;
  g.beginPath(); g.arc(px, py, pr * 1.01, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
}

function drawSynthwave(g, W, H, lt, dur, sc, project) {
  const A = project.accent;
  const horizon = H * 0.58;
  bgGradient(g, W, H, '#0a0316', '#3a0d2e');
  stars(g, W, horizon, sc.seed, 90, lt);
  const sunR = Math.min(W, H) * 0.22;
  const sun = g.createLinearGradient(0, horizon - sunR * 2, 0, horizon);
  sun.addColorStop(0, '#ffd36b');
  sun.addColorStop(1, A);
  g.save();
  g.beginPath(); g.arc(W / 2, horizon - sunR * 0.2, sunR, 0, Math.PI * 2); g.clip();
  g.fillStyle = sun;
  g.fillRect(0, 0, W, horizon);
  g.fillStyle = '#2a0a26';
  for (let i = 0; i < 6; i++) g.fillRect(0, horizon - sunR * 0.2 + i * sunR * 0.16 - sunR * 0.1, W, sunR * 0.03 * (i + 1));
  g.restore();
  const r = rng(sc.seed + 3);
  g.fillStyle = '#12051c';
  g.beginPath();
  g.moveTo(0, horizon);
  for (let x = 0; x <= W; x += W / 24) g.lineTo(x, horizon - r() * H * 0.12 - (Math.abs(x - W / 2) / W) * H * 0.1);
  g.lineTo(W, horizon);
  g.fill();
  g.fillStyle = '#0b0214';
  g.fillRect(0, horizon, W, H - horizon);
  g.strokeStyle = rgba(A, 0.9);
  g.lineWidth = 2;
  for (let i = -20; i <= 20; i++) {
    g.beginPath();
    g.moveTo(W / 2 + i * W * 0.012, horizon);
    g.lineTo(W / 2 + i * W * 0.12, H);
    g.stroke();
  }
  const off = (lt * 0.6) % 1;
  for (let j = 0; j < 14; j++) {
    const z = (j + off) / 14;
    const y = horizon + (H - horizon) * z ** 2.2;
    g.globalAlpha = clamp(z * 1.5);
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  g.globalAlpha = 1;
}

function wrap(g, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(g, W, H, lt, dur, sc, project) {
  const u = Math.min(W, H);
  const A = project.accent;
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#08070b');
  gr.addColorStop(0.5 + 0.3 * Math.sin(lt * 0.7), '#1a0d08');
  gr.addColorStop(1, '#050507');
  g.fillStyle = gr;
  g.fillRect(-W, -H, W * 3, H * 3);
  const words = String(sc.title || sc.caption || project.title).split(/\s+/).filter(Boolean).slice(0, 10);
  const size = u * (words.length > 5 ? 0.09 : 0.12);
  g.font = `800 ${Math.round(size)}px "Inter", "Segoe UI", sans-serif`;
  g.textAlign = 'left';
  const lines = wrap(g, words.join(' '), W * 0.82);
  const each = Math.max(0.18, (dur * 0.55) / Math.max(words.length, 1));
  let idx = 0;
  const startY = H / 2 - ((lines.length - 1) * size * 1.15) / 2;
  lines.forEach((line, li) => {
    const lw = g.measureText(line).width;
    let x = W / 2 - lw / 2;
    for (const word of line.split(' ')) {
      const a = easeOut((lt - 0.2 - idx * each) / 0.35);
      const ww = g.measureText(`${word} `).width;
      if (a > 0) {
        g.save();
        g.globalAlpha = a;
        g.translate(x, startY + li * size * 1.15 + (1 - a) * size * 0.5);
        g.fillStyle = idx % 3 === 2 ? A : '#ffffff';
        g.fillText(word, 0, 0);
        g.restore();
      }
      x += ww;
      idx += 1;
    }
  });
  const bar = easeOut((lt - 0.3) / 1);
  g.fillStyle = A;
  g.fillRect(W / 2 - W * 0.12 * bar, startY + lines.length * size * 1.15 - size * 0.55, W * 0.24 * bar, u * 0.008);
}

function coverDraw(g, img, W, H) {
  const iw = img.videoWidth || img.width;
  const ih = img.videoHeight || img.height;
  if (!iw || !ih) return false;
  const s = Math.max(W / iw, H / ih);
  g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  return true;
}

function drawImageScene(g, W, H, lt, dur, sc, project, assets) {
  g.fillStyle = '#05060a';
  g.fillRect(-W, -H, W * 3, H * 3);
  const img = assets?.images?.get(sc.id);
  if (!img || !coverDraw(g, img, W, H)) {
    drawParticles(g, W, H, lt, dur, { ...sc, seed: sc.seed }, project);
    if (assets?.preview) {
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.font = `600 ${Math.round(Math.min(W, H) * 0.035)}px "Inter", sans-serif`;
      g.textAlign = 'center';
      g.fillText(assets.imageErrors?.has(sc.id) ? 'KI-Bild nicht verfügbar' : 'KI-Bild wird erzeugt …', W / 2, H / 2);
    }
    return;
  }
  // light leak
  const leak = g.createRadialGradient(W * (0.2 + 0.6 * (lt / dur)), H * 0.2, 0, W * 0.5, H * 0.3, Math.max(W, H) * 0.7);
  leak.addColorStop(0, rgba(project.accent, 0.12));
  leak.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = leak;
  g.fillRect(0, 0, W, H);
}

function drawAiVideo(g, W, H, lt, dur, sc, project, assets) {
  const video = assets?.clips?.get(sc.id);
  g.fillStyle = '#000';
  g.fillRect(-W, -H, W * 3, H * 3);
  if (!video || !coverDraw(g, video, W, H)) drawParticles(g, W, H, lt, dur, sc, project);
}

const DRAW = { city: drawCity, hologram: drawHologram, interface: drawInterface, logo: drawLogo, particles: drawParticles, space: drawSpace, synthwave: drawSynthwave, text: drawText, image: drawImageScene, ai_video: drawAiVideo };
const OWN_TITLE = new Set(['logo', 'text', 'hologram']);

function drawOverlays(g, W, H, lt, dur, sc, project) {
  const u = Math.min(W, H);
  if (sc.title && !OWN_TITLE.has(sc.type)) {
    const a = easeOut((lt - 0.3) / 0.7) * (1 - clamp((lt - dur + 0.5) / 0.5));
    if (a > 0) {
      g.save();
      g.globalAlpha = a;
      g.font = `800 ${Math.round(u * 0.085)}px "Inter", "Segoe UI", sans-serif`;
      g.textAlign = 'center';
      g.shadowColor = 'rgba(0,0,0,0.7)';
      g.shadowBlur = u * 0.03;
      g.fillStyle = '#ffffff';
      const lines = wrap(g, sc.title, W * 0.85);
      lines.forEach((line, i) => g.fillText(line, W / 2, H * 0.4 + (1 - a) * u * 0.03 + i * u * 0.1));
      g.shadowBlur = 0;
      g.fillStyle = project.accent;
      g.fillRect(W / 2 - u * 0.06 * a, H * 0.4 + lines.length * u * 0.1 - u * 0.05, u * 0.12 * a, u * 0.007);
      g.restore();
    }
  }
  if (sc.caption) {
    const a = easeOut((lt - 0.25) / 0.4) * (1 - clamp((lt - dur + 0.35) / 0.35));
    if (a > 0) {
      g.save();
      g.globalAlpha = a;
      const size = Math.round(u * 0.042);
      g.font = `600 ${size}px "Inter", "Segoe UI", sans-serif`;
      g.textAlign = 'center';
      const lines = wrap(g, sc.caption, W * 0.8);
      const lh = size * 1.3;
      const boxH = lines.length * lh + size * 0.8;
      const boxW = Math.max(...lines.map((l) => g.measureText(l).width)) + size * 1.4;
      const y0 = H * (H > W ? 0.88 : 0.84) - boxH / 2;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.roundRect(W / 2 - boxW / 2, y0, boxW, boxH, size * 0.4);
      g.fill();
      g.fillStyle = '#ffffff';
      lines.forEach((line, i) => g.fillText(line, W / 2, y0 + size * 0.4 + size + i * lh - size * 0.15));
      g.restore();
    }
  }
}

function vignette(g, W, H) {
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

export function drawScene(g, W, H, scene, lt, project, assets) {
  g.save();
  applyCamera(g, W, H, scene.camera, lt / scene.duration);
  (DRAW[scene.type] || drawParticles)(g, W, H, lt, scene.duration, scene, project, assets);
  g.restore();
  vignette(g, W, H);
  drawOverlays(g, W, H, lt, scene.duration, scene, project);
}

const buffers = new Map();
function buffer(i, W, H) {
  let c = buffers.get(i);
  if (!c || c.width !== W || c.height !== H) { c = offscreen(W, H); buffers.set(i, c); }
  return c;
}

// The whole video at time t (seconds).
export function renderFrame(g, W, H, project, t, assets) {
  const { items, total } = timeline(project);
  if (!items.length) return;
  const time = clamp(t, 0, Math.max(total - 0.001, 0));
  const index = Math.max(0, items.findIndex((it) => time >= it.start && time < it.end));
  const cur = items[index];
  const next = items[index + 1];
  const lt = time - cur.start;
  const tr = cur.scene.transition === 'none' || !next ? 0 : Math.min(TRANSITION_SECONDS, cur.scene.duration * 0.4, next.scene.duration * 0.4);
  const q = tr ? clamp((lt - (cur.scene.duration - tr)) / tr) : 0;
  if (q <= 0) {
    drawScene(g, W, H, cur.scene, lt, project, assets);
  } else {
    const a = buffer(0, W, H);
    const b = buffer(1, W, H);
    const ga = a.getContext('2d');
    const gb = b.getContext('2d');
    drawScene(ga, W, H, cur.scene, lt, project, assets);
    drawScene(gb, W, H, next.scene, lt - (cur.scene.duration - tr), project, assets);
    const e = ease(q);
    g.save();
    switch (cur.scene.transition) {
      case 'slide':
        g.drawImage(a, -e * W, 0);
        g.drawImage(b, (1 - e) * W, 0);
        break;
      case 'zoom':
        g.drawImage(a, 0, 0);
        g.globalAlpha = e;
        g.translate(W / 2, H / 2);
        g.scale(0.85 + 0.15 * e, 0.85 + 0.15 * e);
        g.drawImage(b, -W / 2, -H / 2);
        break;
      case 'wipe':
        g.drawImage(a, 0, 0);
        g.beginPath();
        g.rect(0, 0, e * W, H);
        g.save();
        g.clip();
        g.drawImage(b, 0, 0);
        g.restore();
        g.fillStyle = project.accent;
        g.shadowColor = project.accent;
        g.shadowBlur = 30;
        g.fillRect(e * W - 3, 0, 6, H);
        break;
      case 'glitch': {
        const r = rng(Math.floor(time * 30) + 1);
        const slices = 14;
        for (let i = 0; i < slices; i++) {
          const y = (i / slices) * H;
          const h = H / slices + 1;
          const src = r() < e ? b : a;
          const off = (r() - 0.5) * W * 0.08 * Math.sin(Math.PI * e);
          g.drawImage(src, 0, y, W, h, off, y, W, h);
        }
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.25 * Math.sin(Math.PI * e);
        g.drawImage(b, 8, 0);
        break;
      }
      default:
        g.drawImage(a, 0, 0);
        g.globalAlpha = e;
        g.drawImage(b, 0, 0);
    }
    g.restore();
  }
  // fade in at the start, fade out at the end
  const edge = Math.min(time / 0.4, (total - time) / 0.6, 1);
  if (edge < 1) {
    g.fillStyle = `rgba(0,0,0,${1 - clamp(edge)})`;
    g.fillRect(0, 0, W, H);
  }
}
