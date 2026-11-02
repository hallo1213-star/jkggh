// Anzug-Labor + Jarvis' own suit. The suit is drawn as a vector graphic from the
// design the AI made (colours, helmet, shoulders). Jarvis can own one suit:
// "Zieh deinen Anzug an" plays the suit-up animation and the main screen shows
// Jarvis in his suit (the chest reactor is the live voice reactor);
// "Zieh den Anzug aus" plays the reverse animation.
const OWN_KEY = 'jarvis.suit';
const WORN_KEY = 'jarvis.suit.worn';
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const HEX = /^#[0-9a-f]{6}$/i;

let deps = { send: () => {}, toast: () => {}, result: () => {}, onClose: () => {} };
let ui = null;
let draft = null; // the suit currently shown in the lab

// --- storage --------------------------------------------------------------------------
export function ownedSuit() { try { const s = JSON.parse(localStorage.getItem(OWN_KEY) || 'null'); return s?.name ? s : null; } catch { return null; } }
export function suitWorn() { try { return Boolean(ownedSuit()) && localStorage.getItem(WORN_KEY) === 'true'; } catch { return false; } }
function setOwned(suit) { try { localStorage.setItem(OWN_KEY, JSON.stringify(suit)); } catch { /* ignore */ } sync(); }
function setWorn(on) { try { localStorage.setItem(WORN_KEY, String(on)); } catch { /* ignore */ } sync(); }
export function suitState() { const s = ownedSuit(); return { type: 'suit_state', owned: s ? s.name : null, worn: suitWorn() }; }
function sync() { deps.send(suitState()); }

// --- sounds ------------------------------------------------------------------------------
let audio = null;
function sound(kind) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const out = audio.createGain();
    out.gain.value = 0.16;
    out.connect(audio.destination);
    const tone = (f1, f2, start, dur, type = 'sine') => {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t + start); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + start + dur);
      g.gain.setValueAtTime(0.0001, t + start); g.gain.exponentialRampToValueAtTime(1, t + start + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(out); o.start(t + start); o.stop(t + start + dur + 0.05);
    };
    if (kind === 'clank') { tone(180, 60, 0, 0.18, 'square'); tone(2400, 900, 0, 0.08, 'triangle'); }
    else if (kind === 'charge') tone(120, 1400, 0, 1.2, 'sawtooth');
    else if (kind === 'ignite') { tone(80, 40, 0, 0.6, 'sawtooth'); tone(1800, 2400, 0.05, 0.5); }
    else if (kind === 'down') tone(1400, 90, 0, 1.0, 'sawtooth');
    else if (kind === 'scan') tone(900, 1300, 0, 0.12, 'triangle');
    else if (kind === 'stamp') { tone(300, 100, 0, 0.25, 'square'); tone(1200, 1200, 0.05, 0.3, 'triangle'); }
  } catch { /* no audio */ }
}

// --- drawing ---------------------------------------------------------------------------
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}
const HELMETS = {
  klassisch: { base: 'M118 30 Q150 6 182 30 L186 70 Q184 88 168 96 L132 96 Q116 88 114 70 Z', face: 'M126 44 Q150 36 174 44 L172 72 Q166 86 150 90 Q134 86 128 72 Z', visor: false },
  kantig: { base: 'M116 34 L134 14 L166 14 L184 34 L186 72 L170 96 L130 96 L114 72 Z', face: 'M126 42 L150 36 L174 42 L170 76 L150 90 L130 76 Z', visor: false },
  rund: { base: 'M114 52 Q114 12 150 12 Q186 12 186 52 L184 76 Q176 96 150 98 Q124 96 116 76 Z', face: 'M124 66 Q150 92 176 66 L174 80 Q150 100 126 80 Z', visor: true }
};

