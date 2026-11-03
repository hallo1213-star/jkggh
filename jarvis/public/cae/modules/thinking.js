// Real thinking phase (Deepgram AgentThinking → speaking): the core changes
// colour, a neural network around it lights up, pulses travel between nodes;
// when the answer starts, the nodes fold back into the core.
import { fitCanvas, loop } from '../perf.js';

export const thinkingModule = {
  create({ perf }) {
    const core = document.getElementById('reactor');
    const rect = core?.getBoundingClientRect();
    if (!rect || rect.width < 40 || perf.tier === 'minimal') return { complete() {}, fail() {} };
    const size = Math.min(rect.width * 1.7, innerWidth, innerHeight * 0.9);
    const canvas = document.createElement('canvas');
    canvas.className = 'cae-think';
    canvas.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
    canvas.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
    document.body.append(canvas);
    const ctx = fitCanvas(canvas, size, size);
    const c = size / 2; const R = size * 0.44;
    const nodes = Array.from({ length: perf.nodes }, (_, i) => {
      const a = (i / perf.nodes) * Math.PI * 2 + Math.random() * 0.4; const r = R * (0.45 + Math.random() * 0.55);
      return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r, p: Math.random() * 6 };
    });
    const links = [];
    nodes.forEach((n, i) => { const near = nodes.map((m, j) => [j, Math.hypot(m.x - n.x, m.y - n.y)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2); near.forEach(([j]) => { if (!links.some((l) => (l[0] === j && l[1] === i))) links.push([i, j]); }); links.push([i, -1]); });
    const pulses = [];
    let born = performance.now(); let merging = 0; let alive = true;
    document.body.classList.add('cae-thinking');
    const stop = loop((t) => {
      const age = (t - born) / 1000;
      const show = Math.min(1, Math.max(0, (age - 0.2) / 0.35)); // short thinking → no flicker
      const m = merging ? Math.min(1, (t - merging) / 600) : 0;
      ctx.clearRect(0, 0, size, size);
      if (show <= 0) return;
      const alpha = show * (1 - m);
      const pos = (n) => (n === -1 ? { x: c, y: c } : { x: nodes[n].x + (c - nodes[n].x) * m, y: nodes[n].y + (c - nodes[n].y) * m });
      ctx.lineWidth = 1;
      for (const [a, b] of links) { const p = pos(a); const q = pos(b); ctx.strokeStyle = `rgba(255, 92, 108, ${0.18 * alpha})`; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      if (!merging && Math.random() < 0.35 && pulses.length < 18) pulses.push({ l: links[(Math.random() * links.length) | 0], k: 0, v: 0.6 + Math.random() * 0.8 });
      for (const pl of pulses) { pl.k += 0.016 * pl.v * 1.6; const p = pos(pl.l[0]); const q = pos(pl.l[1]); const x = p.x + (q.x - p.x) * pl.k; const y = p.y + (q.y - p.y) * pl.k; const g = ctx.createRadialGradient(x, y, 0, x, y, 6); g.addColorStop(0, `rgba(255, 236, 200, ${alpha})`); g.addColorStop(1, 'rgba(255, 140, 60, 0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
      for (let i = pulses.length - 1; i >= 0; i -= 1) if (pulses[i].k >= 1) pulses.splice(i, 1);
      nodes.forEach((n, i) => { const p = pos(i); const r = 2.2 + Math.sin(t / 300 + n.p) * 0.8; ctx.fillStyle = `rgba(255, ${170 + ((i * 7) % 60)}, 120, ${0.85 * alpha})`; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); });
      // core colour shift (warm white-gold while thinking)
      const g = ctx.createRadialGradient(c, c, 0, c, c, size * 0.2); g.addColorStop(0, `rgba(255, 230, 190, ${0.55 * show * (1 - m * 0.6)})`); g.addColorStop(1, 'rgba(255, 140, 60, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, size * 0.2, 0, Math.PI * 2); ctx.fill();
      if (merging && m >= 1) end();
    });
    function end() { if (!alive) return; alive = false; stop(); canvas.remove(); document.body.classList.remove('cae-thinking'); }
    return {
      complete() { if (performance.now() - born < 200) return end(); merging = performance.now(); setTimeout(end, 900); },
      fail() { end(); }
    };
  }
};
