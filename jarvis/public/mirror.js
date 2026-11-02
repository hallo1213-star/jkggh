// Helm-Spiegel: the front camera shows YOU, and Jarvis' suit helmet sits on your
// head and follows it. Face points come from MediaPipe, running only on this
// device – nobody is identified, nothing is uploaded.
import { helmetSvg, ownedSuit, suitHelmetImage } from './suit.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };

let deps = { toast: () => {} };
const m = { root: null, video: null, canvas: null, stream: null, detector: null, raf: 0, visor: false, imgs: null, smooth: null, lastTs: -1, visorK: 0 };

function svgImage(svg) {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); });
}

async function detector() {
  if (m.detector) return m.detector;
  const vision = await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  m.detector = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numFaces: 1 });
  return m.detector;
}

function frame() {
  m.raf = requestAnimationFrame(frame);
  const { video, canvas } = m;
  if (!video.videoWidth) return;
  if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!m.detector || !m.imgs) return;
  const ts = performance.now();
  if (ts <= m.lastTs) return;
  m.lastTs = ts;
  const res = m.detector.detectForVideo(video, ts);
  const p = res.faceLandmarks?.[0];
  m.root.classList.toggle('noface', !p);
  if (!p) return;
  const W = canvas.width; const H = canvas.height;
  const P = (i) => [p[i].x * W, p[i].y * H];
  const le = P(33); const re = P(263); const top = P(10); const chin = P(152); const l = P(234); const r = P(454);
  const target = {
    cx: (le[0] + re[0]) / 2,
    cy: (le[1] + re[1]) / 2,
    w: Math.hypot(r[0] - l[0], r[1] - l[1]),
    h: Math.hypot(chin[0] - top[0], chin[1] - top[1]),
    a: Math.atan2(re[1] - le[1], re[0] - le[0])
  };
  const s = m.smooth || target;
  const k = 0.45;
  m.smooth = { cx: s.cx + (target.cx - s.cx) * k, cy: s.cy + (target.cy - s.cy) * k, w: s.w + (target.w - s.w) * k, h: s.h + (target.h - s.h) * k, a: s.a + (target.a - s.a) * k };
  const f = m.smooth;
  m.visorK += ((m.visor ? 1 : 0) - m.visorK) * 0.15;
  if (m.imgs.photo) {
    // Helmet cut out of the user's own picture; "visor open" lifts it up.
    const hw2 = f.w * 1.42;
    const hh2 = hw2 / m.imgs.ratio;
    ctx.save();
    ctx.translate(f.cx, f.cy - m.visorK * hh2 * 0.62);
    ctx.rotate(f.a);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    ctx.drawImage(m.imgs.photo, -hw2 / 2, -hh2 * 0.44, hw2, hh2);
    ctx.restore();
    return;
  }
  // Helmet artwork: viewBox 108..192 × 4..102, eyes at y≈57.
  const hw = f.w * 1.5;
  const hh = hw * (98 / 84);
  ctx.save();
  ctx.translate(f.cx, f.cy);
  ctx.rotate(f.a);
  const x = -hw / 2;
  const y = -hh * 0.5;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.drawImage(m.imgs.shell, x, y, hw, hh);
  ctx.shadowBlur = 0;
  // Face plate: closed over the face, or swung up over the forehead.
  ctx.save();
  const lift = m.visorK;
  ctx.translate(0, y + hh * 0.18);
  ctx.scale(1, 1 - lift * 0.55);
  ctx.translate(0, -(y + hh * 0.18) - lift * hh * 0.42);
  ctx.globalAlpha = 1 - lift * 0.15;
  ctx.drawImage(m.imgs.face, x, y, hw, hh);
  ctx.restore();
  ctx.restore();
}

export async function openMirror() {
  if (m.root) return;
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'mirror' }));
  const root = el('div', 'mirror');
  root.innerHTML = `<div class="mirror-view"><video playsinline muted></video><canvas></canvas><div class="mirror-hud"><span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span><p class="mirror-title">HELM-MODUS</p><p class="mirror-status">Kamera wird gestartet …</p></div></div>
    <div class="mirror-bar"><button type="button" class="mirror-visor">Visier auf</button><button type="button" class="mirror-close">Helm ab</button></div>`;
  document.body.append(root);
  m.root = root;
  m.video = root.querySelector('video');
  m.canvas = root.querySelector('canvas');
  const status = root.querySelector('.mirror-status');
  root.querySelector('.mirror-close').addEventListener('click', closeMirror);
  root.querySelector('.mirror-visor').addEventListener('click', toggleVisor);
  const suit = ownedSuit() || { farben: { haupt: '#b3121f', akzent: '#d4a64a', leuchten: '#7ff3ff' }, helm: 'klassisch' };
  try {
    m.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    m.video.srcObject = m.stream;
    await m.video.play();
  } catch (error) {
    status.textContent = error.name === 'NotAllowedError' ? 'Kamera nicht erlaubt – bitte im Browser freigeben.' : `Kamera nicht verfügbar: ${error.message}`;
    return;
  }
  status.textContent = 'Helm wird angepasst …';
  m.raf = requestAnimationFrame(frame);
  const own = await suitHelmetImage();
  if (own) m.imgs = { photo: own.img, ratio: own.ratio };
  else {
    const [shell, face] = await Promise.all([svgImage(helmetSvg(suit, { part: 'shell' })), svgImage(helmetSvg(suit, { part: 'face' }))]);
    m.imgs = shell && face ? { shell, face } : null;
  }
  try {
    await Promise.race([detector(), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), 25000))]);
    status.textContent = '';
  } catch (error) {
    status.textContent = `Gesichtserkennung nicht geladen (${error.message}) – Internet prüfen.`;
  }
}

function toggleVisor() {
  m.visor = !m.visor;
  const b = m.root?.querySelector('.mirror-visor');
  if (b) b.textContent = m.visor ? 'Visier zu' : 'Visier auf';
}

export function closeMirror() {
  if (!m.root) return;
  cancelAnimationFrame(m.raf);
  m.stream?.getTracks().forEach((t) => t.stop());
  m.stream = null;
  m.root.remove();
  m.root = null;
  m.smooth = null;
  m.visor = false;
  m.visorK = 0;
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'mirror') closeMirror(); });

export function initMirror(options) { deps = { ...deps, ...options }; }
export function handleMirrorMessage(message) {
  if (message.action === 'an') openMirror();
  else if (message.action === 'visier') { if (!m.root) openMirror(); else toggleVisor(); }
  else if (message.action === 'aus') closeMirror();
}