// Returns SVG markup; parts are <g data-part="…"> so they can be animated.
export function suitSvg(suit, { id = 's' } = {}) {
  const c = suit.farben || {};
  const main = HEX.test(c.haupt) ? c.haupt : '#b3121f';
  const accent = HEX.test(c.akzent) ? c.akzent : '#d4a64a';
  const glow = HEX.test(c.leuchten) ? c.leuchten : '#7ff3ff';
  const dark = shade(main, -0.75);
  const helm = HELMETS[suit.helm] || HELMETS.klassisch;
  const broad = suit.schulter !== 'schmal';
  const sh = broad ? 'M90 110 Q96 90 124 97 L130 122 Q110 130 88 134 Z' : 'M100 110 Q104 94 124 98 L128 120 Q114 126 98 128 Z';
  const side = (inner) => `${inner}<g transform="translate(300 0) scale(-1 1)">${inner}</g>`;
  const eyes = helm.visor
    ? `<path d="M122 48 Q150 40 178 48 L176 62 Q150 55 124 62 Z" fill="${glow}" filter="url(#${id}g)" class="suit-eye"/>`
    : side(`<path d="M132 54 L146 57 L145 61 L133 59 Z" fill="${glow}" filter="url(#${id}g)" class="suit-eye"/>`);
  return `<svg class="suit-svg" viewBox="0 0 300 410" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anzug ${String(suit.name || '').replace(/[<>&"]/g, '')}">
  <defs>
    <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(main, 0.35)}"/><stop offset=".55" stop-color="${main}"/><stop offset="1" stop-color="${shade(main, -0.45)}"/></linearGradient>
    <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(accent, 0.4)}"/><stop offset=".6" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent, -0.4)}"/></linearGradient>
    <radialGradient id="${id}r"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${glow}"/><stop offset="1" stop-color="${shade(glow, -0.5)}"/></radialGradient>
    <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g data-part="antrieb" class="suit-thrust">${side(`<ellipse cx="134" cy="401" rx="11" ry="4" fill="${glow}" opacity=".75" filter="url(#${id}g)"/>`)}</g>
  <g data-part="beine">${side(`<path d="M122 252 L148 252 L146 316 L124 316 Z" fill="url(#${id}m)"/><circle cx="135" cy="323" r="8" fill="url(#${id}a)"/><path d="M122 331 L148 331 L146 380 L124 380 Z" fill="url(#${id}m)"/><path d="M130 337 L140 337 L139 372 L131 372 Z" fill="url(#${id}a)"/><path d="M118 380 L150 380 L152 397 L114 397 Z" fill="${dark}"/>`)}</g>
  <g data-part="brust"><rect x="138" y="92" width="24" height="12" fill="${dark}"/><path d="M120 100 L180 100 L196 120 L190 168 L172 186 L128 186 L110 168 L104 120 Z" fill="url(#${id}m)"/><path d="M128 108 L172 108 L184 124 L170 132 L130 132 L116 124 Z" fill="url(#${id}a)"/><path d="M128 188 L172 188 L168 238 L132 238 Z" fill="${dark}"/><rect x="134" y="192" width="32" height="12" rx="3" fill="url(#${id}m)"/><rect x="135" y="208" width="30" height="12" rx="3" fill="url(#${id}m)"/><rect x="136" y="224" width="28" height="10" rx="3" fill="url(#${id}m)"/><path d="M124 238 L176 238 L180 252 L120 252 Z" fill="url(#${id}a)"/></g>
  <g data-part="arme">${side(`<path d="M96 128 L118 126 L114 182 L94 184 Z" fill="url(#${id}m)"/><circle cx="104" cy="188" r="7" fill="${dark}"/><path d="M92 192 L116 190 L112 246 L94 248 Z" fill="url(#${id}a)"/><path d="M93 248 L113 248 L114 268 Q104 277 94 268 Z" fill="url(#${id}m)"/><circle cx="104" cy="262" r="4" fill="${glow}" filter="url(#${id}g)"/>`)}</g>
  <g data-part="schultern">${side(`<path d="${sh}" fill="url(#${id}m)"/><path d="${broad ? 'M96 112 Q102 100 120 103' : 'M104 112 Q108 102 120 104'}" stroke="${accent}" stroke-width="3" fill="none"/>`)}</g>
  <g data-part="helm"><path d="${helm.base}" fill="url(#${id}m)"/><path d="${helm.face}" fill="url(#${id}a)"/>${eyes}<path d="M140 79 L160 79" stroke="${dark}" stroke-width="2"/></g>
  <g data-part="reaktor"><circle cx="150" cy="148" r="17" fill="${dark}" stroke="url(#${id}a)" stroke-width="3"/><circle cx="150" cy="148" r="10" fill="url(#${id}r)" filter="url(#${id}g)" class="suit-core"/></g>
</svg>`;
}

