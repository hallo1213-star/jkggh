// Drohnen-Begleiter, Termin-Rakete, Schutzschild, Jarvis-Radio, Geschenk-Box.
import { startFocus } from './visuals.js';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let deps = { toast: () => {}, level: () => 0, addShopping: () => {}, result: () => {} };
const euro = (n) => `${Number(n).toLocaleString('de-DE', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const closeOthers = (me) => document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: me }));

let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); return audio; }
function tone(freq, dur = 0.15, type = 'sine', vol = 0.12, delay = 0, to = freq) {
  try {
    const a = ac(); const t = a.currentTime + delay;
    const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch { /* no audio */ }
}

// =========================================================================================
// 1. Drone
// =========================================================================================
const drone = { el: null, x: 0, y: 0, tx: 0, ty: 0, vx: 0, raf: 0, mode: 'follow', buzz: null };
function droneBuzz(on) {
  try {
    if (on && !drone.buzz) {
      const a = ac();
      const o = a.createOscillator(); const lfo = a.createOscillator(); const lg = a.createGain(); const g = a.createGain(); const f = a.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 180; lfo.frequency.value = 37; lg.gain.value = 18; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0.018;
      lfo.connect(lg).connect(o.frequency); o.connect(f).connect(g).connect(a.destination); o.start(); lfo.start();
      drone.buzz = { o, lfo, g };
    } else if (!on && drone.buzz) {
      const { o, lfo, g } = drone.buzz; const a = ac();
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.4); o.stop(a.currentTime + 0.45); lfo.stop(a.currentTime + 0.45);
      drone.buzz = null;
    }
  } catch { /* no audio */ }
}
function droneLoop(now) {
  drone.raf = requestAnimationFrame(droneLoop);
  const bob = Math.sin(now / 380) * 6;
  const k = drone.mode === 'follow' ? 0.06 : 0.035;
  const nx = drone.x + (drone.tx - drone.x) * k;
  drone.vx = nx - drone.x;
  drone.x = nx;
  drone.y += (drone.ty - drone.y) * k;
  drone.el.style.transform = `translate(${drone.x - 60}px, ${drone.y - 30 + bob}px) rotate(${Math.max(-18, Math.min(18, drone.vx * 1.4))}deg)`;
}
function onPointer(e) {
  if (drone.mode !== 'follow') return;
  const p = e.touches ? e.touches[0] : e;
  drone.tx = p.clientX + 70;
  drone.ty = p.clientY - 60;
}
function startDrone() {
  if (drone.el) return;
  const d = el('div', 'drone');
  d.innerHTML = '<span class="drone-arm a1"></span><span class="drone-arm a2"></span><span class="drone-rotor r1"></span><span class="drone-rotor r2"></span><span class="drone-rotor r3"></span><span class="drone-rotor r4"></span><span class="drone-body"><i class="drone-cam"></i><i class="drone-led l"></i><i class="drone-led r"></i></span><span class="drone-shadow"></span>';
  document.body.append(d);
  drone.el = d;
  drone.x = innerWidth / 2; drone.y = innerHeight + 80;
  drone.tx = innerWidth * 0.7; drone.ty = innerHeight * 0.3;
  drone.mode = 'follow';
  addEventListener('pointermove', onPointer);
  addEventListener('touchmove', onPointer, { passive: true });
  droneBuzz(true);
  drone.raf = requestAnimationFrame(droneLoop);
}
function stopDrone() {
  if (!drone.el) return;
  drone.mode = 'land';
  drone.ty = innerHeight + 120;
  droneBuzz(false);
  removeEventListener('pointermove', onPointer);
  removeEventListener('touchmove', onPointer);
  const d = drone.el;
  setTimeout(() => { cancelAnimationFrame(drone.raf); d.remove(); if (drone.el === d) drone.el = null; }, 1800);
}
function droneFetch() {
  startDrone();
  drone.mode = 'away';
  drone.tx = innerWidth + 200;
  drone.ty = innerHeight * 0.2;
}
function droneDeliver(items) {
  startDrone();
  drone.mode = 'away';
  drone.x = -150; drone.y = innerHeight * 0.25;
  drone.tx = innerWidth * 0.5; drone.ty = innerHeight * 0.28;
  const card = el('div', 'drone-card');
  card.append(el('small', '', '🛸 DROHNEN-LIEFERUNG · NACHRICHTEN'));
  const list = el('ol');
  for (const item of items || []) {
    const li = el('li');
    if (item.link) { const a = el('a', '', item.titel); a.href = item.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a); } else li.textContent = item.titel;
    list.append(li);
  }
  const ok = el('button', '', 'Danke, Drohne');
  ok.type = 'button';
  ok.addEventListener('click', () => { card.classList.add('out'); setTimeout(() => card.remove(), 400); drone.mode = 'follow'; });
  card.append(list, ok);
  setTimeout(() => { document.body.append(card); tone(880, 0.12, 'triangle'); tone(1320, 0.2, 'triangle', 0.1, 0.1); drone.ty = innerHeight * 0.12; }, 1600);
}

document.addEventListener('jarvis-overlay', () => { document.querySelectorAll('.drone-card').forEach((c) => { c.classList.add('out'); setTimeout(() => c.remove(), 400); }); if (drone.mode === 'away') drone.mode = 'follow'; });

// =========================================================================================
// 2. Appointment rocket
// =========================================================================================
let rocketTimer = null;
function openRocket(appt) {
  closeOthers('rocket');
  document.querySelector('.rocket-overlay')?.remove();
  clearInterval(rocketTimer);
  const at = new Date(`${appt.date}T${appt.time || '00:00'}:00`);
  const root = el('div', 'rocket-overlay');
  root.innerHTML = `<div class="rocket-stars"></div>
    <header class="rocket-top"><p>JARVIS · TERMIN-RAKETE</p><button type="button" class="rocket-x" aria-label="Schließen">✕</button></header>
    <div class="rocket-info"><small>NÄCHSTE MISSION</small><b></b><span></span><div class="rocket-count"></div><button type="button" class="rocket-go">Testlauf: Rakete starten</button></div>
    <div class="rocket-scene"><div class="rocket"><svg viewBox="0 0 80 200" aria-hidden="true"><defs><linearGradient id="rkb" x1="0" x2="1"><stop offset="0" stop-color="#9aa3ad"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#7c8590"/></linearGradient></defs><path d="M40 4 C58 26 62 60 62 120 L62 160 L18 160 L18 120 C18 60 22 26 40 4 Z" fill="url(#rkb)"/><path d="M40 4 C50 16 55 30 57 44 L23 44 C25 30 30 16 40 4 Z" fill="#e3232f"/><circle cx="40" cy="78" r="11" fill="#1a2a3a" stroke="#c9d1d9" stroke-width="4"/><circle cx="36" cy="74" r="3" fill="#7fd3ff"/><path d="M18 128 L2 168 L18 160 Z" fill="#e3232f"/><path d="M62 128 L78 168 L62 160 Z" fill="#e3232f"/><rect x="26" y="160" width="28" height="10" fill="#3b4148"/></svg><span class="rocket-flame"></span></div><div class="rocket-tower"></div><div class="rocket-pad"></div><div class="rocket-smoke"></div></div>`;
  root.querySelector('.rocket-info b').textContent = appt.title;
  root.querySelector('.rocket-info span').textContent = `${at.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}${appt.time ? ` · ${appt.time} Uhr` : ' · ganztägig'}`;
  document.body.append(root);
  const count = root.querySelector('.rocket-count');
  const launch = (testRun) => {
    if (root.classList.contains('launch')) return;
    let n = 10;
    root.classList.add('final');
    clearInterval(rocketTimer);
    count.textContent = `T-${n}`;
    tone(700, 0.1, 'square', 0.08);
    rocketTimer = setInterval(() => {
      n -= 1;
      if (n > 0) { count.textContent = `T-${n}`; tone(n <= 3 ? 1100 : 700, 0.1, 'square', 0.08); return; }
      clearInterval(rocketTimer);
      count.textContent = testRun ? 'ABHEBEN! (Testlauf)' : 'ABHEBEN!';
      root.classList.add('launch');
      tone(60, 3, 'sawtooth', 0.25, 0, 30);
      setTimeout(() => { root.classList.add('out'); setTimeout(() => root.remove(), 600); }, 4200);
    }, 1000);
  };
  const tick = () => {
    const ms = at - Date.now();
    if (ms <= 10_000) { launch(false); return; }
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    count.textContent = `${d ? `${d} T ` : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  tick();
  rocketTimer = setInterval(tick, 1000);
  root.querySelector('.rocket-go').addEventListener('click', () => launch(true));
  root.querySelector('.rocket-x').addEventListener('click', () => { clearInterval(rocketTimer); root.remove(); });
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'rocket') { const r = document.querySelector('.rocket-overlay'); if (r && !r.classList.contains('launch')) { clearInterval(rocketTimer); r.remove(); } } });

// =========================================================================================
// 4. Shield
// =========================================================================================
function shieldUp(minutes) {
  if (document.querySelector('.shield')) return;
  const s = el('div', 'shield');
  s.innerHTML = '<div class="shield-hex"></div><div class="shield-edge"></div><p class="shield-label">🛡️ SCHUTZSCHILD AKTIV · FOKUS</p>';
  document.body.append(s);
  document.body.classList.add('shield-on');
  tone(200, 0.8, 'sawtooth', 0.12, 0, 900);
  tone(1200, 0.5, 'sine', 0.08, 0.3);
  requestAnimationFrame(() => s.classList.add('up'));
  const ripple = (e) => {
    const r = el('span', 'shield-ripple');
    r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`;
    s.append(r); setTimeout(() => r.remove(), 900);
    tone(500, 0.2, 'triangle', 0.05, 0, 300);
  };
  s.ripple = ripple;
  addEventListener('pointerdown', ripple);
  startFocus({ minutes, label: 'Schutzschild' }).catch?.(() => {});
}
function shieldDown() {
  const s = document.querySelector('.shield');
  if (!s) return;
  removeEventListener('pointerdown', s.ripple);
  document.body.classList.remove('shield-on');
  tone(1800, 0.6, 'square', 0.08, 0, 200);
  for (let i = 0; i < 26; i += 1) {
    const shard = el('span', 'shield-shard');
    shard.style.left = `${Math.random() * 100}%`; shard.style.top = `${Math.random() * 100}%`;
    shard.style.setProperty('--dx', `${(Math.random() - 0.5) * 400}px`); shard.style.setProperty('--dy', `${200 + Math.random() * 400}px`); shard.style.setProperty('--r', `${(Math.random() - 0.5) * 720}deg`);
    s.append(shard);
  }
  s.classList.add('break');
  setTimeout(() => s.remove(), 1300);
  document.querySelector('.focus-overlay .focus-stop, #focus-stop')?.click();
}

