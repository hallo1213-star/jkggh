// Jarvis' face: a photo-realistic AI portrait (always the same face, until you
// ask for a new one). Face landmarks are found once (MediaPipe, loaded on
// demand); then the jaw opens with Jarvis' real voice level and the eyes blink.
// If the landmark model can't load, the face is shown without lip movement.
const SEED_KEY = 'jarvis.face.seed';
const LM_KEY = 'jarvis.face.landmarks';
const PROMPT = 'photorealistic close-up portrait photo of a handsome male humanoid artificial intelligence, calm confident friendly expression, looking straight into the camera, mouth closed, neutral face, symmetrical front view, face centered and filling most of the frame, subtle thin glowing cyan circuit lines on the temples, dark background, cinematic rim lighting, 85mm lens, ultra detailed realistic skin, 8k';
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let deps = { level: () => 0, toast: () => {} };
const face = { on: false, img: null, lm: null, raf: 0, open: 0, blinkAt: 0, nextBlink: 0, canvas: null, stage: null, token: 0 };

function seed() {
  try {
    let s = localStorage.getItem(SEED_KEY);
    if (!s) { s = String(Math.floor(Math.random() * 900000) + 1000); localStorage.setItem(SEED_KEY, s); }
    return s;
  } catch { return '4242'; }
}
const imageUrl = (s) => `/api/video/image?format=1%3A1&seed=${encodeURIComponent(s)}&prompt=${encodeURIComponent(PROMPT)}`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Das Gesicht konnte nicht geladen werden (Bildgenerator antwortet nicht).'));
    img.src = src;
  });
}

async function landmarks(img, s) {
  try { const cached = JSON.parse(localStorage.getItem(LM_KEY) || 'null'); if (cached?.seed === s) return cached.lm; } catch { /* ignore */ }
  const run = (async () => {
    const vision = await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const detector = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'IMAGE', numFaces: 1 });
    const result = detector.detect(img);
    detector.close?.();
    const p = result.faceLandmarks?.[0];
    if (!p) return null;
    const pt = (i) => [p[i].x, p[i].y];
    return { ul: pt(13), ll: pt(14), ml: pt(61), mr: pt(291), chin: pt(152), le: [pt(159), pt(145), pt(33), pt(133)], re: [pt(386), pt(374), pt(362), pt(263)] };
  })();
  const lm = await Promise.race([run, new Promise((r) => setTimeout(() => r(null), 20000))]).catch(() => null);
  if (lm) { try { localStorage.setItem(LM_KEY, JSON.stringify({ seed: s, lm })); } catch { /* ignore */ } }
  return lm;
}