// --- lab overlay ----------------------------------------------------------------------
function build() {
  if (ui) return ui;
  const root = el('div', 'suit-lab');
  root.hidden = true;
  root.innerHTML = `
    <header class="suit-top"><p><b>JARVIS</b> · ANZUG-LABOR</p><div><span class="suit-pill" data-k="status">BEREIT</span><button class="suit-x" type="button" aria-label="Anzug-Labor schließen">✕</button></div></header>
    <main class="suit-stage"></main>`;
  document.body.append(root);
  ui = { root, stage: root.querySelector('.suit-stage'), status: root.querySelector('[data-k="status"]') };
  root.querySelector('.suit-x').addEventListener('click', closeLab);
  return ui;
}
function closeQuiet() { if (ui && !ui.root.hidden) { ui.root.hidden = true; document.body.classList.remove('suit-lab-open'); } }
function openLabShell() { document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'suit' })); build(); ui.root.hidden = false; document.body.classList.add('suit-lab-open'); }
function closeLab() { if (!ui) return; ui.root.hidden = true; document.body.classList.remove('suit-lab-open'); deps.onClose(); }

function renderHome() {
  openLabShell();
  const own = ownedSuit();
  const box = el('section', 'suit-home');
  if (own) {
    const fig = el('div', 'suit-figure');
    fig.innerHTML = suitSvg(own, { id: 'home' });
    const info = el('div', 'suit-info');
    info.append(el('p', 'suit-kicker', 'MEIN ANZUG'), el('h2', 'suit-name', own.name), el('p', 'suit-motto', own.motto || ''));
    const row = el('div', 'suit-actions');
    const wear = el('button', 'suit-go', suitWorn() ? 'Anzug ausziehen' : 'Anzug anziehen');
    wear.type = 'button';
    wear.addEventListener('click', () => { closeLab(); if (suitWorn()) suitOff(); else suitOn(); });
    row.append(wear);
    info.append(row);
    box.append(fig, info);
  }
  const form = el('div', 'suit-form');
  form.append(el('p', 'suit-kicker', own ? 'NEUEN ANZUG ENTWERFEN' : 'ANZUG ENTWERFEN'));
  const input = el('input');
  input.placeholder = 'z. B. „Rot-Schwarz, kantiger Helm, schnell“';
  input.maxLength = 200;
  const go = el('button', 'suit-go', 'Entwerfen');
  go.type = 'button';
  const run = async () => {
    go.disabled = true;
    renderBuilding(input.value.trim());
    try {
      const r = await fetch('/api/suit/design', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: input.value.trim() }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
      renderDesign(data.suit, { askButtons: true });
    } catch (error) { renderError(error.message); }
  };
  go.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  form.append(input, go, el('p', 'suit-note', 'Oder sag: „Designe dir einen Anzug in Rot und Gold.“'));
  box.append(form);
  ui.stage.replaceChildren(box);
  ui.status.textContent = own ? (suitWorn() ? 'ANZUG AN' : 'ANZUG BEREIT') : 'KEIN ANZUG';
}

function renderBuilding(wish) {
  openLabShell();
  const box = el('section', 'suit-building');
  box.append(el('div', 'suit-scan'), el('p', 'suit-kicker', 'BAUPLAN WIRD ERSTELLT'), el('p', 'suit-motto', wish ? `„${wish}“` : 'Jarvis entwirft seinen Anzug …'));
  ui.stage.replaceChildren(box);
  ui.status.textContent = 'ENTWIRFT';
  sound('scan');
}

