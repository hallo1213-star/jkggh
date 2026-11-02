// "Selbstzerstörung" – pure fun: red alarm, siren, shaking screen, countdown from
// 10, explosion effect, then "Spaß, Boss." Nothing real happens.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const WARNINGS = ['REAKTOR INSTABIL', 'KÜHLUNG AUSGEFALLEN', 'KERNTEMPERATUR KRITISCH', 'ALLE SYSTEME: ALARM', 'EVAKUIERUNG EMPFOHLEN', 'SICHERUNGEN DEAKTIVIERT'];
let run = null;
let audio = null;
let send = () => {};
export function initPrank(options) { send = options.send || send; }

function siren() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const lfo = audio.createOscillator();
    const lfoGain = audio.createGain();
    const g = audio.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 640;
    lfo.frequency.value = 1.6;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(o.frequency);
    g.gain.value = 0.07;
    o.connect(g).connect(audio.destination);
    o.start(); lfo.start();
    return () => { try { g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.3); o.stop(audio.currentTime + 0.35); lfo.stop(audio.currentTime + 0.35); } catch { /* ignore */ } };
  } catch { return () => {}; }
}
function tick(freq = 1000) {
  try { const o = audio.createOscillator(); const g = audio.createGain(); o.type = 'square'; o.frequency.value = freq; g.gain.setValueAtTime(0.1, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12); o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.15); } catch { /* ignore */ }
}
function boom() {
  try {
    const len = audio.sampleRate * 1.6;
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const g = audio.createGain();
    filter.type = 'lowpass'; filter.frequency.value = 700;
    g.gain.value = 0.9;
    src.buffer = buf;
    src.connect(filter).connect(g).connect(audio.destination);
    src.start();
  } catch { /* ignore */ }
}

export function startSelfDestruct() {
  if (run) return;
  const root = el('div', 'prank');
  root.innerHTML = `<div class="prank-red"></div><div class="prank-stripes"></div>
    <div class="prank-box"><p class="prank-kicker">⚠ SELBSTZERSTÖRUNG AKTIVIERT ⚠</p><b class="prank-count">10</b><p class="prank-warn"></p><div class="prank-bar"><span></span></div><button type="button" class="prank-stop">ABBRECHEN</button></div>
    <div class="prank-flash"></div><div class="prank-wave"></div><div class="prank-cracks"></div><p class="prank-joke">Spaß, Boss. 😏</p>`;
  document.body.append(root);
  document.body.classList.add('prank-shake');
  const stopSiren = siren();
  const count = root.querySelector('.prank-count');
  const warn = root.querySelector('.prank-warn');
  const bar = root.querySelector('.prank-bar span');
  let n = 10;
  warn.textContent = WARNINGS[0];
  tick();
  const timer = setInterval(() => {
    n -= 1;
    if (n > 0) {
      count.textContent = String(n);
      count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop');
      warn.textContent = WARNINGS[(10 - n) % WARNINGS.length];
      bar.style.width = `${(10 - n) * 10}%`;
      tick(n <= 3 ? 1400 : 1000);
      if (n <= 3) root.classList.add('critical');
      return;
    }
    clearInterval(timer);
    stopSiren();
    count.textContent = '0';
    bar.style.width = '100%';
    root.classList.add('boom');
    boom();
    setTimeout(() => { document.body.classList.remove('prank-shake'); root.classList.add('joke'); }, 1300);
    setTimeout(() => root.classList.add('out'), 4300);
    setTimeout(() => { root.remove(); run = null; }, 5000);
  }, 1000);
  run = { root, timer, stopSiren };
  root.querySelector('.prank-stop').addEventListener('click', () => { send({ type: 'prank_abort' }); stopSelfDestruct(); });
}

export function stopSelfDestruct() {
  if (!run) return;
  clearInterval(run.timer);
  run.stopSiren();
  document.body.classList.remove('prank-shake');
  run.root.classList.add('aborted');
  run.root.querySelector('.prank-kicker').textContent = 'SELBSTZERSTÖRUNG ABGEBROCHEN';
  run.root.querySelector('.prank-warn').textContent = 'Alle Systeme stabil.';
  const r = run.root;
  run = null;
  setTimeout(() => r.classList.add('out'), 1500);
  setTimeout(() => r.remove(), 2200);
}

// "UFO-Alarm": radar, city at night, a UFO with a search light – then "only a weather balloon".
export function startUfo() {
  if (document.querySelector('.ufo')) return;
  const root = el('div', 'ufo');
  root.innerHTML = `<div class="ufo-sky"></div><div class="ufo-city"></div><div class="ufo-ship"><span class="ufo-dome"></span><span class="ufo-body"></span><span class="ufo-lights"></span><span class="ufo-beam"></span></div>
    <div class="ufo-radar"><i></i><b></b></div><p class="ufo-alert">⚠ UNBEKANNTES FLUGOBJEKT ⚠</p><p class="ufo-info">Kurs: direkt über deiner Stadt · Größe: unbekannt</p><p class="ufo-joke">Entwarnung: nur ein Wetterballon. 🎈😏</p>`;
  document.body.append(root);
  const stop = siren();
  setTimeout(() => root.classList.add('fly'), 400);
  setTimeout(() => { stop(); root.classList.add('joke'); }, 9500);
  setTimeout(() => root.classList.add('out'), 13500);
  setTimeout(() => root.remove(), 14200);
}

export function handlePrankMessage(message) {
  if (message.action === 'start') startSelfDestruct();
  else if (message.action === 'abbrechen') stopSelfDestruct();
  else if (message.action === 'ufo') startUfo();
}
