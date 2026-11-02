// Kinoplakat: selfie → you are cut out (on this device) → an animated movie
// poster with explosion, light rays, title and credits. Saved as a picture.
import { cameraError, openCamera, personSegmenter } from './mp.js';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const PW = 1080; const PH = 1600;
let state = null;

let audio = null;
function tone(f, dur, type = 'sine', vol = 0.12, delay = 0, to = f) {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime + delay; const o = audio.createOscillator(); const g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ }
}

function close() {
  if (!state) return;
  cancelAnimationFrame(state.raf);
  clearInterval(state.timer);
  state.stream?.getTracks().forEach((t) => t.stop());
  state.root.remove();
  state = null;
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'poster') close(); });

async function cutOut(photo) {
  const out = document.createElement('canvas');
  out.width = photo.width; out.height = photo.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(photo, 0, 0);
  try {
    const seg = await personSegmenter('IMAGE');
    const res = seg.segment(photo);
    const m = res.confidenceMasks?.[0];
    const arr = m.getAsFloat32Array(); const mw = m.width; const mh = m.height;
    const img = ctx.getImageData(0, 0, out.width, out.height);
    for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) {
      const c = arr[Math.floor((y / out.height) * mh) * mw + Math.floor((x / out.width) * mw)];
      img.data[(y * out.width + x) * 4 + 3] = Math.max(0, Math.min(255, (c - 0.25) * 2 * 255));
    }
    res.close?.();
    ctx.putImageData(img, 0, 0);
    return { canvas: out, cut: true };
  } catch {
    return { canvas: out, cut: false };
  }
}