// =========================================================================================
// 6. Radio
// =========================================================================================
const radio = { root: null, raf: 0, timer: null };
function jingle() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.12)); }
function radioStart(items, source) {
  closeOthers('radio');
  radioStop(true);
  const root = el('div', 'radio-overlay');
  root.innerHTML = `<header class="radio-top"><p>JARVIS FM · 88,8</p><button type="button" class="radio-x" aria-label="Radio aus">✕</button></header>
    <div class="radio-studio">
      <div class="radio-onair"><span>ON AIR</span></div>
      <div class="radio-mic"><span class="radio-mic-head"></span><span class="radio-mic-arm"></span></div>
      <div class="radio-eq"></div>
      <ol class="radio-list"></ol>
      <small class="radio-src"></small>
    </div>`;
  const eq = root.querySelector('.radio-eq');
  for (let i = 0; i < 28; i += 1) eq.append(el('i'));
  const list = root.querySelector('.radio-list');
  (items || []).forEach((it) => list.append(el('li', '', it.titel)));
  root.querySelector('.radio-src').textContent = `Quelle: ${source || 'Nachrichten-Feed'} · moderiert von Jarvis`;
  document.body.append(root);
  radio.root = root;
  jingle();
  let idx = 0;
  const highlight = () => { [...list.children].forEach((li, i) => li.classList.toggle('now', i === idx)); };
  highlight();
  radio.timer = setInterval(() => { if (document.body.dataset.mode === 'speaking') { idx = Math.min(list.children.length - 1, idx + 1); highlight(); } }, 7000);
  const bars = [...eq.children];
  const loop = (now) => {
    radio.raf = requestAnimationFrame(loop);
    const lvl = document.body.dataset.mode === 'speaking' ? deps.level() : 0.04;
    bars.forEach((b, i) => { const v = Math.max(0.06, Math.min(1, lvl * (0.6 + Math.abs(Math.sin(now / 140 + i * 0.7))) * 1.4)); b.style.transform = `scaleY(${v})`; });
  };
  radio.raf = requestAnimationFrame(loop);
  root.querySelector('.radio-x').addEventListener('click', () => radioStop());
}
function radioStop(quiet) {
  cancelAnimationFrame(radio.raf); clearInterval(radio.timer);
  if (!radio.root) return;
  const r = radio.root; radio.root = null;
  if (!quiet) [1046, 784, 523].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, i * 0.12));
  r.classList.add('out'); setTimeout(() => r.remove(), 500);
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'radio') radioStop(true); });

