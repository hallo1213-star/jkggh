// Persona switch, day recap (end credits), coin & dice, satellite zoom HUD and
// Jarvis' level system. Everything shown is real (actions of today, true random
// numbers from the server, XP only for actions that really finished).
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let deps = { toast: () => {}, send: () => {} };
const closeOthers = (me) => document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: me }));

let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); return audio; }
function tone(f, dur, type = 'sine', vol = 0.12, delay = 0, to = f) {
  try { const a = ac(); const t = a.currentTime + delay; const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ }
}

// =========================================================================================
// Persona
// =========================================================================================
export const PERSONAS = { friday: { name: 'FRIDAY', color: '#ffb020', rgb: [255, 176, 32] }, party: { name: 'PARTY-JARVIS', color: '#c026ff', rgb: [192, 38, 255] }, butler: { name: 'BUTLER', color: '#d4af37', rgb: [212, 175, 55] } };
export function personaColor() { return PERSONAS[document.body.dataset.persona]?.rgb || null; }
function switchPersona(mode) {
  const p = PERSONAS[mode];
  const fx = el('div', 'persona-fx');
  fx.style.setProperty('--c', p?.color || '#ff2a3d');
  fx.innerHTML = `<div class="persona-ring"></div><div class="persona-ring r2"></div><b class="persona-name">${p ? p.name : 'JARVIS'}</b><small>${p ? 'MODUS AKTIVIERT' : 'NORMALER MODUS'}</small>`;
  document.body.append(fx);
  [392, 523, 659, 784].forEach((f, i) => tone(mode === 'party' ? f * 1.5 : f, 0.35, 'triangle', 0.09, i * 0.09));
  setTimeout(() => { if (p) document.body.dataset.persona = mode; else delete document.body.dataset.persona; }, 700);
  setTimeout(() => fx.classList.add('out'), 2200);
  setTimeout(() => fx.remove(), 2900);
}

// =========================================================================================
// Action log + level system (fed by the HUD for every action that really finished)
// =========================================================================================
const LOG_KEY = () => `jarvis.log.${new Date().toISOString().slice(0, 10)}`;
const LEVEL_KEY = 'jarvis.level';
export const levelNeed = (level) => 40 + level * 40;
function readLevel() { try { const v = JSON.parse(localStorage.getItem(LEVEL_KEY) || 'null'); return v && v.level ? v : { level: 1, xp: 0 }; } catch { return { level: 1, xp: 0 }; } }
function saveLevel(v) { try { localStorage.setItem(LEVEL_KEY, JSON.stringify(v)); } catch { /* ignore */ } document.body.dataset.level = String(v.level); renderBadge(); deps.send({ type: 'level_state', level: v.level, xp: v.xp, next: levelNeed(v.level) }); }
export function levelState() { const v = readLevel(); return { type: 'level_state', level: v.level, xp: v.xp, next: levelNeed(v.level) }; }

export function logAction(label, state) {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY()) || '[]');
    list.push({ t: Date.now(), label: String(label).slice(0, 80), state });
    localStorage.setItem(LOG_KEY(), JSON.stringify(list.slice(-300)));
  } catch { /* ignore */ }
  if (state === 'done') addXp(10);
}