function draw(now) {
  if (!face.on) return;
  face.raf = requestAnimationFrame(draw);
  const c = face.canvas;
  const ctx = c.getContext('2d');
  const W = c.width;
  const { img, lm } = face;
  if (!img) return;
  ctx.drawImage(img, 0, 0, W, W);
  const speaking = document.body.dataset.mode === 'speaking';
  const target = speaking ? Math.min(1, deps.level() * 1.6) : 0;
  face.open += (target - face.open) * (target > face.open ? 0.55 : 0.3);
  const sx = img.naturalWidth / W;
  const sy = img.naturalHeight / W;
  if (lm && face.open > 0.02) {
    // Jaw drop: everything below the lip line moves down a little, strongest in
    // the middle of the mouth, with a dark mouth opening behind it.
    const upperY = lm.ul[1] * W;
    const lowerY = lm.ll[1] * W;
    const mw = (lm.mr[0] - lm.ml[0]) * W;
    const x0 = lm.ml[0] * W - mw * 0.5;
    const x1 = lm.mr[0] * W + mw * 0.5;
    const chinY = lm.chin[1] * W;
    const bottom = Math.min(W, chinY + (chinY - lowerY) * 0.55);
    const d = face.open * (chinY - lowerY) * 0.16;
    const cx = (lm.ml[0] + lm.mr[0]) / 2 * W;
    // soft, dark mouth opening between the lips
    ctx.save();
    ctx.filter = 'blur(1.6px)';
    const gy = lowerY + d * 0.45;
    const g = ctx.createRadialGradient(cx, gy, 0, cx, gy, mw * 0.4);
    g.addColorStop(0, 'rgba(28, 8, 10, 0.95)');
    g.addColorStop(0.55, 'rgba(60, 18, 20, 0.85)');
    g.addColorStop(1, 'rgba(90, 35, 35, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, gy, mw * 0.36, Math.max(1, d * 0.62), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // lower lip, chin and jaw move down – most in the middle, fading to the sides
    for (let x = x0; x < x1; x += 2) {
      const t = (x - x0) / (x1 - x0);
      const off = d * Math.sin(t * Math.PI) ** 1.2;
      ctx.drawImage(img, x * sx, lowerY * sy, 2 * sx, (bottom - lowerY) * sy, x, lowerY + off, 2.2, bottom - lowerY);
    }
  }
  // Blink every few seconds: the eyelid skin above the eye is stretched over it.
  if (lm) {
    if (!face.nextBlink) face.nextBlink = now + 1500 + Math.random() * 3000;
    if (now > face.nextBlink) { face.blinkAt = now; face.nextBlink = now + 2500 + Math.random() * 4000; }
    const k = (now - face.blinkAt) / 140;
    if (k >= 0 && k < 1) {
      const amount = Math.sin(k * Math.PI);
      for (const [top, bot, left, right] of [lm.le, lm.re]) {
        const ex0 = Math.min(left[0], right[0]) * W - 4;
        const ew = Math.abs(right[0] - left[0]) * W + 8;
        const ty = top[1] * W;
        const by = bot[1] * W;
        const lid = Math.max(4, ew * 0.28);
        ctx.drawImage(img, ex0 * sx, (ty - lid) * sy, ew * sx, lid * sy, ex0, ty - lid, ew, lid + (by - ty + 3) * amount);
      }
    }
  }
  // Tiny head movement so he feels alive.
  const t = now / 1000;
  c.style.transform = `perspective(900px) rotateY(${Math.sin(t * 0.4) * 2.2}deg) rotateX(${Math.sin(t * 0.33) * 1.4 - face.open * 1.5}deg) scale(${1 + face.open * 0.008})`;
}

function stageEl() {
  const wrap = document.querySelector('.reactor-wrap');
  if (!wrap) return null;
  let stage = document.getElementById('face-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'face-stage';
    stage.className = 'face-stage';
    stage.innerHTML = '<canvas width="640" height="640" aria-label="Jarvis\' Gesicht"></canvas><span class="face-scan"></span><span class="face-status">Gesicht wird geladen …</span>';
    wrap.prepend(stage);
  }
  return stage;
}

export async function showFace({ fresh = false } = {}) {
  if (fresh) { try { localStorage.removeItem(SEED_KEY); localStorage.removeItem(LM_KEY); } catch { /* ignore */ } face.img = null; face.lm = null; }
  const token = ++face.token;
  face.on = true;
  document.body.classList.add('face-on');
  const stage = stageEl();
  if (!stage) return;
  face.stage = stage;
  face.canvas = stage.querySelector('canvas');
  const status = stage.querySelector('.face-status');
  stage.classList.remove('ready');
  status.textContent = 'Gesicht wird geladen …';
  cancelAnimationFrame(face.raf);
  try {
    const s = seed();
    if (!face.img) face.img = await loadImage(imageUrl(s));
    if (token !== face.token) return;
    stage.classList.add('ready');
    status.textContent = '';
    face.raf = requestAnimationFrame(draw);
    if (!face.lm) {
      face.lm = await landmarks(face.img, s);
      if (!face.lm && token === face.token) status.textContent = 'Lippen-Animation gerade nicht verfügbar';
    }
  } catch (error) {
    if (token !== face.token) return;
    deps.toast(error.message, 'error');
    hideFace();
  }
}

export function hideFace() {
  face.on = false;
  face.token += 1;
  cancelAnimationFrame(face.raf);
  document.body.classList.remove('face-on');
  document.getElementById('face-stage')?.remove();
}

export function initFace(options) { deps = { ...deps, ...options }; }
export function handleFaceMessage(message) {
  if (message.action === 'zeigen') showFace();
  else if (message.action === 'neu') showFace({ fresh: true });
  else if (message.action === 'verstecken') hideFace();
}