// =========================================================================================
// 8. Gift box
// =========================================================================================
function giftStart() {
  closeOthers('gift');
  document.querySelector('.gift-overlay')?.remove();
  const root = el('div', 'gift-overlay');
  root.innerHTML = `<header class="gift-top"><p>JARVIS · GESCHENK-BOX</p><button type="button" class="gift-x" aria-label="Schließen">✕</button></header>
    <div class="gift-stage"><div class="gift-box"><span class="gift-lid"><i class="gift-bow"></i></span><span class="gift-body"></span><span class="gift-ribbon"></span></div><p class="gift-status">Jarvis packt Ideen ein …</p></div>
    <div class="gift-cards"></div>`;
  root.querySelector('.gift-x').addEventListener('click', () => root.remove());
  document.body.append(root);
  return root;
}
function giftOpen(gifts) {
  const root = document.querySelector('.gift-overlay') || giftStart();
  root.classList.add('open');
  root.querySelector('.gift-status').textContent = `${gifts.ideen.length} Ideen${gifts.fuer ? ` für ${gifts.fuer}` : ''}${gifts.budget ? ` · bis ${gifts.budget} €` : ''}`;
  [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, 0.25 + i * 0.08));
  const cards = root.querySelector('.gift-cards');
  gifts.ideen.forEach((g, i) => {
    const c = el('div', 'gift-card');
    c.style.animationDelay = `${0.7 + i * 0.15}s`;
    const pic = el('div', 'gift-pic');
    const img = new Image(); img.alt = g.name; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onload = () => pic.classList.add('ready'); img.onerror = () => pic.classList.add('failed');
    img.src = g.bildUrl; pic.append(img);
    const add = el('button', '', '+ Einkaufsliste');
    add.type = 'button';
    add.addEventListener('click', () => { deps.addShopping(`${g.name}${g.preis ? ` (~${euro(g.preis)})` : ''}`); add.textContent = '✓ Notiert'; add.disabled = true; });
    c.append(pic, el('b', '', g.name), el('em', '', g.preis ? `~${euro(g.preis)}` : 'Preis offen'), el('p', '', g.warum), el('small', '', g.wo ? `Gibt's z. B.: ${g.wo}` : ''), add);
    cards.append(c);
  });
}
function giftError(message) {
  const root = document.querySelector('.gift-overlay') || giftStart();
  root.querySelector('.gift-status').textContent = `Keine Ideen: ${message}`;
  root.classList.add('failed');
}

// =========================================================================================
export function initExtras(options) { deps = { ...deps, ...options }; }
export function handleExtrasMessage(message) {
  switch (message.type) {
    case 'drone':
      if (message.action === 'start') startDrone();
      else if (message.action === 'stopp') stopDrone();
      else if (message.action === 'fetch') droneFetch();
      else if (message.action === 'deliver') droneDeliver(message.items);
      break;
    case 'rocket': openRocket(message.appointment); break;
    case 'shield': if (message.action === 'hoch') shieldUp(message.minutes); else shieldDown(); break;
    case 'radio': if (message.action === 'start') radioStart(message.items, message.source); else radioStop(); break;
    case 'gift':
      if (message.action === 'start') giftStart();
      else if (message.action === 'open') giftOpen(message.gifts);
      else giftError(message.error || 'Fehler');
      break;
    default:
  }
}
