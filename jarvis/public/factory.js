// App-Fabrik: "Bau mir in 60 Sekunden eine App". Countdown, code rain while the
// AI writes, then the REAL code of the new app scrolls by and the app appears in
// a phone frame where you can use it right away. Timer = real elapsed time.
import { buildPreview } from './projects.js';

const LIMIT = 60;
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };

let ui = null;
let deps = { toast: () => {}, showProject: () => {}, result: () => {}, onClose: () => {} };
const job = { startedAt: 0, finishedAt: 0, timer: null, rain: null, project: null, description: '', timers: [] };

let audio = null;
function beep(freq = 880, dur = 0.12, type = 'square', vol = 0.12) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur + 0.02);
  } catch { /* no audio */ }
}

function build() {
  if (ui) return ui;
  const root = el('div', 'fab-overlay');
  root.hidden = true;
  root.innerHTML = `
    <header class="fab-top">
      <p><b>JARVIS</b> · APP-FABRIK</p>
      <div class="fab-top-right"><span class="fab-pill" data-k="status">BEREIT</span><button class="fab-x" type="button" aria-label="App-Fabrik schließen">✕</button></div>
    </header>
    <canvas class="fab-rain" aria-hidden="true"></canvas>
    <main class="fab-stage"></main>
    <footer class="fab-foot"><span class="fab-phase">BEREIT</span><div class="fab-bar"><span></span></div><span class="fab-clock">00:${LIMIT}</span></footer>`;
  document.body.append(root);
  ui = {
    root,
    stage: root.querySelector('.fab-stage'),
    rain: root.querySelector('.fab-rain'),
    phase: root.querySelector('.fab-phase'),
    status: root.querySelector('[data-k="status"]'),
    bar: root.querySelector('.fab-bar span'),
    clock: root.querySelector('.fab-clock')
  };
  root.querySelector('.fab-x').addEventListener('click', close);
  return ui;
}

function close() {
  if (!ui) return;
  ui.root.hidden = true;
  stopRain();
  document.body.classList.remove('fab-open');
  deps.onClose();
}
function closeQuiet() { if (ui && !ui.root.hidden) { ui.root.hidden = true; stopRain(); document.body.classList.remove('fab-open'); } }
function show() {
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fab' }));
  build();
  ui.root.hidden = false;
  document.body.classList.add('fab-open');
}
function setPhase(text, status) {
  ui.phase.textContent = text;
  if (status) ui.status.textContent = status;
}

function tick() {
  const secs = ((job.finishedAt || Date.now()) - job.startedAt) / 1000;
  const left = LIMIT - secs;
  ui.clock.textContent = left >= 0 ? `00:${String(Math.ceil(left)).padStart(2, '0')}` : `+00:${String(Math.floor(-left)).padStart(2, '0')}`;
  ui.clock.classList.toggle('over', left < 0);
  ui.bar.style.width = `${Math.min(100, (secs / LIMIT) * 100)}%`;
}

// --- code rain (decoration while the AI writes) --------------------------------------
function startRain() {
  stopRain();
  const c = ui.rain;
  const ctx = c.getContext('2d');
  const resize = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
  resize();
  const cols = () => Math.ceil(c.width / 16);
  let drops = Array.from({ length: cols() }, () => Math.random() * -50);
  const glyphs = '01<>{}()[];=+*/#$&ABCDEFxyz=>constletfunction'.split('');
  const loop = () => {
    if (c.width !== c.clientWidth) { resize(); drops = Array.from({ length: cols() }, () => Math.random() * -50); }
    ctx.fillStyle = 'rgba(5, 1, 2, 0.16)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = '15px monospace';
    drops.forEach((y, i) => {
      ctx.fillStyle = Math.random() > 0.96 ? '#ffd0d4' : `rgba(255, ${40 + Math.random() * 40}, 60, ${0.5 + Math.random() * 0.5})`;
      ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * 16, y * 16);
      drops[i] = y * 16 > c.height && Math.random() > 0.975 ? 0 : y + 1;
    });
    job.rain = requestAnimationFrame(loop);
  };
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) loop();
}
function stopRain() { cancelAnimationFrame(job.rain); job.rain = null; }

// --- screens ---------------------------------------------------------------------------
function phone(content) {
  const p = el('div', 'fab-phone');
  const screen = el('div', 'fab-screen');
  screen.append(content);
  p.append(el('span', 'fab-notch'), screen);
  return p;
}

function renderSetup() {
  const box = el('section', 'fab-setup');
  box.append(el('p', 'fab-kicker', 'APP-FABRIK'), el('h2', 'fab-title', 'Welche App soll ich in 60 Sekunden bauen?'));
  const input = el('input');
  input.placeholder = 'z. B. „ein Reaktions-Spiel mit Highscore“ oder „Taschengeld-Rechner“';
  input.maxLength = 300;
  const go = el('button', 'fab-go', 'Bauen');
  go.type = 'button';
  const run = () => { if (input.value.trim()) start(input.value.trim(), { fetch: true }); };
  go.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  box.append(input, go, el('p', 'fab-note', 'Oder sag einfach: „Bau mir in 60 Sekunden eine App für …“'));
  ui.stage.replaceChildren(box);
  ui.clock.textContent = `00:${LIMIT}`;
  ui.bar.style.width = '0%';
  setPhase('BEREIT', 'BEREIT');
  stopRain();
  setTimeout(() => input.focus(), 50);
}

