// Website build: a holographic wireframe assembles component by component –
// driven by the REAL build progress (Studio job steps). Only when the job is
// really finished the frame turns solid and fades away to reveal the real
// preview; if the build fails, the frame glitches red and shows the error.
import { fitCanvas, loop } from '../perf.js';

const PARTS = [
  { k: 'nav', x: 0.04, y: 0.04, w: 0.92, h: 0.07, at: 0.06 },
  { k: 'hero', x: 0.04, y: 0.14, w: 0.92, h: 0.28, at: 0.18 },
  { k: 'h1', x: 0.1, y: 0.21, w: 0.5, h: 0.05, at: 0.26 },
  { k: 'cta', x: 0.1, y: 0.31, w: 0.18, h: 0.05, at: 0.32 },
  { k: 'card', x: 0.04, y: 0.46, w: 0.29, h: 0.2, at: 0.42 },
  { k: 'card', x: 0.355, y: 0.46, w: 0.29, h: 0.2, at: 0.5 },
  { k: 'card', x: 0.67, y: 0.46, w: 0.29, h: 0.2, at: 0.58 },
  { k: 'text', x: 0.04, y: 0.7, w: 0.6, h: 0.1, at: 0.68 },
  { k: 'img', x: 0.68, y: 0.7, w: 0.28, h: 0.1, at: 0.76 },
  { k: 'footer', x: 0.04, y: 0.85, w: 0.92, h: 0.1, at: 0.84 }
];
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };

export const websiteModule = {
  create({ action, perf }) {
    const root = el('div', 'cae-web');
    const frame = el('div', 'cae-web-frame');
    const canvas = el('canvas');
    const head = el('div', 'cae-web-head');
    const title = el('p', 'cae-web-title', 'WEBSITE WIRD GEBAUT');
    const step = el('p', 'cae-web-step', action.label || 'Auftrag läuft');
    const bar = el('div', 'cae-web-bar'); const fill = el('i'); bar.append(fill);
    const pct = el('span', 'cae-web-pct', '0 %');
    head.append(title, step);
    frame.append(canvas);
    root.append(head, frame, bar, pct);
    document.body.append(root);
    const w = Math.min(560, innerWidth - 46); const h = Math.round(w * 0.62);
    const ctx = fitCanvas(canvas, w, h);
    let target = 0.03; let shown = 0; let state = 'run'; let doneAt = 0;
    const real = action.tool === 'studio_website';
    const t0 = performance.now();
    const stop = loop((t) => {
      // functions without step reports: creeping "läuft" bar that never reaches 100 % on its own
      if (!real && state === 'run') target = Math.max(target, 0.85 * (1 - Math.exp(-(t - t0) / 9000)));
      shown += (target - shown) * (perf.reduced ? 1 : 0.06);
      fill.style.width = `${(shown * 100).toFixed(1)}%`;
      pct.textContent = state === 'ok' ? 'fertig' : state === 'bad' ? 'Fehler' : `${Math.round(shown * 100)} %`;
      ctx.clearRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = 'rgba(255, 42, 61, 0.07)'; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const glitch = state === 'bad' ? (Math.random() - 0.5) * 6 : 0;
      for (const p of PARTS) {
        const k = Math.max(0, Math.min(1, (shown - p.at) / 0.08));
        if (k <= 0) continue;
        const x = p.x * w + glitch; const y = p.y * h; const pw = p.w * w * (state === 'run' ? Math.min(1, k * 1.2) : 1); const ph = p.h * h;
        const col = state === 'bad' ? '255, 60, 60' : '255, 92, 108';
        if (state === 'ok') { const f = Math.min(1, (t - doneAt) / 500); ctx.fillStyle = `rgba(255, 42, 61, ${0.16 * f + 0.05})`; ctx.fillRect(x, y, pw, ph); }
        ctx.strokeStyle = `rgba(${col}, ${0.35 + 0.55 * k})`; ctx.lineWidth = 1.4;
        ctx.strokeRect(x + 0.5, y + 0.5, pw, ph);
        if (p.k === 'card' || p.k === 'hero' || p.k === 'img') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + pw, y + ph); ctx.moveTo(x + pw, y); ctx.lineTo(x, y + ph); ctx.strokeStyle = `rgba(${col}, ${0.12 * k})`; ctx.stroke(); }
        if (state === 'run' && k < 1) { ctx.fillStyle = 'rgba(255, 220, 225, 0.9)'; ctx.fillRect(x + pw - 2, y, 2, ph); }
      }
      // scan line
      if (state === 'run') { const sy = (t / 12) % h; const g = ctx.createLinearGradient(0, sy - 30, 0, sy); g.addColorStop(0, 'rgba(255,42,61,0)'); g.addColorStop(1, 'rgba(255,42,61,0.18)'); ctx.fillStyle = g; ctx.fillRect(0, sy - 30, w, 30); }
    });
    const close = (ms) => setTimeout(() => { root.classList.add('out'); setTimeout(() => { stop(); root.remove(); }, 650); }, ms);
    const x = el('button', 'cae-web-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Animation ausblenden'); x.addEventListener('click', () => close(0)); root.append(x);
    return {
      progress(p, s) { if (state !== 'run') return; target = Math.max(target, Number(p) || 0); if (s) step.textContent = s; },
      complete() { state = 'ok'; target = 1; doneAt = performance.now(); title.textContent = 'WEBSITE FERTIG'; step.textContent = real ? 'Vorschau öffnet sich …' : 'Fertig – siehe Ergebnis'; root.classList.add('ok'); close(1500); },
      fail(info) { state = 'bad'; title.textContent = 'FEHLER BEIM BAUEN'; step.textContent = String(info?.reason || 'Die Website konnte nicht erstellt werden.').slice(0, 140); root.classList.add('bad'); close(6000); }
    };
  }
};
