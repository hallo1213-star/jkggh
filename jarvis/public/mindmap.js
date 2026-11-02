// Gedanken-Karte: animated mind map (SVG). Topic in the middle, branches grow
// out one by one, points follow. Saved as PNG.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
let root = null;
let audio = null;
function tone(f, d, v = 0.06, delay = 0) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime + delay; const o = audio.createOscillator(); const g = audio.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.05); } catch { /* no audio */ } }

function wrap(text, max = 16) {
  const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; } else line = `${line} ${w}`.trim(); }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
function label(g, x, y, text, cls, max) {
  const lines = wrap(text, max);
  const t = sv('text', { x, y: y - (lines.length - 1) * 9, class: cls, 'text-anchor': 'middle' });
  lines.forEach((l, i) => { const ts = sv('tspan', { x, dy: i ? 18 : 0 }); ts.textContent = l; t.append(ts); });
  g.append(t);
  return t;
}

function render(map, added) {
  const svg = root.querySelector('svg');
  svg.replaceChildren();
  const W = 1200; const H = 800; const cx = W / 2; const cy = H / 2;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const defs = sv('defs');
  defs.innerHTML = '<filter id="mmglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="mmcore"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ff5c6c"/><stop offset="1" stop-color="#5a0010"/></radialGradient>';
  svg.append(defs);
  const n = map.aeste.length;
  const center = sv('g', { class: 'mm-center' });
  center.append(sv('circle', { cx, cy, r: 92, fill: 'url(#mmcore)', filter: 'url(#mmglow)', class: 'mm-core' }), sv('circle', { cx, cy, r: 108, class: 'mm-ring' }));
  label(center, cx, cy + 6, map.thema, 'mm-title', 14);
  svg.append(center);
  let delay = 0.5;
  map.aeste.forEach((b, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const bx = cx + Math.cos(a) * 270; const by = cy + Math.sin(a) * 215;
    const g = sv('g', { class: `mm-branch${added && b.text === added ? ' mm-new' : ''}`, style: `--d:${delay}s` });
    const path = sv('path', { d: `M${cx + Math.cos(a) * 100} ${cy + Math.sin(a) * 100} Q ${cx + Math.cos(a) * 190} ${cy + Math.sin(a) * 150} ${bx} ${by}`, class: 'mm-line' });
    g.append(path, sv('rect', { x: bx - 78, y: by - 26, width: 156, height: 52, rx: 26, class: 'mm-node' }));
    label(g, bx, by + 6, b.text, 'mm-branch-text', 16);
    svg.append(g);
    setTimeout(() => tone(440 + i * 70, 0.25), delay * 1000);
    delay += 0.35;
    const k = b.kinder.length;
    b.kinder.forEach((kid, j) => {
      const spread = Math.min(1.1, 0.42 * (k - 1));
      const ka = a + (k > 1 ? (j / (k - 1) - 0.5) * spread : 0);
      const kx = bx + Math.cos(ka) * 150; const ky = by + Math.sin(ka) * 105;
      const kg = sv('g', { class: `mm-kid${added && kid === added ? ' mm-new' : ''}`, style: `--d:${delay}s` });
      kg.append(sv('line', { x1: bx + Math.cos(ka) * 60, y1: by + Math.sin(ka) * 24, x2: kx, y2: ky, class: 'mm-kline' }), sv('circle', { cx: kx, cy: ky, r: 5, class: 'mm-dot' }));
      label(kg, kx, ky + (Math.sin(ka) >= 0 ? 24 : -14), kid, 'mm-kid-text', 18);
      svg.append(kg);
      delay += 0.12;
    });
  });
}

function savePng() {
  const svg = root.querySelector('svg');
  const css = `text{font-family:Inter,Arial,sans-serif}.mm-title{fill:#fff;font-size:24px;font-weight:900}.mm-branch-text{fill:#fff;font-size:17px;font-weight:800}.mm-kid-text{fill:#ffd0d4;font-size:15px}.mm-line,.mm-kline{fill:none;stroke:#ff2a3d;stroke-width:3}.mm-kline{stroke-width:1.5;opacity:.7}.mm-node{fill:#1a0306;stroke:#ff2a3d;stroke-width:2}.mm-ring{fill:none;stroke:#ff2a3d;stroke-width:2;opacity:.6}.mm-dot{fill:#ff5c6c}`;
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', NS); clone.setAttribute('width', 2400); clone.setAttribute('height', 1600);
  const style = document.createElementNS(NS, 'style'); style.textContent = css; clone.prepend(style);
  const bg = sv('rect', { width: '100%', height: '100%', fill: '#070203' }); clone.insertBefore(bg, style.nextSibling);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1600; c.getContext('2d').drawImage(img, 0, 0, 2400, 1600); c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'jarvis-gedankenkarte.png'; a.click(); }, 'image/png'); };
  img.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
}

export function showMindmap(map, added = '') {
  if (!root) {
    document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'mindmap' }));
    root = el('div', 'mm');
    root.innerHTML = '<header class="mm-top"><p>JARVIS · GEDANKEN-KARTE</p><div><button type="button" class="mm-save">💾 Als Bild</button><button type="button" class="mm-x" aria-label="Schließen">✕</button></div></header><div class="mm-stage"><svg role="img" aria-label="Gedanken-Karte"></svg></div><p class="mm-hint">Sag „Füg … hinzu“, um die Karte zu erweitern.</p>';
    root.querySelector('.mm-x').addEventListener('click', closeMindmap);
    root.querySelector('.mm-save').addEventListener('click', savePng);
    document.body.append(root);
  }
  render(map, added);
}
export function closeMindmap() { root?.remove(); root = null; }
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'mindmap') closeMindmap(); });