function addXp(n) {
  const v = readLevel();
  v.xp += n;
  let up = false;
  while (v.xp >= levelNeed(v.level)) { v.xp -= levelNeed(v.level); v.level += 1; up = true; }
  saveLevel(v);
  if (up) levelUp(v.level);
}
const UNLOCKS = { 2: 'Zweiter Reaktor-Ring', 3: 'Drehende Energie-Bögen', 4: 'Dritter Reaktor-Ring', 5: 'Goldener Kern', 6: 'Funken-Aura', 8: 'Vierter Reaktor-Ring', 10: 'Legendärer Reaktor' };
function levelUp(level) {
  const fx = el('div', 'level-fx');
  fx.innerHTML = `<div class="level-burst"></div><div class="level-ring"></div><div class="level-ring r2"></div><small>LEVEL UP</small><b>LEVEL ${level}</b><span></span>`;
  fx.querySelector('span').textContent = UNLOCKS[level] ? `Freigeschaltet: ${UNLOCKS[level]}` : 'Jarvis wird stärker.';
  for (let i = 0; i < 40; i += 1) { const s = el('i', 'level-spark'); s.style.setProperty('--a', `${Math.random() * 360}deg`); s.style.setProperty('--d', `${120 + Math.random() * 260}px`); s.style.animationDelay = `${Math.random() * 0.3}s`; fx.append(s); }
  document.body.append(fx);
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.4, 'triangle', 0.1, i * 0.1));
  tone(80, 1, 'sawtooth', 0.12, 0, 40);
  setTimeout(() => fx.classList.add('out'), 3000);
  setTimeout(() => fx.remove(), 3700);
}
function renderBadge() {
  const v = readLevel();
  let badge = document.getElementById('level-badge');
  const host = document.querySelector('section.core');
  if (!host) return;
  if (!badge) { badge = el('button', 'level-badge'); badge.id = 'level-badge'; badge.type = 'button'; badge.addEventListener('click', showLevel); host.append(badge); }
  const need = levelNeed(v.level);
  badge.innerHTML = '';
  const bar = el('i'); bar.style.setProperty('--p', `${Math.round((v.xp / need) * 100)}%`);
  badge.append(el('b', '', `LVL ${v.level}`), bar, el('small', '', `${v.xp}/${need} XP`));
}
function showLevel() {
  closeOthers('level');
  document.querySelector('.level-card')?.remove();
  const v = readLevel();
  const card = el('div', 'level-card');
  const list = el('ul');
  Object.entries(UNLOCKS).forEach(([lv, text]) => { const li = el('li', Number(lv) <= v.level ? 'on' : '', `Level ${lv}: ${text}`); list.append(li); });
  const x = el('button', 'recap-x', '✕'); x.type = 'button'; x.addEventListener('click', () => card.remove());
  const bar = el('i'); bar.style.setProperty('--p', `${Math.round((v.xp / levelNeed(v.level)) * 100)}%`);
  card.append(x, el('small', '', 'JARVIS-LEVEL'), el('b', '', `LEVEL ${v.level}`), bar, el('p', '', `${v.xp} von ${levelNeed(v.level)} XP bis Level ${v.level + 1} · 10 XP pro erledigter Aufgabe`), list);
  document.body.append(card);
}

// =========================================================================================
// Day recap as end credits
// =========================================================================================
function recap() {
  closeOthers('recap');
  let list = [];
  try { list = JSON.parse(localStorage.getItem(LOG_KEY()) || '[]'); } catch { /* ignore */ }
  const done = list.filter((a) => a.state === 'done');
  const failed = list.filter((a) => a.state === 'error');
  const root = el('div', 'recap');
  const roll = el('div', 'recap-roll');
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  roll.append(el('small', '', 'JARVIS STUDIOS PRÄSENTIERT'), el('h2', '', 'EIN TAG MIT JARVIS'), el('p', 'recap-date', date));
  const cast = el('div', 'recap-block');
  cast.append(el('h3', '', 'IN DEN HAUPTROLLEN'), el('p', '', 'Du · als der Boss'), el('p', '', 'Jarvis · als er selbst'));
  roll.append(cast);
  const acts = el('div', 'recap-block');
  acts.append(el('h3', '', done.length ? 'HEUTE ERLEDIGT' : 'HEUTE ERLEDIGT'));
  if (done.length) done.forEach((a) => { const p = el('p'); p.append(el('span', '', new Date(a.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })), document.createTextNode(` ${a.label}`)); acts.append(p); });
  else acts.append(el('p', '', 'Noch nichts – der Tag ist jung.'));
  roll.append(acts);
  const stats = el('div', 'recap-block');
  const v = readLevel();
  stats.append(el('h3', '', 'STATISTIK'), el('p', '', `${done.length} Aufgaben erledigt`), el('p', '', `${failed.length} Probleme ehrlich gemeldet`), el('p', '', `Jarvis-Level ${v.level}`));
  roll.append(stats, el('p', 'recap-end', 'ENDE'), el('small', 'recap-post', '… oder doch nicht? Bis morgen, Boss.'));
  const x = el('button', 'recap-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Schließen');
  root.append(roll, x);
  document.body.append(root);
  const dur = Math.max(18, 10 + done.length * 1.2);
  roll.style.animationDuration = `${dur}s`;
  const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]];
  let i = 0;
  const play = () => { chords[i % 4].forEach((f) => tone(f, 3.6, 'triangle', 0.05)); i += 1; };
  play();
  const music = setInterval(play, 3500);
  const end = () => { clearInterval(music); root.classList.add('out'); setTimeout(() => root.remove(), 600); };
  x.addEventListener('click', end);
  setTimeout(end, dur * 1000 + 1500);
  root.end = end;
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'recap') document.querySelector('.recap')?.end?.(); });
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'level') document.querySelector('.level-card')?.remove(); });

