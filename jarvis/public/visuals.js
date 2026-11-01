// Visual experiences: animated weather show, focus mode with a glowing
// countdown ring, and neon price charts. All drawn with canvas/SVG – light
// enough for phones, paused when hidden.
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let notify = () => {};
let chime = () => {};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- Weather show ------------------------------------------------------------------
const weather = { overlay: $('wx-overlay'), canvas: $('wx-canvas'), body: $('wx-body'), close: $('wx-close') };
let wxAnim = null;

function sceneFor(text) {
  const t = text.toLowerCase();
  if (/gewitter/.test(t)) return 'storm';
  if (/schnee|schneegriesel/.test(t)) return 'snow';
  if (/regen|niesel|schauer/.test(t)) return 'rain';
  if (/nebel/.test(t)) return 'fog';
  if (/bedeckt|bewölkt/.test(t)) return 'clouds';
  return 'sun';
}

function startWeatherScene(scene) {
  cancelAnimationFrame(wxAnim);
  const canvas = weather.canvas;
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = canvas.clientWidth * devicePixelRatio; canvas.height = canvas.clientHeight * devicePixelRatio; };
  resize();
  const W = () => canvas.width;
  const H = () => canvas.height;
  const count = scene === 'rain' || scene === 'storm' ? 420 : scene === 'snow' ? 260 : scene === 'clouds' || scene === 'fog' ? 9 : 60;
  const parts = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 0.6, s: Math.random() }));
  let flash = 0;
  const skies = { sun: ['#ff9a5a', '#ffd27a', '#7ec8ff'], clouds: ['#58677a', '#8796a8', '#b9c4cf'], rain: ['#1d2b3a', '#2f4357', '#4a6178'], storm: ['#0b1220', '#1b2638', '#2d3b52'], snow: ['#8aa4bf', '#c3d4e4', '#eef4fa'], fog: ['#7d8894', '#a3adb7', '#c9d0d6'] };
  const frame = (time) => {
    if (weather.overlay.hidden) return;
    if (canvas.width !== canvas.clientWidth * devicePixelRatio) resize();
    const [a, b, c] = skies[scene];
    const sky = ctx.createLinearGradient(0, 0, 0, H());
    sky.addColorStop(0, a); sky.addColorStop(0.55, b); sky.addColorStop(1, c);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W(), H());
    if (scene === 'sun') {
      const cx = W() * 0.78; const cy = H() * 0.22; const r = Math.min(W(), H()) * 0.11;
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 4);
      glow.addColorStop(0, 'rgba(255,248,220,0.95)'); glow.addColorStop(0.3, 'rgba(255,220,140,0.45)'); glow.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r * 4, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(time / 9000);
      for (let i = 0; i < 12; i += 1) { ctx.rotate(Math.PI / 6); ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 5, -r * 0.35); ctx.lineTo(r * 5, r * 0.35); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      for (const p of parts) { p.y -= 0.0004 * p.z; if (p.y < 0) p.y = 1; ctx.fillStyle = `rgba(255,255,255,${0.15 * p.z})`; ctx.beginPath(); ctx.arc(p.x * W(), p.y * H(), 1.5 * p.z * devicePixelRatio, 0, Math.PI * 2); ctx.fill(); }
    } else if (scene === 'clouds' || scene === 'fog') {
      for (const p of parts) {
        p.x += 0.00012 * p.z; if (p.x > 1.3) p.x = -0.3;
        const cx = p.x * W(); const cy = (0.12 + p.y * (scene === 'fog' ? 0.8 : 0.45)) * H(); const r = (90 + p.s * 140) * devicePixelRatio;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,255,255,${scene === 'fog' ? 0.22 : 0.35})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.6, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (scene === 'snow') {
      for (const p of parts) {
        p.y += 0.0009 * p.z; p.x += Math.sin(time / 1500 + p.s * 10) * 0.0004; if (p.y > 1) { p.y = -0.02; p.x = Math.random(); }
        ctx.fillStyle = `rgba(255,255,255,${0.5 + p.z * 0.5})`; ctx.beginPath(); ctx.arc(p.x * W(), p.y * H(), (1.5 + p.z * 3) * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.strokeStyle = 'rgba(190,215,240,0.55)'; ctx.lineWidth = devicePixelRatio;
      for (const p of parts) {
        p.y += 0.012 * p.z; p.x -= 0.0016 * p.z; if (p.y > 1) { p.y = -0.05; p.x = Math.random() * 1.2; }
        const x = p.x * W(); const y = p.y * H();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4 * devicePixelRatio, y + 18 * p.z * devicePixelRatio); ctx.stroke();
      }
      if (scene === 'storm') {
        if (flash <= 0 && Math.random() < 0.006) flash = 1;
        if (flash > 0) { ctx.fillStyle = `rgba(230,240,255,${flash * 0.55})`; ctx.fillRect(0, 0, W(), H()); flash -= 0.06; }
      }
    }
    if (!reduceMotion) wxAnim = requestAnimationFrame(frame);
  };
  wxAnim = requestAnimationFrame(frame);
}