function start(description, { fetch: doFetch = false } = {}) {
  show();
  job.timers.forEach(clearTimeout);
  job.timers = [];
  job.project = null;
  job.description = description;
  job.startedAt = Date.now();
  job.finishedAt = 0;
  clearInterval(job.timer);
  job.timer = setInterval(tick, 250);
  tick();
  const intro = el('section', 'fab-intro');
  intro.append(el('p', 'fab-kicker', 'BUILD-PROTOKOLL GESTARTET'), el('b', 'fab-count', '3'), el('p', 'fab-wish', `„${description}“`));
  ui.stage.replaceChildren(intro);
  setPhase('COUNTDOWN', 'START');
  beep(660);
  const count = intro.querySelector('.fab-count');
  [2, 1].forEach((n, i) => job.timers.push(setTimeout(() => { beep(660); count.textContent = String(n); count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop'); }, (i + 1) * 800)));
  job.timers.push(setTimeout(() => { beep(1320, 0.3, 'sawtooth'); startRain(); if (!job.project) renderWorking(); }, 2400));
  if (doFetch) {
    fetch('/api/project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: `${description}\n(Wichtig: muss auf dem Handy-Bildschirm gut bedienbar sein, Touch-Bedienung, modernes dunkles Design.)` }) })
      .then(async (r) => { const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`); return data.project; })
      .then(done)
      .catch((error) => fail(error.message));
  }
}

function renderWorking() {
  const box = el('section', 'fab-work');
  const log = el('ol', 'fab-log');
  for (const step of ['Auftrag verstanden', 'KI schreibt den Code …']) log.append(el('li', '', step));
  const wait = el('div', 'fab-wait');
  wait.append(el('span', 'fab-spinner'), el('small', '', 'Kompiliere …'));
  box.append(el('div', 'fab-code-col', ''), phone(wait));
  box.firstChild.append(el('p', 'fab-kicker', 'LIVE-PROTOKOLL'), log, el('p', 'fab-note', 'Die echte App erscheint, sobald die KI fertig ist.'));
  ui.stage.replaceChildren(box);
  setPhase('KI SCHREIBT CODE', 'BAUT');
}

function done(project) {
  if (!project) return;
  job.project = project;
  job.finishedAt = Date.now();
  clearInterval(job.timer);
  tick();
  const wait = Math.max(0, 2400 - (job.finishedAt - job.startedAt));
  job.timers.push(setTimeout(() => reveal(project), wait));
}

function reveal(project) {
  const box = el('section', 'fab-work');
  const col = el('div', 'fab-code-col');
  const code = el('pre', 'fab-code');
  const source = project.files.map((f) => `// ${f.path}\n${f.content}`).join('\n\n').slice(0, 9000);
  col.append(el('p', 'fab-kicker', `ECHTER CODE · ${project.files.length} DATEI(EN)`), code);
  const frame = el('iframe', 'fab-frame');
  frame.title = project.title;
  frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
  const shell = phone(frame);
  shell.classList.add('booting');
  box.append(col, shell);
  ui.stage.replaceChildren(box);
  setPhase('CODE WIRD ÜBERTRAGEN', 'BAUT');
  // Type the real code quickly, then boot the app inside the phone.
  let i = 0;
  const step = Math.max(40, Math.ceil(source.length / 60));
  const type = () => {
    i = Math.min(source.length, i + step);
    code.textContent = source.slice(0, i);
    code.scrollTop = code.scrollHeight;
    if (i % (step * 6) < step) beep(1600 + Math.random() * 400, 0.03, 'square', 0.04);
    if (i < source.length) job.timers.push(setTimeout(type, 30));
    else boot();
  };
  const boot = () => {
    stopRain();
    frame.srcdoc = buildPreview(project);
    shell.classList.remove('booting');
    shell.classList.add('live');
    beep(523, 0.2, 'triangle'); setTimeout(() => beep(784, 0.3, 'triangle'), 120);
    const secs = Math.round((job.finishedAt - job.startedAt) / 1000);
    const end = el('div', 'fab-done');
    end.append(el('b', '', 'APP FERTIG'), el('span', '', `${project.title} · in ${secs} Sekunden${secs > LIMIT ? ' (über dem Zeitlimit)' : ''}`));
    const open = el('button', 'fab-go', 'In der Werkstatt öffnen');
    open.type = 'button';
    open.addEventListener('click', () => { close(); deps.showProject(project); });
    const again = el('button', 'fab-ghost', 'Neue App');
    again.type = 'button';
    again.addEventListener('click', renderSetup);
    end.append(open, again);
    col.append(end);
    setPhase('APP FERTIG', 'FERTIG');
    deps.result({ title: `App: ${project.title}`, detail: project.description || 'in der App-Fabrik gebaut', button: 'Öffnen', onClick: () => deps.showProject(project) });
  };
  type();
}

function fail(message) {
  job.finishedAt = Date.now();
  clearInterval(job.timer);
  stopRain();
  const box = el('section', 'fab-setup');
  box.append(el('p', 'fab-kicker', 'BUILD FEHLGESCHLAGEN'), el('h2', 'fab-title', 'Die App konnte nicht gebaut werden.'), el('p', 'fab-error', message));
  const again = el('button', 'fab-go', 'Nochmal versuchen');
  again.type = 'button';
  again.addEventListener('click', () => start(job.description, { fetch: true }));
  box.append(again);
  ui.stage.replaceChildren(box);
  setPhase('FEHLER', 'FEHLER');
  beep(180, 0.5, 'sawtooth');
}

export function initFactory(options) { deps = { ...deps, ...options }; }
export function openFactory() { show(); if (!job.project && job.startedAt && !job.finishedAt) return; renderSetup(); }
export function handleFactoryMessage(message) {
  if (message.action === 'start') start(message.description);
  else if (message.action === 'done') { if (!job.startedAt || job.finishedAt) start(message.project?.title || 'App'); done(message.project); }
  else if (message.action === 'error') { show(); fail(message.error || 'Unbekannter Fehler'); }
}

// Only one big mode at a time: close when another one opens.
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'fab') closeQuiet(); });
