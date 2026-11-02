// Energieklinge (hand tracking), Hologramm-Botschaft (record yourself as a red
// hologram) and Helm-Stimme (live voice effect with recording). All on device.
import { cameraError, handTracker, openCamera, personSegmenter } from './mp.js';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let deps = { toast: () => {}, muteJarvis: () => {} };
let cur = null; // { kind, root, stop }

let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); return audio; }
function tone(f, dur, type = 'sine', vol = 0.12, to = f) { try { const a = ac(); const t = a.currentTime; const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ } }
function noise(dur, vol, freq, q = 1.5) { try { const a = ac(); const len = Math.floor(a.sampleRate * dur); const b = a.createBuffer(1, len, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI); const s = a.createBufferSource(); const f = a.createBiquadFilter(); const g = a.createGain(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(); } catch { /* no audio */ } }

function stop() {
  if (!cur) return;
  const c = cur; cur = null;
  try { c.stop?.(); } catch { /* ignore */ }
  c.root.remove();
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'fx3') stop(); });

function shell(kind, title) {
  stop();
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'fx3' }));
  const root = el('div', `fx3 ${kind}`);
  root.innerHTML = `<div class="fx3-view"><video playsinline muted></video><canvas></canvas><p class="fx3-title">${title}</p><p class="fx3-status"></p></div><div class="fx3-bar"><button type="button" class="fx3-close">Beenden</button></div>`;
  document.body.append(root);
  cur = { kind, root, stop: null };
  root.querySelector('.fx3-close').addEventListener('click', stop);
  return { root, video: root.querySelector('video'), canvas: root.querySelector('canvas'), status: root.querySelector('.fx3-status'), bar: root.querySelector('.fx3-bar') };
}