export function showWeather(data) {
  weather.overlay.hidden = false;
  const now = data.jetzt;
  const days = data.tage || [];
  const max = Math.max(...days.map((d) => d.max ?? 0));
  const min = Math.min(...days.map((d) => d.min ?? 0));
  const span = Math.max(max - min, 1);
  const w = 640; const h = 160; const pad = 30;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(days.length - 1, 1);
  const y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const line = (key) => days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = `${line('max')} ${days.map((d, i) => `L${x(days.length - 1 - i).toFixed(1)},${y(days[days.length - 1 - i].min).toFixed(1)}`).join(' ')} Z`;
  weather.body.innerHTML = '';
  const head = el('div', 'wx-head');
  head.append(el('div', 'wx-place', data.ort.split(',')[0]), el('div', 'wx-now', `${now.temperatur}°`), el('div', 'wx-desc', `${now.symbol} ${now.wetter} · gefühlt ${now.gefuehlt}° · Wind ${now.windKmh} km/h`));
  const chart = el('div', 'wx-chart');
  chart.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Temperaturverlauf"><defs><linearGradient id="wxg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#wxg)" class="wx-area"/><path d="${line('max')}" class="wx-line wx-max"/><path d="${line('min')}" class="wx-line wx-min"/>
    ${days.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.max)}" r="4" class="wx-dot"/><text x="${x(i)}" y="${y(d.max) - 10}" text-anchor="middle" class="wx-label">${d.max}°</text><text x="${x(i)}" y="${y(d.min) + 20}" text-anchor="middle" class="wx-label wx-label-min">${d.min}°</text>`).join('')}</svg>`;
  const cards = el('div', 'wx-days');
  days.forEach((d, i) => {
    const card = el('div', 'wx-day');
    card.style.animationDelay = `${0.15 + i * 0.07}s`;
    card.append(el('b', '', i === 0 ? 'Heute' : d.tag.slice(0, 2)), el('span', 'wx-icon', d.symbol), el('span', '', `${d.max}° / ${d.min}°`), el('small', '', `💧 ${d.regenWahrscheinlichkeit ?? 0} %`));
    cards.append(card);
  });
  weather.body.append(head, chart, cards, el('p', 'wx-source', `Quelle: ${data.quelle} · live`));
  startWeatherScene(sceneFor(now.wetter));
}

// --- Focus mode ---------------------------------------------------------------------
const focus = { overlay: $('focus-overlay'), ring: $('focus-ring'), time: $('focus-time'), label: $('focus-label'), pause: $('focus-pause'), stop: $('focus-stop'), canvas: $('focus-canvas') };
let focusState = null;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function focusFrame() {
  if (!focusState) return;
  const { total, canvas, ctx, dots } = focusState;
  const left = focusState.paused ? focusState.left : focusState.end - Date.now();
  const progress = 1 - left / total;
  focus.time.textContent = fmt(left);
  const circ = 2 * Math.PI * 140;
  focus.ring.style.strokeDashoffset = String(circ * progress);
  if (canvas.width !== canvas.clientWidth * devicePixelRatio) { canvas.width = canvas.clientWidth * devicePixelRatio; canvas.height = canvas.clientHeight * devicePixelRatio; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const d of dots) {
    d.y -= d.v; if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
    ctx.fillStyle = `rgba(120, 220, 255, ${d.a})`;
    ctx.beginPath(); ctx.arc(d.x * canvas.width, d.y * canvas.height, d.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
  }
  if (left <= 0 && !focusState.paused) {
    endFocus(true);
    return;
  }
  focusState.raf = requestAnimationFrame(focusFrame);
}

export async function startFocus({ minutes = 25, label = '' }) {
  endFocus(false);
  focus.overlay.hidden = false;
  focus.label.textContent = label || 'Fokus';
  focus.pause.textContent = 'Pause';
  const total = minutes * 60_000;
  const canvas = focus.canvas;
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ }
  focusState = { total, end: Date.now() + total, paused: false, left: total, canvas, ctx: canvas.getContext('2d'), wake, dots: Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0004 + Math.random() * 0.0012, r: 0.6 + Math.random() * 2, a: 0.15 + Math.random() * 0.4 })) };
  focus.ring.style.strokeDasharray = String(2 * Math.PI * 140);
  focusFrame();
}

function endFocus(finished) {
  if (!focusState) return;
  cancelAnimationFrame(focusState.raf);
  focusState.wake?.release?.().catch(() => {});
  focusState = null;
  focus.overlay.hidden = true;
  if (finished) {
    chime([660, 880, 1320]);
    navigator.vibrate?.([200, 100, 200]);
    notify('Fokus-Zeit vorbei – stark gemacht! Gönn dir eine Pause. 🎉');
  }
}