function renderError(message) {
  const box = el('section', 'suit-building');
  box.append(el('p', 'suit-kicker', 'FEHLER'), el('p', 'suit-error', message));
  const back = el('button', 'suit-go', 'Zurück');
  back.type = 'button';
  back.addEventListener('click', renderHome);
  box.append(back);
  ui.stage.replaceChildren(box);
  ui.status.textContent = 'FEHLER';
}

// Blueprint: the parts are drawn as lines one after another, then filled.
function renderDesign(suit, { askButtons = true } = {}) {
  openLabShell();
  draft = suit;
  const box = el('section', 'suit-design');
  const fig = el('div', 'suit-figure blueprint');
  fig.innerHTML = suitSvg(suit, { id: 'lab' });
  const side = el('div', 'suit-info');
  side.append(el('p', 'suit-kicker', 'ANZUG-LABOR · NEUER ENTWURF'), el('h2', 'suit-name', suit.name), el('p', 'suit-motto', suit.motto || ''));
  const parts = el('ol', 'suit-parts');
  suit.teile.forEach((p) => { const li = el('li'); li.append(el('b', '', p.teil), el('span', '', p.beschreibung || '')); parts.append(li); });
  const stats = el('div', 'suit-stats');
  suit.werte.forEach((w) => { const row = el('div', 'suit-stat'); const bar = el('i'); bar.style.setProperty('--w', `${w.wert}%`); row.append(el('span', '', w.label), el('b', '', String(w.wert)), bar); stats.append(row); });
  const abil = el('p', 'suit-abil', suit.faehigkeiten.length ? `Fähigkeiten: ${suit.faehigkeiten.join(' · ')}` : '');
  const render = el('div', 'suit-render');
  const img = new Image();
  img.alt = `KI-Bild von ${suit.name}`;
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => render.classList.add('ready'));
  img.addEventListener('error', () => render.classList.add('failed'));
  img.src = suit.bildUrl;
  render.append(img, el('small', '', 'KI-RENDER'));
  side.append(parts, stats, abil);
  box.append(fig, side, render);
  ui.stage.replaceChildren(box);
  ui.status.textContent = 'BAUT';
  const order = ['beine', 'brust', 'arme', 'schultern', 'helm', 'reaktor', 'antrieb'];
  order.forEach((part, i) => setTimeout(() => {
    fig.querySelector(`[data-part="${part}"]`)?.classList.add('built');
    parts.children[Math.min(i, parts.children.length - 1)]?.classList.add('in');
    sound(part === 'reaktor' ? 'ignite' : 'clank');
  }, 500 + i * 550));
  setTimeout(() => {
    stats.classList.add('in');
    fig.classList.remove('blueprint');
    ui.status.textContent = 'FERTIG';
    if (askButtons) ask(side);
  }, 500 + order.length * 550 + 200);
}

function ask(side) {
  const q = el('div', 'suit-ask');
  q.append(el('b', '', '„Soll ich den für mich benutzen?“'));
  const yes = el('button', 'suit-go', 'Ja');
  yes.type = 'button';
  const no = el('button', 'suit-ghost', 'Nein');
  no.type = 'button';
  yes.addEventListener('click', () => adopt(draft));
  no.addEventListener('click', () => { q.replaceChildren(el('span', 'suit-note', 'Okay, ich behalte ihn nicht.')); });
  q.append(yes, no);
  side.append(q);
}

function adopt(suit) {
  if (!suit) return;
  setOwned(suit);
  sound('stamp');
  const stamp = el('div', 'suit-stamp', 'ÜBERNOMMEN');
  ui?.stage.append(stamp);
  ui?.stage.querySelector('.suit-ask')?.replaceChildren(el('span', 'suit-note', 'Jetzt mein Anzug. Sag „Zieh deinen Anzug an“.'));
  if (ui) ui.status.textContent = 'MEIN ANZUG';
  deps.result({ title: `Anzug: ${suit.name}`, detail: 'gehört jetzt Jarvis', button: 'An / Aus', onClick: () => (suitWorn() ? suitOff() : suitOn()) });
}

