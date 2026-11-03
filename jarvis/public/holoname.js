// 3D-Namens-Hologramm: a name or word as shiny red 3D metal (Three.js
// TextGeometry, font with umlauts), assembled from sparks, slowly rotating,
// with a reflective holo floor. Save as picture or 6-second video.
import { loop, perf } from './cae/perf.js';

const FONT = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/optimer_bold.typeface.json';
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let cur = null;
let fontCache = null;
if (typeof document !== 'undefined') document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'holoname') cur?.close(); });

let audio = null;
function tone(f, d, type = 'sine', v = 0.06, to = f, delay = 0) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); const t = audio.currentTime + delay; const o = audio.createOscillator(); const g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.05); } catch { /* no audio */ } }

// keeps only characters the font can draw (umlauts work)
export function cleanText(text, glyphs = null) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return glyphs ? [...t].filter((c) => c === ' ' || glyphs[c]).join('') : t;
}

export async function openHoloName(text) {
  cur?.close();
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'holoname' }));
  const root = el('div', 'hn');
  root.innerHTML = '<div class="hn-stage"></div><p class="hn-kicker">JARVIS · 3D-HOLOGRAMM</p><p class="hn-status">Hologramm wird erzeugt …</p><div class="hn-bar"><button type="button" class="hn-img">💾 Bild</button><button type="button" class="hn-vid">🎬 Video (6 s)</button><button type="button" class="hn-x">Schließen</button></div>';
  document.body.append(root);
  const q = (s) => root.querySelector(s);
  const status = q('.hn-status'); const stage = q('.hn-stage');
  let stop = () => {}; let renderer = null; let scene = null; let closed = false;
  const me = cur = {
    close() {
      if (closed) return; closed = true; stop();
      try { scene?.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); renderer?.dispose(); } catch { /* ignore */ }
      root.remove(); if (cur === me) cur = null;
    }
  };
  q('.hn-x').addEventListener('click', () => me.close());
  let THREE; let TextGeometry; let FontLoader; let RoomEnvironment;
  try {
    THREE = await import('three');
    ({ TextGeometry } = await import('three/addons/geometries/TextGeometry.js'));
    ({ FontLoader } = await import('three/addons/loaders/FontLoader.js'));
    ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
    fontCache = fontCache || await new Promise((res, rej) => new FontLoader().load(FONT, res, undefined, rej));
  } catch { status.textContent = '3D konnte nicht geladen werden (Internet prüfen).'; return; }
  if (closed) return;
  const word = cleanText(text, fontCache.data.glyphs);
  if (!word) { status.textContent = 'Welcher Name soll in 3D erscheinen?'; return; }
  const W = stage.clientWidth || innerWidth; const H = stage.clientHeight || innerHeight;
  renderer = new THREE.WebGLRenderer({ antialias: perf.antialias, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(perf.dpr); renderer.setSize(W, H); renderer.setClearColor(0x050102);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  stage.append(renderer.domElement);
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);
  // text geometry, centred
  const geo = new TextGeometry(word, { font: fontCache, size: 1, depth: 0.32, curveSegments: perf.tier === 'high' ? 8 : 5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: perf.tier === 'high' ? 4 : 2 });
  geo.computeBoundingBox(); geo.center();
  const width = geo.boundingBox.max.x - geo.boundingBox.min.x;
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8141f, metalness: 1, roughness: 0.22, emissive: 0x3a0005, emissiveIntensity: 0.6, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(geo, metal);
  const group = new THREE.Group(); group.add(mesh); scene.add(group);
  // reflection on the holo floor
  const mirror = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2a3d, transparent: true, opacity: 0 }));
  mirror.scale.y = -1; mirror.position.y = -1.5; group.add(mirror);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(Math.max(4, width * 0.8), 64), new THREE.MeshBasicMaterial({ color: 0x1a0306, transparent: true, opacity: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.85; scene.add(floor);
  const rings = [];
  for (let i = 0; i < 3; i += 1) { const r = new THREE.Mesh(new THREE.RingGeometry(1.6 + i * 0.9 + width * 0.25, 1.63 + i * 0.9 + width * 0.25, 96), new THREE.MeshBasicMaterial({ color: 0xff2a3d, transparent: true, opacity: 0.35 - i * 0.08, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.y = -0.84; scene.add(r); rings.push(r); }
  const key = new THREE.PointLight(0xff3344, 40, 30); key.position.set(-3, 2.5, 4); scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 25, 30); rim.position.set(3, 3, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  // sparks that fly in and form the word, then orbit
  const N = perf.tier === 'high' ? 1400 : 700;
  const pos = new Float32Array(N * 3); const start = new Float32Array(N * 3); const goal = new Float32Array(N * 3);
  const pg = geo.attributes.position;
  for (let i = 0; i < N; i += 1) {
    const v = (Math.random() * pg.count) | 0;
    goal[i * 3] = pg.getX(v); goal[i * 3 + 1] = pg.getY(v); goal[i * 3 + 2] = pg.getZ(v);
    const a = Math.random() * Math.PI * 2; const rr = 6 + Math.random() * 6;
    start[i * 3] = Math.cos(a) * rr; start[i * 3 + 1] = (Math.random() - 0.3) * 6; start[i * 3 + 2] = Math.sin(a) * rr;
  }
  pos.set(start);
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffb0b8, size: 0.05, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(sparks);
  // distance so the whole word fits the screen width (also in portrait)
  const fitDist = () => Math.max(6.5, (width / 2 * 1.3) / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect));
  camera.position.set(0, 0.8, fitDist());
  const t0 = performance.now();
  let sounded = false;
  tone(140, 1.6, 'sawtooth', 0.05, 900);
  stop = loop((t, dt) => {
    const k = Math.min(1, (t - t0) / 1800); const e = 1 - (1 - k) ** 3;
    for (let i = 0; i < N * 3; i += 1) pos[i] = start[i] + (goal[i] - start[i]) * e;
    sparkGeo.attributes.position.needsUpdate = true;
    metal.opacity = Math.max(0, (k - 0.55) / 0.45); mirror.material.opacity = metal.opacity * 0.12;
    sparks.material.opacity = k < 1 ? 1 : Math.max(0.12, 1 - (t - t0 - 1800) / 900);
    if (k >= 1 && !sounded) { sounded = true; tone(220, 0.6, 'triangle', 0.08, 110); tone(1760, 0.4, 'sine', 0.04, 880, 0.05); status.textContent = word; }
    group.rotation.y = Math.sin((t - t0) / 2600) * 0.55;
    rings.forEach((r, i) => { r.rotation.z += dt * (0.2 + i * 0.15) * (i % 2 ? -1 : 1); });
    key.position.x = Math.sin(t / 1400) * 4;
    camera.lookAt(0, -0.25, 0);
    renderer.render(scene, camera);
  });
  const onResize = () => { const w2 = stage.clientWidth; const h2 = stage.clientHeight; if (!w2 || !h2) return; renderer.setSize(w2, h2); camera.aspect = w2 / h2; camera.updateProjectionMatrix(); camera.position.z = fitDist(); };
  addEventListener('resize', onResize);
  const oldClose = me.close; me.close = () => { removeEventListener('resize', onResize); oldClose(); };
  // ASCII file names (some browsers drop names with umlauts): Müller → Mueller
  const file = (name) => word.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + name;
  q('.hn-img').addEventListener('click', () => { renderer.domElement.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `jarvis-hologramm-${file('.png')}`; document.body.append(a); a.click(); a.remove(); }, 'image/png'); });
  q('.hn-vid').addEventListener('click', (ev) => {
    const btn = ev.currentTarget; const out = renderer.domElement.captureStream?.(30);
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
    if (!out || !mime) { status.textContent = 'Video-Aufnahme geht in diesem Browser nicht – speichere ein Bild.'; return; }
    const chunks = []; const rec = new MediaRecorder(out, { mimeType: mime });
    rec.ondataavailable = (e2) => { if (e2.data.size) chunks.push(e2.data); };
    rec.onstop = () => { btn.disabled = false; btn.textContent = '🎬 Video (6 s)'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: mime.split(';')[0] })); a.download = `jarvis-hologramm-${file(mime.includes('mp4') ? '.mp4' : '.webm')}`; document.body.append(a); a.click(); a.remove(); };
    btn.disabled = true; btn.textContent = '● Aufnahme …'; rec.start(); setTimeout(() => rec.state === 'recording' && rec.stop(), 6000);
  });
}