// Draws the poster at animation time t (seconds).
function drawPoster(ctx, t, person, title, tagline) {
  const ease = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, PH);
  bg.addColorStop(0, '#05070d'); bg.addColorStop(0.55, '#1a0606'); bg.addColorStop(1, '#000');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, PW, PH);
  // explosion glow
  const ex = ease(0.2, 1.4);
  const g = ctx.createRadialGradient(PW / 2, PH * 0.62, 10, PW / 2, PH * 0.62, 900 * ex + 1);
  g.addColorStop(0, `rgba(255,240,200,${0.95 * ex})`); g.addColorStop(0.18, `rgba(255,150,40,${0.85 * ex})`); g.addColorStop(0.45, `rgba(200,40,10,${0.55 * ex})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
  // light rays
  const rays = ease(0.6, 1.6);
  ctx.translate(PW / 2, PH * 0.62);
  ctx.rotate(t * 0.05);
  for (let i = 0; i < 18; i += 1) {
    ctx.rotate((Math.PI * 2) / 18);
    ctx.fillStyle = `rgba(255,200,120,${0.07 * rays})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -1400); ctx.lineTo(40, -1400); ctx.closePath(); ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // city skyline
  ctx.fillStyle = '#050304';
  let x = 0; let seed = 7;
  while (x < PW) { seed = (seed * 9301 + 49297) % 233280; const w = 40 + (seed % 70); const h = 120 + (seed % 260); ctx.fillRect(x, PH * 0.78 - h, w, h + 400); x += w + 4; }
  // sparks
  for (let i = 0; i < 70; i += 1) {
    const a = (i * 137.5) % 360; const r = ((i * 53) % 600) * ex + 40 + t * 30;
    ctx.fillStyle = `rgba(255,${180 + (i % 60)},90,${0.7 * ex})`;
    ctx.fillRect(PW / 2 + Math.cos(a) * r, PH * 0.62 + Math.sin(a) * r * 0.7 - t * 20, 4, 4);
  }
  // person
  const pk = ease(1.0, 2.0);
  if (person) {
    const scale = Math.min((PW * 1.05) / person.width, (PH * 0.78) / person.height);
    const w = person.width * scale; const h = person.height * scale;
    ctx.globalAlpha = pk;
    ctx.shadowColor = 'rgba(255,120,40,0.6)'; ctx.shadowBlur = 60;
    ctx.drawImage(person, (PW - w) / 2, PH - h - 120 + (1 - pk) * 200, w, h);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    const fade = ctx.createLinearGradient(0, PH * 0.72, 0, PH);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = fade; ctx.fillRect(0, PH * 0.72, PW, PH * 0.28);
  }
  // top line + title
  ctx.textAlign = 'center';
  const tk = ease(2.0, 2.4);
  ctx.fillStyle = `rgba(255,255,255,${0.8 * ease(1.6, 2.2)})`;
  ctx.font = '600 30px Inter, sans-serif';
  ctx.fillText('JARVIS STUDIOS PRÄSENTIERT', PW / 2, 110);
  if (tk > 0) {
    const s = 1 + (1 - tk) * 1.2;
    ctx.save();
    ctx.translate(PW / 2, PH - 330);
    ctx.scale(s, s);
    ctx.globalAlpha = tk;
    ctx.font = '900 118px Inter, sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    const grad = ctx.createLinearGradient(0, -100, 0, 20);
    grad.addColorStop(0, '#fff6e0'); grad.addColorStop(0.6, '#ffb347'); grad.addColorStop(1, '#c2410c');
    const lines = title.length > 14 ? [title.slice(0, title.lastIndexOf(' ', 14) > 0 ? title.lastIndexOf(' ', 14) : 14), title.slice(title.lastIndexOf(' ', 14) > 0 ? title.lastIndexOf(' ', 14) + 1 : 14)] : [title];
    lines.forEach((line, i) => { const y = (i - lines.length + 1) * 112; ctx.strokeText(line, 0, y); ctx.fillStyle = grad; ctx.fillText(line, 0, y); });
    ctx.restore();
  }
  ctx.globalAlpha = ease(2.5, 3.0);
  ctx.fillStyle = '#ffd9b0'; ctx.font = 'italic 500 40px Inter, sans-serif';
  ctx.fillText(tagline, PW / 2, PH - 230);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '500 22px Inter, sans-serif';
  ctx.fillText('REGIE JARVIS · DREHBUCH JARVIS · MUSIK JARVIS · KAMERA JARVIS · SPEZIALEFFEKTE JARVIS', PW / 2, PH - 150);
  ctx.fillStyle = '#fff'; ctx.font = '800 44px Inter, sans-serif';
  ctx.fillText('BALD IM KINO', PW / 2, PH - 80);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export async function openPoster({ title = '', tagline = '' } = {}) {
  close();
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'poster' }));
  const root = el('div', 'poster');
  root.innerHTML = `<header class="poster-top"><p>JARVIS · KINOPLAKAT</p><button type="button" class="poster-x" aria-label="Schließen">✕</button></header>
    <div class="poster-stage"><video playsinline muted></video><canvas width="${PW}" height="${PH}"></canvas><b class="poster-count"></b><div class="poster-flash"></div><p class="poster-status">Kamera wird gestartet …</p></div>
    <div class="poster-bar" hidden><button type="button" class="poster-save">💾 Speichern</button><button type="button" class="poster-share">Teilen</button><button type="button" class="poster-again">Neues Foto</button></div>`;
  document.body.append(root);
  state = { root, raf: 0, timer: null, stream: null };
  const video = root.querySelector('video'); const canvas = root.querySelector('canvas'); const status = root.querySelector('.poster-status'); const count = root.querySelector('.poster-count');
  root.querySelector('.poster-x').addEventListener('click', close);
  root.querySelector('.poster-again').addEventListener('click', () => openPoster({ title, tagline }));
  try { state.stream = await openCamera(video); } catch (error) { status.textContent = cameraError(error); return; }
  personSegmenter('IMAGE').catch(() => {});
  status.textContent = 'Schau in die Kamera und pose!';
  let n = 3;
  count.textContent = String(n);
  tone(660, 0.15, 'square', 0.08);
  await new Promise((resolve) => {
    state.timer = setInterval(() => {
      n -= 1;
      if (n > 0) { count.textContent = String(n); tone(660, 0.15, 'square', 0.08); return; }
      clearInterval(state.timer); resolve();
    }, 1000);
  });
  if (!state || state.root !== root) return;
  count.textContent = '';
  root.classList.add('snap');
  tone(1200, 0.08, 'square', 0.15); tone(200, 0.2, 'sawtooth', 0.1, 0.05);
  const photo = document.createElement('canvas');
  photo.width = video.videoWidth; photo.height = video.videoHeight;
  const pctx = photo.getContext('2d');
  pctx.translate(photo.width, 0); pctx.scale(-1, 1);
  pctx.drawImage(video, 0, 0);
  state.stream.getTracks().forEach((t) => t.stop());
  video.remove();
  status.textContent = 'Jarvis schneidet dich aus …';
  const { canvas: person, cut } = await cutOut(photo);
  if (!state || state.root !== root) return;
  status.textContent = cut ? '' : 'Ausschneiden nicht möglich – Foto wird ganz benutzt.';
  const t0 = performance.now();
  const ctx = canvas.getContext('2d');
  const name = (title || 'Der Aufstieg').toUpperCase().slice(0, 28);
  const line = tagline || 'Ein Held. Eine KI. Keine Grenzen.';
  tone(55, 3.5, 'sawtooth', 0.18, 0.2, 40); tone(110, 3, 'triangle', 0.08, 0.4);
  [0, 0.5, 1].forEach((d) => tone(220, 1.2, 'sine', 0.06, 2 + d, 330));
  const frame = (now) => {
    const t = (now - t0) / 1000;
    drawPoster(ctx, t, person, name, line);
    if (t < 3.4) state.raf = requestAnimationFrame(frame);
    else { root.querySelector('.poster-bar').hidden = false; tone(130, 1.6, 'sawtooth', 0.2, 0, 65); }
  };
  state.raf = requestAnimationFrame(frame);
  const blob = () => new Promise((r) => canvas.toBlob(r, 'image/png'));
  root.querySelector('.poster-save').addEventListener('click', async () => {
    const b = await blob(); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'jarvis-kinoplakat.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  root.querySelector('.poster-share').addEventListener('click', async () => {
    const b = await blob(); const file = new File([b], 'jarvis-kinoplakat.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: 'Mein Kinoplakat' }).catch(() => {});
    else root.querySelector('.poster-save').click();
  });
}