// --- main screen: Jarvis in his suit --------------------------------------------------
function applyWorn() {
  const own = ownedSuit();
  const on = Boolean(own) && suitWorn();
  document.body.classList.toggle('suit-on', on);
  const wrap = document.querySelector('.reactor-wrap');
  let stage = document.getElementById('suit-stage');
  if (on && wrap) {
    if (!stage) { stage = el('div', 'suit-stage-main'); stage.id = 'suit-stage'; wrap.prepend(stage); }
    stage.innerHTML = suitSvg(own, { id: 'main' });
  } else stage?.remove();
  const intro = document.querySelector('.film-intro');
  let introSuit = document.getElementById('film-intro-suit');
  if (on && intro) {
    if (!introSuit) { introSuit = el('div', 'film-intro-suit'); introSuit.id = 'film-intro-suit'; intro.prepend(introSuit); }
    introSuit.innerHTML = suitSvg(own, { id: 'intro' });
  } else introSuit?.remove();
}

function cinematic(kind, own) {
  return new Promise((resolve) => {
    const fx = el('div', `suit-fx ${kind}`);
    fx.innerHTML = `<div class="suit-fx-flash"></div><div class="suit-fx-ring"></div><div class="suit-fx-fig">${suitSvg(own, { id: `fx${kind}` })}</div><p class="suit-fx-text">${kind === 'on' ? 'ANZUG WIRD ANGELEGT' : 'ANZUG WIRD ABGELEGT'}</p><div class="suit-fx-scan"></div>`;
    document.body.append(fx);
    const text = fx.querySelector('.suit-fx-text');
    const fig = fx.querySelector('.suit-fx-fig');
    const order = kind === 'on' ? ['beine', 'brust', 'arme', 'schultern', 'helm', 'reaktor', 'antrieb'] : ['antrieb', 'reaktor', 'helm', 'schultern', 'arme', 'brust', 'beine'];
    if (kind === 'on') fig.classList.add('assembling');
    requestAnimationFrame(() => fx.classList.add('run'));
    sound(kind === 'on' ? 'charge' : 'down');
    order.forEach((part, i) => setTimeout(() => {
      fig.querySelector(`[data-part="${part}"]`)?.classList.add(kind === 'on' ? 'in' : 'out');
      if (part === 'reaktor' && kind === 'on') { sound('ignite'); fx.classList.add('ignite'); } else sound('clank');
    }, 500 + i * 330));
    const end = 500 + order.length * 330;
    setTimeout(() => { text.textContent = kind === 'on' ? `${own.name} · ONLINE` : 'ANZUG ABGELEGT'; fx.classList.add('final'); }, end);
    setTimeout(() => { fx.classList.add('out'); resolve(); }, end + 1100);
    setTimeout(() => fx.remove(), end + 1900);
  });
}

export async function suitOn() {
  const own = ownedSuit();
  if (!own) { deps.toast('Jarvis hat noch keinen Anzug. Sag: „Designe dir einen Anzug.“', 'error'); return; }
  if (document.querySelector('.suit-fx')) return;
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx' }));
  const done = cinematic('on', own);
  setTimeout(() => { setWorn(true); applyWorn(); }, 500 + 7 * 330 + 300);
  await done;
}
export async function suitOff() {
  const own = ownedSuit();
  if (!own || document.querySelector('.suit-fx')) return;
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx' }));
  const done = cinematic('off', own);
  setTimeout(() => { setWorn(false); applyWorn(); }, 400);
  await done;
}

// --- public ---------------------------------------------------------------------------
export function initSuit(options) {
  deps = { ...deps, ...options };
  applyWorn();
}
export function openSuitLab() { renderHome(); }
export function handleSuitMessage(message) {
  if (message.action === 'design_start') renderBuilding(message.description || '');
  else if (message.action === 'design') renderDesign(message.suit, { askButtons: true });
  else if (message.action === 'own') { if (!ui || ui.root.hidden) renderDesign(message.suit, { askButtons: false }); adopt(message.suit); }
  else if (message.action === 'on' || message.action === 'off') {
    document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx' }));
    deps.onClose();
    if (message.action === 'on') suitOn(); else suitOff();
  }
}

// Only one big mode at a time: close when another one opens.
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'suit') closeQuiet(); });