// ======================================================================================
// Energieklinge
// ======================================================================================
async function blade() {
  const ui = shell('blade', 'ENERGIEKLINGE');
  let stream = null; let raf = 0; let hum = null;
  cur.stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); hum?.stop(); };
  ui.status.textContent = 'Kamera wird gestartet …';
  try { stream = await openCamera(ui.video); } catch (e) { ui.status.textContent = cameraError(e); return; }
  ui.status.textContent = 'Handerkennung lädt …';
  let hand;
  try { hand = await handTracker(); } catch (e) { ui.status.textContent = e.message; return; }
  if (!cur || cur.root !== ui.root) return;
  ui.status.textContent = 'Faust machen – die Klinge fährt aus. Schnell schwingen!';
  // humming sound while the blade is out
  const a = ac();
  const hg = a.createGain(); hg.gain.value = 0; hg.connect(a.destination);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(hg);
  const o1 = a.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 86; o1.connect(lp); o1.start();
  const o2 = a.createOscillator(); o2.type = 'sine'; o2.frequency.value = 172.5; o2.connect(lp); o2.start();
  hum = { stop: () => { try { hg.gain.value = 0; o1.stop(); o2.stop(); } catch { /* ignore */ } } };
  let ext = 0; let wasOut = false; let last = 0; const trail = []; let swingCool = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const v = ui.video; const c = ui.canvas;
    if (!v.videoWidth) return;
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    const ctx = c.getContext('2d'); const W = c.width; const H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (now <= last) return; last = now;
    const p = hand.detectForVideo(v, now).landmarks?.[0];
    let fist = false; let base = null; let dir = null; let size = 0;
    if (p) {
      const d = (i, j) => Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
      size = d(0, 9);
      const open = [8, 12, 16, 20].reduce((s, i) => s + d(i, 0), 0) / 4 / (size || 1e-3);
      fist = open < 1.25;
      // the blade leaves the fist along wrist → middle knuckle
      base = { x: ((p[5].x + p[17].x) / 2) * W, y: ((p[5].y + p[17].y) / 2) * H };
      const dx = (p[9].x - p[0].x) * W; const dy = (p[9].y - p[0].y) * H; const len = Math.hypot(dx, dy) || 1;
      dir = { x: dx / len, y: dy / len };
    }
    const target = fist ? 1 : 0;
    ext += (target - ext) * (target > ext ? 0.22 : 0.18);
    if (target && !wasOut) { tone(90, 0.5, 'sawtooth', 0.15, 600); noise(0.4, 0.3, 2400); }
    if (!target && wasOut) { tone(600, 0.4, 'sawtooth', 0.12, 80); }
    wasOut = Boolean(target);
    hg.gain.value = 0.06 * ext;
    if (base && ext > 0.02) {
      const L = size * W * 4.6 * ext;
      const tip = { x: base.x + dir.x * L, y: base.y + dir.y * L };
      trail.push({ x: tip.x, y: tip.y, bx: base.x, by: base.y, t: now });
      while (trail.length && now - trail[0].t > 140) trail.shift();
      // swing: tip speed
      if (trail.length > 2) {
        const a1 = trail[trail.length - 1]; const a0 = trail[Math.max(0, trail.length - 4)];
        const speed = Math.hypot(a1.x - a0.x, a1.y - a0.y) / Math.max(1, a1.t - a0.t);
        lp.frequency.value = 600 + Math.min(2400, speed * 900);
        o1.frequency.value = 86 + Math.min(60, speed * 25);
        if (speed > 1.6 && now > swingCool) { swingCool = now + 260; noise(0.32, 0.35 * Math.min(1, speed / 3), 900 + speed * 400, 0.8); }
      }
      // motion trail
      if (trail.length > 1) {
        ctx.beginPath(); ctx.moveTo(trail[0].bx, trail[0].by);
        trail.forEach((q) => ctx.lineTo(q.x, q.y));
        for (let i = trail.length - 1; i >= 0; i -= 1) ctx.lineTo(trail[i].bx, trail[i].by);
        ctx.closePath(); ctx.fillStyle = 'rgba(255, 40, 60, 0.18)'; ctx.fill();
      }
      const flick = 0.9 + Math.random() * 0.1;
      ctx.lineCap = 'round';
      for (const [w, col] of [[size * W * 0.55, `rgba(255, 20, 40, ${0.18 * flick})`], [size * W * 0.32, `rgba(255, 40, 60, ${0.45 * flick})`], [size * W * 0.16, `rgba(255, 90, 100, ${0.9 * flick})`], [size * W * 0.07, 'rgba(255, 240, 240, 1)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.shadowColor = 'rgba(255, 30, 50, 1)'; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // hilt glow
      const g = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, size * W * 0.6);
      g.addColorStop(0, 'rgba(255, 200, 200, 0.8)'); g.addColorStop(1, 'rgba(255, 30, 50, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(base.x, base.y, size * W * 0.6, 0, Math.PI * 2); ctx.fill();
    } else trail.length = 0;
  };
  raf = requestAnimationFrame(frame);
}

// ======================================================================================
// Hologramm-Botschaft
// ======================================================================================
const MIMES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
async function hologram() {
  const ui = shell('holo', 'HOLOGRAMM-BOTSCHAFT');
  let stream = null; let mic = null; let raf = 0; let rec = null; let seg = null;
  cur.stop = () => { cancelAnimationFrame(raf); try { rec?.state === 'recording' && rec.stop(); } catch { /* ignore */ } stream?.getTracks().forEach((t) => t.stop()); mic?.getTracks().forEach((t) => t.stop()); };
  ui.status.textContent = 'Kamera wird gestartet …';
  try { stream = await openCamera(ui.video); } catch (e) { ui.status.textContent = cameraError(e); return; }
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { mic = null; }
  ui.status.textContent = 'Personenerkennung lädt …';
  try { seg = await personSegmenter('VIDEO'); } catch (e) { ui.status.textContent = e.message; return; }
  if (!cur || cur.root !== ui.root) return;
  const c = ui.canvas; const v = ui.video;
  c.width = 540; c.height = 720;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const work = document.createElement('canvas'); work.width = 270; work.height = 360;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  let mask = null; let last = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (!v.videoWidth) return;
    // crop the camera picture to 3:4 portrait, mirrored like a selfie
    const vw = v.videoWidth; const vh = v.videoHeight; const cw = Math.min(vw, vh * 0.75); const sx = (vw - cw) / 2;
    wctx.save(); wctx.translate(work.width, 0); wctx.scale(-1, 1); wctx.drawImage(v, sx, 0, cw, vh, 0, 0, work.width, work.height); wctx.restore();
    if (now > last) { last = now; seg.segmentForVideo(work, now, (res) => { const m = res.confidenceMasks?.[0]; if (m) mask = { d: m.getAsFloat32Array().slice(), w: m.width, h: m.height }; }); }
    const img = wctx.getImageData(0, 0, work.width, work.height); const d = img.data;
    const t = now / 1000;
    for (let y = 0; y < work.height; y += 1) {
      const scan = (y + Math.floor(t * 60)) % 4 === 0 ? 0.55 : 1;
      for (let x = 0; x < work.width; x += 1) {
        const i = (y * work.width + x) * 4;
        const m = mask ? mask.d[Math.floor((y / work.height) * mask.h) * mask.w + Math.floor((x / work.width) * mask.w)] : 1;
        const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
        const a = Math.max(0, Math.min(1, (m - 0.3) * 2.2));
        d[i] = 255 * (0.35 + lum * 0.65) * scan; d[i + 1] = 40 * lum * scan + 10; d[i + 2] = 55 * lum * scan + 12; d[i + 3] = 255 * a * (0.7 + 0.3 * Math.sin(t * 13 + y / 30));
      }
    }
    wctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    // projector cone
    const cone = ctx.createLinearGradient(0, c.height, 0, c.height * 0.15);
    cone.addColorStop(0, 'rgba(255, 40, 60, 0.35)'); cone.addColorStop(1, 'rgba(255, 40, 60, 0)');
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(c.width / 2 - 18, c.height); ctx.lineTo(c.width * 0.08, c.height * 0.12); ctx.lineTo(c.width * 0.92, c.height * 0.12); ctx.lineTo(c.width / 2 + 18, c.height); ctx.closePath(); ctx.fill();
    const glitch = Math.random() < 0.04 ? (Math.random() - 0.5) * 30 : 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(work, glitch, 0, c.width, c.height * 0.92);
    ctx.globalAlpha = 0.25; ctx.drawImage(work, 4 + glitch, 0, c.width, c.height * 0.92); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255, 60, 70, 0.9)'; ctx.beginPath(); ctx.ellipse(c.width / 2, c.height - 8, 70, 10, 0, 0, Math.PI * 2); ctx.fill();
    if (rec?.state === 'recording') { ctx.fillStyle = '#ff2a3d'; ctx.beginPath(); ctx.arc(26, 26, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 16px Inter, sans-serif'; ctx.fillText(`REC ${Math.max(0, Math.ceil(10 - (now - rec.t0) / 1000))}`, 42, 32); }
  };
  raf = requestAnimationFrame(frame);
  const start = el('button', 'fx3-go', '● Aufnahme starten (10 s)'); start.type = 'button';
  ui.bar.prepend(start);
  ui.status.textContent = 'Bereit. Tippe auf Aufnahme oder sprich gleich los.';
  const go = async () => {
    start.disabled = true;
    for (const n of [3, 2, 1]) { ui.status.textContent = `Aufnahme in ${n} …`; tone(660, 0.12, 'square', 0.08); await new Promise((r) => setTimeout(r, 1000)); if (!cur || cur.root !== ui.root) return; }
    const mime = MIMES.find((m) => window.MediaRecorder?.isTypeSupported?.(m));
    if (!window.MediaRecorder || !mime) { ui.status.textContent = 'Dieses Gerät kann hier keine Videos aufnehmen.'; return; }
    const out = c.captureStream(30);
    mic?.getAudioTracks().forEach((t) => out.addTrack(t));
    const chunks = [];
    rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
    rec.t0 = performance.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => done(new Blob(chunks, { type: mime.split(';')[0] }));
    rec.start(250);
    tone(1200, 0.2, 'triangle', 0.1);
    ui.status.textContent = 'Aufnahme läuft – sprich deine Botschaft!';
    setTimeout(() => { try { rec.state === 'recording' && rec.stop(); } catch { /* ignore */ } }, 10_000);
  };
  start.addEventListener('click', go);
  setTimeout(() => { if (!start.disabled && cur?.root === ui.root) go(); }, 1500);
  const done = (blob) => {
    if (!cur || cur.root !== ui.root) return;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    const url = URL.createObjectURL(blob);
    const player = el('video', 'fx3-player'); player.src = url; player.controls = true; player.loop = true; player.playsInline = true; player.autoplay = true;
    ui.root.querySelector('.fx3-view').append(player);
    ui.status.textContent = 'Fertig! Deine Hologramm-Botschaft.';
    start.remove();
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const save = el('button', 'fx3-go', '💾 Speichern'); save.type = 'button';
    save.addEventListener('click', () => { const a = document.createElement('a'); a.href = url; a.download = `jarvis-hologramm.${ext}`; a.click(); });
    ui.bar.prepend(save);
    if (ext === 'webm') {
      const mp4 = el('button', 'fx3-ghost', 'Als MP4 (für iPhone/TikTok)'); mp4.type = 'button';
      mp4.addEventListener('click', async () => {
        mp4.disabled = true; mp4.textContent = 'Wandle um …';
        try {
          const r = await fetch('/api/video/convert', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: blob });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Fehler ${r.status}`);
          const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'jarvis-hologramm.mp4'; a.click();
          mp4.textContent = 'MP4 gespeichert ✓';
        } catch (e) { mp4.textContent = 'Umwandeln fehlgeschlagen'; deps.toast(e.message, 'error'); }
      });
      ui.bar.prepend(mp4);
    }
    tone(523, 0.3, 'triangle', 0.1); setTimeout(() => tone(784, 0.4, 'triangle', 0.1), 150);
  };
}

// ======================================================================================
// Helm-Stimme
// ======================================================================================
function impulse(a, seconds, decay) {
  const len = Math.floor(a.sampleRate * seconds); const b = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) { const d = b.getChannelData(ch); for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay * (i % 37 < 3 ? 1.6 : 1); }
  return b;
}
const PRESETS = { helm: { label: 'Helm', ring: 30, ringMix: 0.25, band: 1400, q: 0.8, verb: 0.35 }, roboter: { label: 'Roboter', ring: 55, ringMix: 0.9, band: 1100, q: 1.2, verb: 0.2 }, monster: { label: 'Tief', ring: 18, ringMix: 0.6, band: 380, q: 0.7, verb: 0.45 } };
async function voice() {
  const ui = shell('voice', 'HELM-STIMME');
  ui.video.remove();
  let mic = null; let raf = 0; let rec = null; let out = null;
  const a = ac();
  deps.muteJarvis(true);
  cur.stop = () => { cancelAnimationFrame(raf); try { rec?.state === 'recording' && rec.stop(); } catch { /* ignore */ } mic?.getTracks().forEach((t) => t.stop()); try { out?.disconnect(); } catch { /* ignore */ } deps.muteJarvis(false); };
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }); } catch (e) { ui.status.textContent = `Mikrofon nicht verfügbar: ${e.message}`; return; }
  if (!cur || cur.root !== ui.root) { mic.getTracks().forEach((t) => t.stop()); return; }
  const src = a.createMediaStreamSource(mic);
  const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
  const dry = a.createGain(); const ringG = a.createGain(); ringG.gain.value = 0; const carrier = a.createOscillator(); carrier.type = 'sine'; carrier.start(); carrier.connect(ringG.gain);
  const ringOut = a.createGain();
  const shaper = a.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i += 1) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2); } shaper.curve = curve;
  const band = a.createBiquadFilter(); band.type = 'peaking'; band.gain.value = 9;
  const verb = a.createConvolver(); verb.buffer = impulse(a, 0.35, 3);
  const verbG = a.createGain(); const mix = a.createGain(); mix.gain.value = 1.2;
  const analyser = a.createAnalyser(); analyser.fftSize = 256;
  const recDest = a.createMediaStreamDestination();
  out = a.createGain(); out.gain.value = 0.9;
  src.connect(hp); hp.connect(dry); hp.connect(ringG); ringG.connect(ringOut);
  dry.connect(shaper); ringOut.connect(shaper); shaper.connect(band); band.connect(mix); band.connect(verb); verb.connect(verbG); verbG.connect(mix);
  mix.connect(analyser); mix.connect(out); out.connect(a.destination); mix.connect(recDest);
  const apply = (key) => { const p = PRESETS[key]; carrier.frequency.value = p.ring; ringOut.gain.value = p.ringMix; dry.gain.value = 1 - p.ringMix * 0.7; band.frequency.value = p.band; band.Q.value = p.q; verbG.gain.value = p.verb; presetRow.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === key))); };
  const presetRow = el('div', 'fx3-presets');
  Object.entries(PRESETS).forEach(([k, p]) => { const b = el('button', '', p.label); b.type = 'button'; b.dataset.k = k; b.addEventListener('click', () => apply(k)); presetRow.append(b); });
  ui.root.querySelector('.fx3-view').append(presetRow);
  apply('helm');
  ui.status.textContent = 'Sprich! Am besten mit Kopfhörern (sonst pfeift es). Jarvis hört solange nicht zu.';
  const recBtn = el('button', 'fx3-go', '● Clip aufnehmen'); recBtn.type = 'button';
  ui.bar.prepend(recBtn);
  recBtn.addEventListener('click', () => {
    if (rec?.state === 'recording') { rec.stop(); return; }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
    if (!mime) { deps.toast('Aufnehmen geht auf diesem Gerät nicht.', 'error'); return; }
    const chunks = [];
    rec = new MediaRecorder(recDest.stream, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const link = el('a', 'fx3-ghost', '💾 Clip speichern'); link.href = url; link.download = `jarvis-helmstimme.${mime.includes('mp4') ? 'm4a' : 'webm'}`;
      ui.bar.querySelector('a.fx3-ghost')?.remove();
      ui.bar.prepend(link);
      recBtn.textContent = '● Neuer Clip';
    };
    rec.start();
    recBtn.textContent = '■ Stopp';
    setTimeout(() => { if (rec?.state === 'recording') rec.stop(); }, 30_000);
  });
  const c = ui.canvas; const ctx = c.getContext('2d'); const data = new Uint8Array(analyser.frequencyBinCount);
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (c.width !== c.clientWidth) { c.width = c.clientWidth; c.height = c.clientHeight; }
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, c.width, c.height);
    const n = 48; const bw = c.width / n; const cy = c.height / 2;
    for (let i = 0; i < n; i += 1) {
      const v = data[Math.floor((i / n) * data.length * 0.7)] / 255;
      const h = Math.max(4, v * c.height * 0.42);
      const g = ctx.createLinearGradient(0, cy - h, 0, cy + h); g.addColorStop(0, '#ffb3b8'); g.addColorStop(0.5, '#ff2a3d'); g.addColorStop(1, '#5a0010');
      ctx.fillStyle = g; ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 12;
      ctx.fillRect(i * bw + bw * 0.2, cy - h, bw * 0.6, h * 2);
    }
    ctx.shadowBlur = 0;
  };
  raf = requestAnimationFrame(frame);
}

export function initFx3(options) { deps = { ...deps, ...options }; }
export function handleFx3(action) {
  if (action === 'klinge') blade();
  else if (action === 'hologramm') hologram();
  else if (action === 'stimme') voice();
  else if (action === 'aus') stop();
}
