// Start animation for the existing Jarvis (red/black). The real reactor
// (drawFilmReactor in app.js, canvas #reactor) is used – it only gets faster and
// brighter through bootFx. The overlay canvas draws the light beam, the energy
// pulse and the particles. ~5.5 s, skippable, never runs twice at once.
export const bootFx = { spin: 0, glow: 0 };

let running = false;
let done = false;

const RED = (a) => `rgba(255, 42, 61, ${a})`;

export function bootRunning() { return running; }

export function startBoot({ onDone = () => {} } = {}) {
  if (running || done) return;
  if (!document.body.classList.contains('theme-film')) { done = true; onDone(); return; }
  running = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
  body.classList.add('booting');

  const layer = document.createElement('div');
  layer.className = 'boot-layer';
  layer.innerHTML = '<canvas class="boot-canvas" aria-hidden="true"></canvas><p class="boot-text" aria-live="polite"></p><button type="button" class="boot-skip">Überspringen</button>';
  body.append(layer);
  const canvas = layer.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const text = layer.querySelector('.boot-text');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
  resize();
  addEventListener('resize', resize);

  // real status for the final sentence (no invented "online")
  let online = null;
  fetch('/api/status', { cache: 'no-store' }).then((r) => { online = r.ok; }).catch(() => { online = false; });

  const center = () => {
    const r = document.getElementById('reactor')?.getBoundingClientRect();
    return r && r.width ? { x: (r.left + r.width / 2) * dpr, y: (r.top + r.height / 2) * dpr, r: (r.width / 2) * dpr } : { x: canvas.width / 2, y: canvas.height / 2, r: 200 * dpr };
  };

  const particles = [];
  const T = reduce ? { beam: 0, form: 0.1, charge: 0.4, pulse: 0.8, ui: 1.0, end: 2.2 } : { beam: 0.25, form: 1.25, charge: 2.0, pulse: 3.45, ui: 3.7, end: 5.6 };
  const t0 = performance.now();
  let pulsed = false; let revealed = false; let finished = false; let raf = 0;

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    bootFx.spin = 0; bootFx.glow = 0;
    body.classList.remove('booting', 'boot-core', 'boot-reveal');
    body.classList.add('jboot-finished');
    setTimeout(() => body.classList.remove('jboot-finished'), 1200);
    showText();
    layer.classList.add('out');
    setTimeout(() => layer.remove(), 2600);
    running = false;
    done = true;
    onDone();
  }
  function showText() {
    text.textContent = online === false ? 'Verbindung zum Server wird hergestellt …' : 'Alle Systeme sind online.';
    const r = document.getElementById('reactor')?.getBoundingClientRect();
    if (r && r.width) { text.style.top = `${Math.round(r.top + r.height * 0.82 - 22)}px`; text.style.bottom = 'auto'; }
    text.classList.add('show');
  }
  layer.querySelector('.boot-skip').addEventListener('click', finish);

  function frame(now) {
    const t = (now - t0) / 1000;
    const W = canvas.width; const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const c = center();

    // 3. thin red light beam from top to bottom
    if (t >= T.beam && t < T.form + 0.3) {
      const k = Math.min(1, (t - T.beam) / (T.form - T.beam || 1));
      const y = k * H;
      const g = ctx.createLinearGradient(0, y - 140 * dpr, 0, y);
      g.addColorStop(0, RED(0)); g.addColorStop(1, RED(0.18));
      ctx.fillStyle = g; ctx.fillRect(0, y - 140 * dpr, W, 140 * dpr);
      ctx.fillStyle = 'rgba(255, 210, 214, 0.95)';
      ctx.shadowColor = RED(1); ctx.shadowBlur = 24 * dpr;
      ctx.fillRect(0, y - 1 * dpr, W, 2 * dpr);
      ctx.shadowBlur = 0;
    }
    // 4. the existing reactor appears in the centre
    if (t >= T.form && !body.classList.contains('boot-core')) body.classList.add('boot-core');
    // 5. pulse, rings spin and get brighter
    if (t >= T.form && t < T.ui + 0.6) {
      const k = Math.min(1, Math.max(0, (t - T.form) / (T.pulse - T.form)));
      bootFx.spin = k * 0.09;
      bootFx.glow = k;
    }
    // 7. small red particles fly to the core
    if (t >= T.charge && t < T.pulse) {
      for (let i = 0; i < 6; i += 1) {
        const a = Math.random() * Math.PI * 2; const d = Math.max(W, H) * (0.45 + Math.random() * 0.3);
        particles.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, s: 0.012 + Math.random() * 0.02, k: 0, size: (1 + Math.random() * 2) * dpr });
      }
    }
    for (const p of particles) {
      p.k = Math.min(1, p.k + p.s * (1 + p.k * 3));
      const e = p.k * p.k;
      const x = p.x + (c.x - p.x) * e; const y = p.y + (c.y - p.y) * e;
      ctx.fillStyle = RED(0.4 + 0.6 * p.k);
      ctx.shadowColor = RED(1); ctx.shadowBlur = 8 * dpr;
      ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (let i = particles.length - 1; i >= 0; i -= 1) if (particles[i].k >= 1) particles.splice(i, 1);
    // 6. red energy pulse across the screen
    if (t >= T.pulse) {
      if (!pulsed) { pulsed = true; body.classList.add('boot-flash'); setTimeout(() => body.classList.remove('boot-flash'), 500); navigator.vibrate?.(40); }
      const k = Math.min(1, (t - T.pulse) / 1.1);
      const rr = c.r * 0.4 + k * Math.hypot(W, H);
      ctx.strokeStyle = RED(0.85 * (1 - k)); ctx.lineWidth = (14 * (1 - k) + 2) * dpr;
      ctx.shadowColor = RED(1); ctx.shadowBlur = 30 * dpr;
      ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = RED(0.4 * (1 - k)); ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(c.x, c.y, rr * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr);
      g.addColorStop(0, RED(0.22 * (1 - k))); g.addColorStop(1, RED(0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // 8. the existing interface comes back
    if (t >= T.ui && !revealed) { revealed = true; body.classList.add('boot-reveal'); body.classList.remove('booting'); }
    if (t >= T.ui) { const k = Math.min(1, (t - T.ui) / 1.2); bootFx.spin = 0.09 * (1 - k); bootFx.glow = 1 - k; }
    // 10. final sentence
    if (t >= T.end - 1.2 && !text.classList.contains('show')) showText();
    if (t >= T.end) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}