// =========================================================================================
// Coin & dice (results come from the server's true random numbers)
// =========================================================================================
const DICE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
function pips(n) { const pos = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n]; return Array.from({ length: 9 }, (_, i) => `<i${pos.includes(i + 1) ? ' class="on"' : ''}></i>`).join(''); }
function toss(message) {
  document.querySelector('.level-card')?.remove();
  document.querySelector('.toss')?.remove();
  const root = el('div', 'toss');
  if (message.kind === 'muenze') {
    const heads = message.result === 'Kopf';
    root.innerHTML = `<div class="coin-wrap"><div class="coin" style="--end:${heads ? 0 : 180}deg"><span class="coin-face kopf">KOPF<small>J</small></span><span class="coin-face zahl">ZAHL<small>1</small></span></div><div class="coin-shadow"></div></div><b class="toss-result"></b>`;
    root.querySelector('.toss-result').textContent = message.result.toUpperCase();
    tone(1800, 0.1, 'triangle', 0.1); setTimeout(() => { tone(2400, 0.08, 'triangle', 0.12); tone(900, 0.2, 'sine', 0.08, 0.05); }, 1800);
  } else {
    root.innerHTML = `<div class="dice-row">${(message.dice || []).map((d, i) => { const [rx, ry] = DICE_ROT[d]; return `<div class="die-wrap" style="--i:${i}"><div class="die" style="--rx:${rx}deg;--ry:${ry}deg">${[1, 2, 3, 4, 5, 6].map((f) => `<span class="die-face f${f}">${pips(f)}</span>`).join('')}</div></div>`; }).join('')}</div><b class="toss-result"></b>`;
    const dice = message.dice || [];
    root.querySelector('.toss-result').textContent = dice.length > 1 ? `${dice.join(' + ')} = ${dice.reduce((a, b) => a + b, 0)}` : String(dice[0]);
    for (let k = 0; k < 6; k += 1) tone(300 + Math.random() * 300, 0.05, 'square', 0.06, k * 0.18);
  }
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('go'));
  root.addEventListener('click', () => root.remove());
  setTimeout(() => { root.classList.add('out'); setTimeout(() => root.remove(), 500); }, 6000);
}

// =========================================================================================
// Satellite zoom HUD (the globe flies to your location underneath)
// =========================================================================================
function satZoom() {
  closeOthers('satzoom');
  document.querySelector('.satzoom')?.remove();
  const root = el('div', 'satzoom');
  root.innerHTML = '<div class="sat-space"></div><div class="sat-cross"><i></i><i></i></div><div class="sat-ring"></div><p class="sat-top">SATELLIT JARVIS-1 · ZIEL WIRD ERFASST</p><p class="sat-coords">LAT --.---- · LON --.----</p><p class="sat-alt">HÖHE 35.786 km</p>';
  document.body.append(root);
  tone(900, 0.12, 'square', 0.06); tone(1200, 0.12, 'square', 0.06, 0.25);
  const coords = root.querySelector('.sat-coords'); const alt = root.querySelector('.sat-alt');
  let fixed = null;
  navigator.geolocation?.getCurrentPosition((p) => { fixed = p.coords; }, () => {}, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  const t0 = performance.now();
  const tick = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / 8000);
    alt.textContent = `HÖHE ${Math.round(35786 * (1 - k) ** 3 + 0.4).toLocaleString('de-DE')} km`;
    if (fixed && k > 0.5) { coords.textContent = `LAT ${fixed.latitude.toFixed(4)} · LON ${fixed.longitude.toFixed(4)}`; root.classList.add('locked'); }
    else coords.textContent = `LAT ${(Math.random() * 180 - 90).toFixed(4)} · LON ${(Math.random() * 360 - 180).toFixed(4)}`;
    if (k >= 1) { clearInterval(tick); root.querySelector('.sat-top').textContent = fixed ? 'ZIEL ERFASST' : 'STANDORT NICHT FREIGEGEBEN'; tone(1500, 0.3, 'triangle', 0.1); setTimeout(() => { root.classList.add('out'); setTimeout(() => root.remove(), 700); }, 2500); }
  }, 120);
}

// =========================================================================================
export function initFun(options) {
  deps = { ...deps, ...options };
  document.body.dataset.level = String(readLevel().level);
  renderBadge();
}
export function handleFunMessage(message) {
  switch (message.type) {
    case 'persona': switchPersona(message.mode); break;
    case 'recap': recap(); break;
    case 'toss': toss(message); break;
    case 'satzoom': satZoom(); break;
    case 'level': showLevel(); break;
    default:
  }
}
