// Performance tier for iPhone vs. Windows: pixel ratio cap, particle budget,
// reduced motion, pausing while the page is hidden.
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const mobile = /iPhone|iPad|iPod|Android|Mobile/.test(ua);
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
export const perf = {
  mobile,
  reduced,
  tier: reduced ? 'minimal' : mobile || cores <= 4 ? 'low' : 'high',
  get dpr() { return Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, this.tier === 'high' ? 2 : 1.5); },
  get nodes() { return this.tier === 'high' ? 34 : this.tier === 'low' ? 20 : 10; },
  get antialias() { return this.tier === 'high'; }
};
// requestAnimationFrame loop that sleeps while the tab is hidden and can be stopped.
export function loop(step) {
  let raf = 0; let running = true; let last = 0;
  const frame = (t) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016; last = t;
    try { step(t, dt); } catch (error) { running = false; cancelAnimationFrame(raf); console.warn('[Animation] Frame-Fehler', error); }
  };
  raf = requestAnimationFrame(frame);
  return () => { running = false; cancelAnimationFrame(raf); };
}
export function fitCanvas(canvas, w, h) {
  const r = perf.dpr;
  canvas.width = Math.round(w * r); canvas.height = Math.round(h * r);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0);
  return ctx;
}
