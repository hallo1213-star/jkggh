// Stimm-Schloss: Jarvis only obeys the owner's voice.
// Enrolment stores a voice print (256 numbers, only in this browser). During a
// conversation every spoken turn is compared on the device; Jarvis' answer is
// held back until the check is done. A foreign voice → the answer is dropped,
// the server refuses all functions of that turn and "Zugriff verweigert" shows.
import { SR, averagePrints, similarity, to16k, voiced } from './voice-id.js';

const KEY = 'jarvis.voicelock';
export const LEVELS = { locker: 0.8, normal: 0.85, streng: 0.88 };
const SENTENCES = [
  'Jarvis, das ist meine Stimme. Merk sie dir gut.',
  'Heute ist ein guter Tag, um etwas Neues zu bauen.',
  'Nur ich darf dir Befehle geben, sonst niemand.',
  'Zeig mir das Wetter und spiel danach etwas Musik.'
];
const RING = SR * 16;
const MIN_VOICE = 0.5; // shorter than this cannot be checked reliably → let through
const HOLD_MAX_MS = 5000; // never block Jarvis longer than this (fail open)

function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && Array.isArray(d.print) && d.print.length === 256 ? d : null; } catch { return null; } }
function save(d) { try { if (d) localStorage.setItem(KEY, JSON.stringify(d)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } }

export function createVoiceGate({ onVerdict = () => {}, onChange = () => {}, toast = () => {} } = {}) {
  let data = load();
  const ring = new Float32Array(RING); let written = 0;
  let worker = null; let jobId = 0; const jobs = new Map();
  let turn = null; // { id, start, verdict, checking, firstHold }
  let capture = 0; // >0 while enrolment/test records

  function getWorker() {
    if (worker) return worker;
    worker = new Worker('/voice-worker.js', { type: 'module' });
    worker.onmessage = ({ data: d }) => { const job = jobs.get(d.id); if (!job) return; jobs.delete(d.id); if (d.error) job.reject(new Error(d.error)); else job.resolve(d.print); };
    worker.onerror = (e) => { for (const job of jobs.values()) job.reject(new Error(e.message || 'Stimm-Rechner abgestürzt')); jobs.clear(); worker = null; };
    return worker;
  }
  function embed(wav, maxPartials) {
    return new Promise((resolve, reject) => { const id = (jobId += 1); jobs.set(id, { resolve, reject }); const copy = Float32Array.from(wav); getWorker().postMessage({ id, wav: copy, maxPartials }, [copy.buffer]); });
  }
  function slice(from, to = written) {
    const start = Math.max(from, written - RING + 1, 0); const n = Math.max(0, to - start); const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = ring[(start + i) % RING];
    return out;
  }

  const gate = {
    enrolled: () => Boolean(data),
    enabled: () => Boolean(data?.on),
    level: () => data?.level || 'normal',
    active: () => Boolean(data?.on),
    capturing: () => capture > 0,
    feed(chunk, rate) {
      if (!data?.on && !capture) return;
      const wav = to16k(chunk instanceof ArrayBuffer ? new Int16Array(chunk) : chunk, rate);
      for (let i = 0; i < wav.length; i++) ring[(written + i) % RING] = wav[i];
      written += wav.length;
    },
    // a new spoken turn begins (Deepgram detected speech)
    userSpeaking(id) {
      if (!gate.active()) { turn = null; return; }
      turn = { id: id ?? 0, start: Math.max(0, written - SR * 0.6), verdict: null, checking: false, firstHold: 0, opened: Date.now() };
      const t = turn;
      const poll = setInterval(() => {
        if (turn !== t || t.verdict || t.checking) { clearInterval(poll); return; }
        const v = voiced(slice(t.start));
        if (v.seconds >= 2.2 || Date.now() - t.opened > 7000) { clearInterval(poll); check(t); }
      }, 300);
    },
    // the user's sentence is complete (transcript arrived)
    userDone() { const t = turn; if (t && !t.verdict && !t.checking) setTimeout(() => check(t), 150); },
    // should Jarvis' answer wait? (true while the voice of this turn is being checked)
    holding() {
      const t = turn; if (!t || t.verdict) return false;
      if (!t.firstHold) { t.firstHold = Date.now(); if (!t.checking) check(t); setTimeout(() => { if (turn === t && !t.verdict) finish(t, true, null, 'Zeit'); }, HOLD_MAX_MS); }
      return true;
    },
    turnDenied: () => turn?.verdict === 'denied',
    setOn(on) { if (!data) return; data = { ...data, on: Boolean(on) }; save(data); onChange(); },
    setLevel(level) { if (!data || !LEVELS[level]) return; data = { ...data, level }; save(data); onChange(); },
    forget() { data = null; save(null); turn = null; onChange(); },
    warmup() { const id = (jobId += 1); jobs.set(id, { resolve() {}, reject() {} }); getWorker().postMessage({ id, warmup: true }); },
    openEnrol: () => enrolOverlay(),
    openTest: () => testOverlay()
  };

  async function check(t) {
    if (t.checking || t.verdict) return; t.checking = true;
    const v = voiced(slice(t.start).subarray(0, SR * 8));
    if (v.seconds < MIN_VOICE || !data) { finish(t, true, null, 'kurz'); return; }
    try {
      const print = await embed(v.wav.subarray(0, Math.min(v.wav.length, SR * 3.2)), 3);
      const score = similarity(print, Float32Array.from(data.print));
      finish(t, score >= LEVELS[gate.level()], score, 'geprüft');
    } catch (error) {
      console.warn('Stimm-Schloss:', error.message);
      finish(t, true, null, 'fehler');
    }
  }
  function finish(t, ok, score, why) {
    if (t.verdict) return;
    t.verdict = ok ? 'ok' : 'denied';
    if (turn === t) onVerdict({ turn: t.id, ok, score, why });
  }

  // --- recording helper for enrolment and test ---
  function record({ minVoice, maxMs, onLevel }) {
    capture += 1; const start = written; const began = Date.now();
    return new Promise((resolve) => {
      const iv = setInterval(() => {
        const wav = slice(start); const v = voiced(wav);
        let tail = 0; for (let i = Math.max(0, wav.length - SR * 0.2); i < wav.length; i++) tail = Math.max(tail, Math.abs(wav[i]));
        onLevel?.(Math.min(1, tail * 6), v.seconds);
        const quietEnd = tail < 0.02 && v.seconds >= minVoice;
        if (quietEnd || Date.now() - began > maxMs) { clearInterval(iv); capture -= 1; resolve(v); }
      }, 200);
    });
  }

  function overlay(title) {
    const root = document.createElement('div'); root.className = 'vlock';
    root.innerHTML = `<div class="vlock-card" role="dialog" aria-modal="true" aria-label="${title}"><button class="vlock-x" type="button" aria-label="Schließen">✕</button><div class="vlock-ring"><span></span><span></span><span></span><b>🔒</b></div><h3>${title}</h3><p class="vlock-text"></p><p class="vlock-sub"></p><div class="vlock-steps"></div><div class="vlock-actions"></div></div>`;
    document.body.append(root);
    const q = (s) => root.querySelector(s);
    let closed = false;
    const close = () => { closed = true; root.remove(); };
    q('.vlock-x').addEventListener('click', close);
    return { root, q, close, isClosed: () => closed, level: (x) => root.style.setProperty('--vl', x.toFixed(2)) };
  }

  async function enrolOverlay() {
    if (!window.__jarvisAudioReady?.()) { toast('Tippe zuerst auf „Jarvis aktivieren“ – dann kann ich deine Stimme hören.', 'error'); return; }
    const o = overlay('Stimme einlernen');
    gate.warmup();
    o.q('.vlock-steps').innerHTML = SENTENCES.map(() => '<i></i>').join('');
    const steps = [...o.q('.vlock-steps').children];
    const prints = [];
    for (let i = 0; i < SENTENCES.length && !o.isClosed(); i++) {
      steps[i].className = 'now';
      o.q('.vlock-sub').textContent = `Satz ${i + 1} von ${SENTENCES.length} – lies laut und normal vor:`;
      o.q('.vlock-text').textContent = `„${SENTENCES[i]}“`;
      o.root.dataset.state = 'listen';
      const v = await record({ minVoice: 2, maxMs: 9000, onLevel: (x) => o.level(x) });
      if (o.isClosed()) return;
      if (v.seconds < 1.4) { o.q('.vlock-sub').textContent = 'Ich habe dich kaum gehört – bitte nochmal etwas lauter.'; steps[i].className = ''; i -= 1; await new Promise((r) => setTimeout(r, 1400)); continue; }
      o.root.dataset.state = 'think';
      o.q('.vlock-sub').textContent = 'Analysiere …';
      try { prints.push(await embed(v.wav.subarray(0, SR * 6), 6)); } catch (error) { o.q('.vlock-sub').textContent = `Fehler: ${error.message}`; return; }
      steps[i].className = 'done';
    }
    if (o.isClosed()) return;
    let min = 1; for (let a = 0; a < prints.length; a++) for (let b = a + 1; b < prints.length; b++) min = Math.min(min, similarity(prints[a], prints[b]));
    if (min < 0.62) {
      o.root.dataset.state = 'fail';
      o.q('.vlock-text').textContent = 'Das klang sehr unterschiedlich.';
      o.q('.vlock-sub').textContent = 'War es laut oder hat jemand dazwischen geredet? Bitte nochmal an einem ruhigen Ort.';
      const again = document.createElement('button'); again.className = 'ctrl'; again.type = 'button'; again.textContent = 'Nochmal';
      again.addEventListener('click', () => { o.close(); enrolOverlay(); });
      o.q('.vlock-actions').append(again);
      return;
    }
    data = { print: Array.from(averagePrints(prints), (x) => Math.round(x * 1e5) / 1e5), on: true, level: data?.level || 'normal', at: Date.now() };
    save(data); onChange();
    o.root.dataset.state = 'ok';
    o.q('.vlock-text').textContent = 'Stimme gespeichert. Stimm-Schloss ist AN.';
    o.q('.vlock-sub').textContent = 'Ab jetzt reagiert Jarvis auf diesem Gerät nur noch auf dich. Ausschalten: ⚙️ Einstellungen → Stimm-Schloss.';
    const test = document.createElement('button'); test.className = 'ctrl'; test.type = 'button'; test.textContent = 'Jetzt testen';
    test.addEventListener('click', () => { o.close(); testOverlay(); });
    const done = document.createElement('button'); done.className = 'ctrl'; done.type = 'button'; done.textContent = 'Fertig';
    done.addEventListener('click', o.close);
    o.q('.vlock-actions').append(test, done);
  }

  async function testOverlay() {
    if (!data) { toast('Lerne zuerst deine Stimme ein.', 'error'); return; }
    if (!window.__jarvisAudioReady?.()) { toast('Tippe zuerst auf „Jarvis aktivieren“.', 'error'); return; }
    const o = overlay('Stimm-Test');
    gate.warmup();
    const run = async () => {
      o.q('.vlock-actions').replaceChildren();
      o.root.dataset.state = 'listen';
      o.q('.vlock-text').textContent = 'Sag einen beliebigen Satz …';
      o.q('.vlock-sub').textContent = 'Auch gut: Lass einen Freund sprechen und schau, ob er abgelehnt wird.';
      const v = await record({ minVoice: 1.5, maxMs: 8000, onLevel: (x) => o.level(x) });
      if (o.isClosed()) return;
      if (v.seconds < MIN_VOICE) { o.q('.vlock-text').textContent = 'Nichts gehört.'; o.root.dataset.state = 'fail'; }
      else {
        o.root.dataset.state = 'think'; o.q('.vlock-sub').textContent = 'Analysiere …';
        const score = similarity(await embed(v.wav.subarray(0, SR * 3.2), 3), Float32Array.from(data.print));
        const ok = score >= LEVELS[gate.level()];
        o.root.dataset.state = ok ? 'ok' : 'fail';
        o.q('.vlock-text').textContent = `${ok ? '✅ Erkannt' : '⛔ Fremde Stimme'} – Übereinstimmung ${Math.round(score * 100)} %`;
        o.q('.vlock-sub').textContent = `Grenze (${gate.level()}): ${Math.round(LEVELS[gate.level()] * 100)} %. ${ok ? '' : 'Wenn das du warst: Strenge auf „locker“ stellen oder neu einlernen.'}`;
      }
      const again = document.createElement('button'); again.className = 'ctrl'; again.type = 'button'; again.textContent = 'Nochmal testen';
      again.addEventListener('click', run);
      o.q('.vlock-actions').append(again);
    };
    run();
  }

  return gate;
}

// Red "access denied" flash (CSS animation + short alarm tone).
export function showDenied(audioContext) {
  const el = document.createElement('div'); el.className = 'vlock-denied';
  el.innerHTML = '<div><b>ZUGRIFF VERWEIGERT</b><small>Stimme nicht erkannt – Jarvis gehorcht nur seinem Besitzer.</small></div>';
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
  try {
    const ctx = audioContext; if (!ctx) return;
    const t = ctx.currentTime;
    for (const [i, f] of [[0, 440], [1, 330]]) {
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.22); g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
      o.connect(g).connect(ctx.destination); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.22);
    }
  } catch { /* sound is optional */ }
}