// --- Price charts -------------------------------------------------------------------
function drawChart(canvas, chart, progress = 1, hover = null) {
  const ctx = canvas.getContext('2d');
  const dpr = devicePixelRatio;
  const W = (canvas.width = canvas.clientWidth * dpr);
  const H = (canvas.height = canvas.clientHeight * dpr);
  const pts = chart.points;
  const lo = chart.low; const hi = chart.high; const span = hi - lo || 1;
  const pad = 14 * dpr;
  const px = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const py = (v) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const up = chart.changePct >= 0;
  const color = up ? '#3ee6a0' : '#ff5c7a';
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(140,170,190,0.12)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) { const y = (H / 4) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const n = Math.max(2, Math.floor(pts.length * progress));
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) { const x = px(i); const y = py(pts[i][1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  const fill = ctx.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, up ? 'rgba(62,230,160,0.35)' : 'rgba(255,92,122,0.35)'); fill.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.lineTo(px(n - 1), H); ctx.lineTo(px(0), H); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) { const x = px(i); const y = py(pts[i][1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.strokeStyle = color; ctx.lineWidth = 2.5 * dpr; ctx.shadowColor = color; ctx.shadowBlur = 14 * dpr; ctx.stroke(); ctx.shadowBlur = 0;
  const lx = px(n - 1); const ly = py(pts[n - 1][1]);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(lx, ly, 4 * dpr, 0, Math.PI * 2); ctx.fill();
  if (hover !== null) {
    const i = Math.round(hover * (pts.length - 1));
    const x = px(i); const y = py(pts[i][1]);
    ctx.strokeStyle = 'rgba(220,240,255,0.5)'; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2); ctx.fill();
    return pts[i];
  }
  return null;
}

const money = (v, cur) => `${v.toLocaleString('de-DE', { maximumFractionDigits: v < 10 ? 4 : 2 })} ${cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur}`;

export function chartCard(chart, cardMessage) {
  const card = el('div', 'info-card chart-card');
  const head = el('div', 'chart-head');
  const title = el('div');
  const name = el('b', '', chart.name);
  const value = el('span', 'chart-value', money(chart.last, chart.currency));
  const change = el('span', `chart-change ${chart.changePct >= 0 ? 'up' : 'down'}`, `${chart.changePct >= 0 ? '▲' : '▼'} ${Math.abs(chart.changePct).toLocaleString('de-DE')} %`);
  title.append(name, value, change);
  const ranges = el('div', 'chart-ranges');
  const canvas = el('canvas', 'chart-canvas');
  const tip = el('div', 'chart-tip');
  let current = chart;
  const animate = () => {
    if (reduceMotion) { drawChart(canvas, current); return; }
    const t0 = performance.now();
    const step = (t) => { const p = Math.min((t - t0) / 900, 1); drawChart(canvas, current, 1 - (1 - p) ** 3); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  for (const [range, label] of [['1d', '1T'], ['5d', '5T'], ['1mo', '1M'], ['6mo', '6M'], ['1y', '1J'], ['5y', '5J']]) {
    const b = el('button', range === chart.range ? 'active' : '', label);
    b.type = 'button';
    b.addEventListener('click', async () => {
      try {
        const response = await fetch(`/api/chart?symbol=${encodeURIComponent(current.symbol)}&range=${range}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        current = data.chart;
        value.textContent = money(current.last, current.currency);
        change.textContent = `${current.changePct >= 0 ? '▲' : '▼'} ${Math.abs(current.changePct).toLocaleString('de-DE')} %`;
        change.className = `chart-change ${current.changePct >= 0 ? 'up' : 'down'}`;
        ranges.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        animate();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
    ranges.append(b);
  }
  const move = (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = drawChart(canvas, current, 1, Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1));
    if (point) {
      tip.hidden = false;
      tip.textContent = `${new Date(point[0]).toLocaleString('de-DE', current.range === '1d' || current.range === '5d' ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' })} · ${money(point[1], current.currency)}`;
    }
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', move);
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; drawChart(canvas, current); });
  head.append(title, ranges);
  card.append(head, canvas, tip, el('p', 'card-source', 'Yahoo Finance · ca. 15 Min. verzögert · keine Anlageberatung'));
  cardMessage('Chart', card);
  requestAnimationFrame(animate);
}

export function initVisuals({ toast, chime: playChime }) {
  notify = toast;
  chime = playChime;
  weather.close.addEventListener('click', () => { weather.overlay.hidden = true; cancelAnimationFrame(wxAnim); });
  focus.stop.addEventListener('click', () => endFocus(false));
  focus.pause.addEventListener('click', () => {
    if (!focusState) return;
    if (focusState.paused) { focusState.end = Date.now() + focusState.left; focusState.paused = false; focus.pause.textContent = 'Pause'; } else { focusState.left = focusState.end - Date.now(); focusState.paused = true; focus.pause.textContent = 'Weiter'; }
  });
}
