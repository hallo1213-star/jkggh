// Video Studio: text → concept → scenes → own renderer + AI images + voice →
// timeline editing → MP4 export (MediaRecorder; server converts WebM if needed).
import { FORMAT_SIZE, renderFrame, timeline, TRANSITION_SECONDS } from './video-renderer.js';
import { buildSoundtrack, VOICE_DELAY } from './video-audio.js';

const TYPE_INFO = {
  city: ['🌃', 'Stadt bei Nacht', 'renderer'],
  hologram: ['🔷', 'Hologramm', 'renderer'],
  interface: ['🖥️', 'Benutzeroberfläche', 'renderer'],
  logo: ['✨', 'Logo-Enthüllung', 'renderer'],
  particles: ['🌌', 'Partikel-Galaxie', 'renderer'],
  space: ['🚀', 'Weltraum', 'renderer'],
  synthwave: ['🌅', 'Retro-Landschaft', 'renderer'],
  text: ['🔤', 'Text-Animation', 'renderer'],
  image: ['🖼️', 'KI-Bild + Kamerafahrt', 'kibild'],
  ai_video: ['🎬', 'Echtes KI-Video', 'kivideo']
};
const KIND_LABEL = { renderer: 'Eigener Renderer', kibild: 'KI-Bild (animiert)', kivideo: 'KI-Video (Replicate)' };
const TRANSITION_LABEL = { fade: 'Überblenden', slide: 'Schieben', zoom: 'Zoom', wipe: 'Wischen', glitch: 'Glitch', none: 'Harter Schnitt' };
const CAMERA_LABEL = { push: 'Heranfahren', pull: 'Herausfahren', 'pan-left': 'Schwenk links', 'pan-right': 'Schwenk rechts', orbit: 'Kreisen', static: 'Statisch' };
const MUSIC_LABEL = { epic: 'Episch', tech: 'Tech / Elektro', chill: 'Ruhig', none: 'Keine Musik' };

let ctx = { send: () => false, toast: () => {} };
let ui = null;
let project = null;
let status = { llm: false, voice: false, mp4Server: false, aiVideo: { enabled: false } };
let selected = null;
const assets = { images: new Map(), clips: new Map(), imageErrors: new Set(), preview: true };
const voices = new Map(); // sceneId → AudioBuffer (for the current text)
let soundtrack = null;
let soundtrackTimer = null;
let audioCtx = null;
let playing = null; // { source, start }
let time = 0;
let raf = 0;
let saveTimer = null;
let busy = false;
let dragging = false; // no timeline rebuild while a block is being dragged

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hash = (text) => { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const newId = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0');

// --- storage (IndexedDB on the device) ---------------------------------------------
let dbPromise = null;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('jarvis-video', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'id' });
      request.result.createObjectStore('assets');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
async function idb(store, mode, fn) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
const getAsset = (key) => idb('assets', 'readonly', (s) => s.get(key)).catch(() => null);
const putAsset = (key, value) => idb('assets', 'readwrite', (s) => s.put(value, key)).catch(() => {});
const listProjects = () => idb('projects', 'readonly', (s) => s.getAll()).catch(() => []);

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!project) return;
    project.updatedAt = Date.now();
    idb('projects', 'readwrite', (s) => s.put(project)).catch(() => {});
    ctx.send({ type: 'video_current', project });
  }, 500);
}

// --- server ---------------------------------------------------------------------------
async function api(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Fehler ${response.status}`);
  return data;
}

// --- UI skeleton ------------------------------------------------------------------------
function build() {
  if (ui) return ui;
  const overlay = el('div', 'vs-overlay');
  overlay.hidden = true;
  overlay.innerHTML = `
    <header class="vs-top">
      <div class="vs-brand"><span class="vs-mark"></span><b>VIDEO STUDIO</b></div>
      <input class="vs-title" aria-label="Titel des Videos" maxlength="80">
      <div class="vs-top-actions">
        <button class="vs-btn ghost" data-act="projects" type="button">📁 Projekte</button>
        <button class="vs-btn primary" data-act="export" type="button">⬇️ Exportieren</button>
        <button class="vs-icon" data-act="close" type="button" aria-label="Video Studio schließen">✕</button>
      </div>
    </header>
    <form class="vs-prompt">
      <textarea rows="2" maxlength="600" placeholder="Beschreibe dein Video … z. B. „30-sekündige Werbung für meinen Jarvis“ oder „Realistisches Video einer futuristischen Stadt bei Nacht“"></textarea>
      <div class="vs-prompt-row">
        <select class="vs-sel" name="duration" aria-label="Länge"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="45">45 s</option><option value="60">60 s</option></select>
        <div class="vs-seg" role="group" aria-label="Format"><button type="button" data-format="16:9" class="on">16:9</button><button type="button" data-format="9:16">9:16</button><button type="button" data-format="1:1">1:1</button></div>
        <label class="vs-check"><input type="checkbox" name="voice" checked> Sprecherstimme</label>
        <button class="vs-btn primary" type="submit">✨ Video erstellen</button>
      </div>
    </form>
    <main class="vs-main">
      <section class="vs-stage">
        <div class="vs-canvas-wrap"><canvas class="vs-canvas"></canvas><div class="vs-busy" hidden><span class="vs-spinner"></span><p></p></div></div>
        <div class="vs-transport">
          <button class="vs-icon play" data-act="play" type="button" aria-label="Abspielen">▶</button>
          <span class="vs-time">0:00 / 0:00</span>
          <input class="vs-scrub" type="range" min="0" max="1000" value="0" aria-label="Position">
        </div>
        <div class="vs-badges"></div>
      </section>
      <aside class="vs-inspector"></aside>
    </main>
    <section class="vs-timeline">
      <div class="vs-tl-head">
        <b>Timeline</b>
        <div class="vs-tl-actions">
          <button class="vs-btn small" data-act="add" type="button">＋ Szene</button>
          <button class="vs-btn small" data-act="voices" type="button">🎙️ Stimme erzeugen</button>
          <select class="vs-sel small" data-field="music" aria-label="Musik"></select>
          <input type="color" class="vs-color" data-field="accent" aria-label="Akzentfarbe">
        </div>
      </div>
      <div class="vs-tracks">
        <div class="vs-ruler"></div>
        <div class="vs-track scenes"></div>
        <div class="vs-track voice"></div>
        <div class="vs-playhead"></div>
      </div>
      <form class="vs-ai-edit"><input maxlength="300" placeholder="✨ Mit KI ändern: z. B. „Mach Szene 2 länger und den Text auffälliger“"><button class="vs-btn small" type="submit">Ändern</button></form>
    </section>
    <div class="vs-drawer" hidden></div>
    <div class="vs-modal" hidden></div>`;
  document.body.append(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  ui = {
    overlay,
    title: $('.vs-title'),
    prompt: $('.vs-prompt'),
    canvas: $('.vs-canvas'),
    wrap: $('.vs-canvas-wrap'),
    busy: $('.vs-busy'),
    play: $('[data-act="play"]'),
    time: $('.vs-time'),
    scrub: $('.vs-scrub'),
    badges: $('.vs-badges'),
    inspector: $('.vs-inspector'),
    tracks: $('.vs-tracks'),
    ruler: $('.vs-ruler'),
    scenes: $('.vs-track.scenes'),
    voiceTrack: $('.vs-track.voice'),
    playhead: $('.vs-playhead'),
    music: $('[data-field="music"]'),
    accent: $('[data-field="accent"]'),
    aiEdit: $('.vs-ai-edit'),
    drawer: $('.vs-drawer'),
    modal: $('.vs-modal')
  };
  for (const [k, v] of Object.entries(MUSIC_LABEL)) ui.music.append(Object.assign(el('option', '', v), { value: k }));
  let format = '16:9';
  overlay.querySelectorAll('.vs-seg button').forEach((b) => b.addEventListener('click', () => {
    format = b.dataset.format;
    overlay.querySelectorAll('.vs-seg button').forEach((x) => x.classList.toggle('on', x === b));
    if (project) { project.format = format; changed({ images: true }); }
  }));
  ui.prompt.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = ui.prompt.querySelector('textarea').value.trim();
    if (!text) { ctx.toast('Beschreibe zuerst dein Video.', 'error'); return; }
    // A length in the text ("12-sekündige Werbung") wins over the drop-down.
    const saysLength = /\d+\s*(?:-|–)?\s*(?:sek|sekunden|s\b|sec|min)/i.test(text);
    createFromText(text, { duration: saysLength ? undefined : Number(ui.prompt.elements.duration.value), format, voice: ui.prompt.elements.voice.checked });
  });
  ui.title.addEventListener('input', () => { if (project) { project.title = ui.title.value.slice(0, 80); scheduleSave(); } });
  ui.music.addEventListener('change', () => { project.music = ui.music.value; changed({ sound: true }); });
  ui.accent.addEventListener('input', () => { project.accent = ui.accent.value; changed({}); });
  ui.scrub.addEventListener('input', () => { pause(); time = (ui.scrub.value / 1000) * timeline(project).total; draw(); });
  ui.aiEdit.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = ui.aiEdit.querySelector('input');
    if (input.value.trim()) aiEdit(input.value.trim()).then(() => { input.value = ''; });
  });
  overlay.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') closeStudio();
    else if (act === 'play') togglePlay();
    else if (act === 'add') addScene();
    else if (act === 'voices') generateVoices();
    else if (act === 'export') openExport();
    else if (act === 'projects') openProjects();
  });
  document.addEventListener('keydown', (event) => {
    if (overlay.hidden || /input|textarea|select/i.test(event.target.tagName)) return;
    if (event.key === ' ') { event.preventDefault(); togglePlay(); }
    if (event.key === 'Escape' && ui.modal.hidden && ui.drawer.hidden) closeStudio();
  });
  new ResizeObserver(() => { fitCanvas(); renderTimeline(); }).observe(ui.wrap);
  return ui;
}

function setBusy(text) {
  busy = Boolean(text);
  ui.busy.hidden = !text;
  ui.busy.querySelector('p').textContent = text || '';
}

// --- project lifecycle --------------------------------------------------------------------
function fitCanvas() {
  if (!project) return;
  const [W, H] = FORMAT_SIZE[project.format];
  const box = ui.wrap.getBoundingClientRect();
  const scale = Math.min(box.width / W, box.height / H) || 0.3;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ui.canvas.style.width = `${Math.floor(W * scale)}px`;
  ui.canvas.style.height = `${Math.floor(H * scale)}px`;
  ui.canvas.width = Math.round(W * scale * dpr);
  ui.canvas.height = Math.round(H * scale * dpr);
  draw();
}

function draw() {
  if (!project) return;
  const g = ui.canvas.getContext('2d');
  const W = ui.canvas.width;
  const H = ui.canvas.height;
  const [FW] = FORMAT_SIZE[project.format];
  // Render in the export coordinate system, scaled to the preview size.
  g.setTransform(W / FW, 0, 0, W / FW, 0, 0);
  syncClips();
  renderFrame(g, FW, FORMAT_SIZE[project.format][1], project, time, assets);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const total = timeline(project).total;
  ui.time.textContent = `${fmt(time)} / ${fmt(total)}`;
  ui.scrub.value = String(total ? Math.round((time / total) * 1000) : 0);
  const pps = pixelsPerSecond();
  ui.playhead.style.transform = `translateX(${time * pps}px)`;
}

function syncClips() {
  const { items } = timeline(project);
  for (const { scene, start, end } of items) {
    const video = assets.clips.get(scene.id);
    if (!video) continue;
    const inScene = time >= start - 0.1 && time < end;
    if (inScene && playing) {
      if (Math.abs(video.currentTime - (time - start)) > 0.35) video.currentTime = Math.max(0, time - start);
      if (video.paused) video.play().catch(() => {});
    } else {
      if (!video.paused) video.pause();
      if (inScene) video.currentTime = Math.max(0, time - start);
    }
  }
}

export async function openVideoStudio(next) {
  build();
  ui.overlay.hidden = false;
  document.body.classList.add('vs-open');
  api('/api/video/status').then((s) => { status = s; renderBadges(); }).catch(() => {});
  if (next) await loadProject(next);
  else if (!project) {
    const list = (await listProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
    if (list[0]) await loadProject(list[0]);
    else await loadProject(starterProject());
  }
  fitCanvas();
}

function closeStudio() {
  pause();
  ui.overlay.hidden = true;
  document.body.classList.remove('vs-open');
}

function starterProject() {
  return {
    id: newId(), title: 'Mein erstes Video', format: '16:9', accent: '#ff7a1a', music: 'epic', voice: true, createdAt: Date.now(), updatedAt: Date.now(),
    scenes: [
      { id: newId(), type: 'space', duration: 4, title: '', caption: 'Beschreibe oben dein Video – Jarvis erstellt es.', voiceover: '', transition: 'zoom', camera: 'push', prompt: '', seed: 11 },
      { id: newId(), type: 'logo', duration: 4, title: 'VIDEO STUDIO', caption: '', voiceover: '', transition: 'fade', camera: 'pull', prompt: '', seed: 22 }
    ]
  };
}

async function loadProject(next) {
  pause();
  project = JSON.parse(JSON.stringify(next));
  selected = project.scenes[0]?.id || null;
  time = 0;
  assets.images.clear();
  assets.clips.clear();
  assets.imageErrors.clear();
  voices.clear();
  soundtrack = null;
  ui.title.value = project.title;
  ui.music.value = project.music;
  ui.accent.value = project.accent;
  ui.overlay.querySelectorAll('.vs-seg button').forEach((b) => b.classList.toggle('on', b.dataset.format === project.format));
  fitCanvas();
  renderTimeline();
  renderInspector();
  renderBadges();
  scheduleSave();
  await Promise.all([loadImages(), loadClips(), loadCachedVoices()]);
  rebuildSoundtrack();
}

// What changed → what to reload.
function changed({ images = false, sound = false, structure = false } = {}) {
  if (images) loadImages();
  if (sound || structure) rebuildSoundtrack();
  renderTimeline();
  if (structure) renderInspector();
  fitCanvas();
  scheduleSave();
}

// --- AI planning ----------------------------------------------------------------------------
async function createFromText(text, options) {
  if (busy) return;
  setBusy('Jarvis plant das Video-Konzept …');
  try {
    const { project: planned } = await api('/api/video/plan', { description: text, ...options });
    setBusy('');
    await loadProject(planned);
    ctx.toast(planned.planner === 'vorlage' ? 'Video aus einer Vorlage erstellt (kein KI-Schlüssel).' : `Konzept fertig: ${planned.scenes.length} Szenen`);
    if (options.voice && status.voice && planned.scenes.some((s) => s.voiceover)) generateVoices({ quiet: true });
  } catch (error) {
    setBusy('');
    ctx.toast(error.message, 'error');
  }
}

async function aiEdit(instruction) {
  if (busy) return;
  setBusy('Jarvis ändert das Video …');
  try {
    const { project: next } = await api('/api/video/edit', { project, instruction });
    setBusy('');
    await loadProject(next);
    ctx.toast('Video geändert');
  } catch (error) {
    setBusy('');
    ctx.toast(error.message, 'error');
  }
}

// --- assets: AI images, clips, voices ----------------------------------------------------------
const imageKey = (scene) => `img:${project.format}:${scene.seed}:${hash(scene.prompt)}`;
async function blobToImage(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

let imageRun = 0;
async function loadImages() {
  const run = ++imageRun;
  const scenes = project.scenes.filter((s) => s.type === 'image' && s.prompt);
  for (const scene of scenes) {
    if (run !== imageRun) return;
    const key = imageKey(scene);
    if (assets.images.get(scene.id)?.key === key) continue;
    assets.imageErrors.delete(scene.id);
    try {
      let blob = await getAsset(key);
      if (!blob) {
        const response = await fetch(`/api/video/image?prompt=${encodeURIComponent(scene.prompt)}&format=${encodeURIComponent(project.format)}&seed=${scene.seed}`);
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Bild nicht verfügbar');
        blob = await response.blob();
        putAsset(key, blob);
      }
      const image = await blobToImage(blob);
      image.key = key;
      assets.images.set(scene.id, image);
    } catch (error) {
      assets.imageErrors.add(scene.id);
      ctx.toast(`Szene „${scene.title || scene.caption || 'KI-Bild'}“: ${error.message}`, 'error');
    }
    renderThumbs();
    if (!playing) draw();
  }
}

async function loadClips() {
  for (const scene of project.scenes.filter((s) => s.type === 'ai_video' && s.clip)) {
    const blob = await getAsset(`clip:${scene.clip}`);
    if (!blob) continue;
    const video = el('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.src = URL.createObjectURL(blob);
    await new Promise((resolve) => { video.onloadeddata = resolve; video.onerror = resolve; setTimeout(resolve, 5000); });
    assets.clips.set(scene.id, video);
  }
}

function ensureAudio() {
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

async function decode(arrayBuffer) {
  const ac = ensureAudio();
  return new Promise((resolve, reject) => ac.decodeAudioData(arrayBuffer.slice(0), resolve, reject));
}

const voiceKey = (text) => `voice:${hash(text)}`;
async function loadCachedVoices() {
  for (const scene of project.scenes) {
    if (!scene.voiceover) continue;
    const data = await getAsset(voiceKey(scene.voiceover));
    if (data) {
      try { voices.set(scene.id, Object.assign(await decode(data), { text: scene.voiceover })); } catch { /* ignore */ }
    }
  }
  renderTimeline();
}

async function generateVoices({ quiet = false } = {}) {
  if (!status.voice) { ctx.toast('Für die Sprecherstimme fehlt der Deepgram-Schlüssel.', 'error'); return; }
  const todo = project.scenes.filter((s) => s.voiceover && voices.get(s.id)?.text !== s.voiceover);
  if (!todo.length) { if (!quiet) ctx.toast(project.scenes.some((s) => s.voiceover) ? 'Alle Sprechtexte sind schon vertont.' : 'Keine Sprechtexte – trag in den Szenen einen Sprechtext ein.'); return; }
  const chars = todo.reduce((n, s) => n + s.voiceover.length, 0);
  setBusy(`Sprecherstimme wird erzeugt (${todo.length} Texte, ${chars} Zeichen) …`);
  let stretched = 0;
  try {
    for (const scene of todo) {
      let data = await getAsset(voiceKey(scene.voiceover));
      if (!data) {
        const response = await fetch('/api/video/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: scene.voiceover }) });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Stimme nicht verfügbar');
        data = await response.arrayBuffer();
        putAsset(voiceKey(scene.voiceover), data);
      }
      const buffer = Object.assign(await decode(data), { text: scene.voiceover });
      voices.set(scene.id, buffer);
      // Sync: the scene lasts at least as long as its sentence.
      const need = Math.ceil((buffer.duration + VOICE_DELAY + 0.5) * 10) / 10;
      if (scene.duration < need) { scene.duration = Math.min(need, 20); stretched += 1; }
    }
    setBusy('');
    ctx.toast(stretched ? `Stimme fertig – ${stretched} Szene(n) verlängert, damit der Text ganz passt.` : 'Stimme fertig und synchronisiert.');
  } catch (error) {
    setBusy('');
    ctx.toast(error.message, 'error');
  }
  changed({ sound: true, structure: true });
}

function rebuildSoundtrack() {
  clearTimeout(soundtrackTimer);
  soundtrackTimer = setTimeout(async () => {
    if (!project) return;
    const current = new Map([...voices].filter(([id, buf]) => project.scenes.find((s) => s.id === id)?.voiceover === buf.text));
    try {
      soundtrack = await buildSoundtrack(project, current);
    } catch (error) {
      soundtrack = null;
      console.warn('Soundtrack', error);
    }
  }, 300);
}

// --- playback --------------------------------------------------------------------------------
function togglePlay() {
  if (playing) pause(); else play();
}

function play() {
  if (!project) return;
  const total = timeline(project).total;
  if (time >= total - 0.05) time = 0;
  const ac = ensureAudio();
  let source = null;
  if (soundtrack) {
    source = ac.createBufferSource();
    source.buffer = soundtrack;
    source.connect(ac.destination);
    source.start(0, time);
  }
  playing = { source, clock: ac.currentTime - time };
  ui.play.textContent = '❚❚';
  const loop = () => {
    if (!playing) return;
    time = ac.currentTime - playing.clock;
    if (time >= total) { time = total; pause(); draw(); return; }
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function pause() {
  if (!playing) return;
  try { playing.source?.stop(); } catch { /* already stopped */ }
  playing = null;
  cancelAnimationFrame(raf);
  ui.play.textContent = '▶';
  syncClips();
}

// --- timeline --------------------------------------------------------------------------------
function pixelsPerSecond() {
  const total = timeline(project).total || 1;
  const width = ui.tracks.clientWidth || 600;
  return Math.max(28, (width - 16) / total);
}

const thumbs = new Map();
function renderThumbs() {
  const [W, H] = FORMAT_SIZE[project.format];
  const { items } = timeline(project);
  for (const { scene } of items) {
    const canvas = ui.scenes.querySelector(`[data-id="${scene.id}"] canvas`);
    if (!canvas) continue;
    const sig = JSON.stringify([scene, project.format, project.accent, assets.images.get(scene.id)?.key]);
    if (thumbs.get(scene.id) === sig && canvas.dataset.drawn) continue;
    thumbs.set(scene.id, sig);
    canvas.width = 160;
    canvas.height = Math.round(160 * (H / W));
    const g = canvas.getContext('2d');
    g.setTransform(160 / W, 0, 0, 160 / W, 0, 0);
    try {
      renderFrame(g, W, H, { ...project, scenes: [scene] }, scene.duration * 0.6, { ...assets, preview: false });
    } catch { /* thumbnail only */ }
    canvas.dataset.drawn = '1';
  }
}

function renderTimeline() {
  if (!project || !ui || dragging) return;
  const { items, total } = timeline(project);
  const pps = pixelsPerSecond();
  const width = total * pps;
  ui.scenes.style.width = ui.voiceTrack.style.width = ui.ruler.style.width = `${width}px`;
  ui.ruler.replaceChildren(...Array.from({ length: Math.floor(total) + 1 }, (_, s) => {
    const tick = el('span', s % 5 === 0 ? 'major' : '', s % 5 === 0 ? fmt(s) : '');
    tick.style.left = `${s * pps}px`;
    return tick;
  }));
  ui.scenes.replaceChildren(...items.map(({ scene, start }, index) => {
    const [icon, name, kind] = TYPE_INFO[scene.type] || TYPE_INFO.particles;
    const block = el('div', `vs-block kind-${kind}${scene.id === selected ? ' sel' : ''}`);
    block.dataset.id = scene.id;
    block.style.left = `${start * pps}px`;
    block.style.width = `${scene.duration * pps - 3}px`;
    const thumb = el('canvas');
    const label = el('span', 'vs-block-label');
    label.append(el('b', '', `${index + 1}. ${icon} ${name}`), el('small', '', `${scene.duration.toFixed(1).replace('.', ',')} s${scene.transition !== 'none' ? ` · ${TRANSITION_LABEL[scene.transition]}` : ''}`));
    const handle = el('span', 'vs-handle');
    handle.title = 'Ziehen = Dauer ändern';
    block.append(thumb, label, handle);
    if (scene.transition !== 'none' && index < items.length - 1) {
      const tr = el('span', 'vs-tr');
      tr.style.width = `${Math.min(TRANSITION_SECONDS, scene.duration * 0.4) * pps}px`;
      block.append(tr);
    }
    attachDrag(block, handle, scene);
    return block;
  }));
  ui.voiceTrack.replaceChildren(...items.filter(({ scene }) => scene.voiceover).map(({ scene, start }) => {
    const buf = voices.get(scene.id);
    const ok = buf?.text === scene.voiceover;
    const clip = el('div', `vs-voice${ok ? '' : ' pending'}`, ok ? `🎙️ ${scene.voiceover}` : `🎙️ (noch nicht erzeugt) ${scene.voiceover}`);
    clip.style.left = `${(start + VOICE_DELAY) * pps}px`;
    clip.style.width = `${Math.max((ok ? buf.duration : scene.voiceover.length / 14) * pps, 24)}px`;
    return clip;
  }));
  renderThumbs();
  draw();
}

function attachDrag(block, handle, scene) {
  block.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    const resize = event.target === handle;
    const startX = event.clientX;
    const startDur = scene.duration;
    let moved = false;
    dragging = true;
    block.setPointerCapture(event.pointerId);
    const move = (e) => {
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 6) return;
      moved = true;
      const pps = pixelsPerSecond();
      if (resize) {
        scene.duration = Math.min(Math.max(Math.round((startDur + dx / pps) * 10) / 10, 1.5), 20);
        block.style.width = `${scene.duration * pps - 3}px`;
        block.querySelector('small').textContent = `${scene.duration.toFixed(1).replace('.', ',')} s`;
      } else {
        block.style.transform = `translateX(${dx}px)`;
        block.classList.add('dragging');
      }
    };
    const up = (e) => {
      block.removeEventListener('pointermove', move);
      block.removeEventListener('pointerup', up);
      block.removeEventListener('pointercancel', up);
      dragging = false;
      if (!moved) { select(scene.id); return; }
      if (resize) { changed({ sound: true, structure: true }); return; }
      // reorder: drop position by the block's centre
      const pps = pixelsPerSecond();
      const rect = ui.scenes.getBoundingClientRect();
      const centreTime = (block.getBoundingClientRect().left + block.offsetWidth / 2 - rect.left) / pps;
      const others = project.scenes.filter((s) => s.id !== scene.id);
      let t = 0;
      let index = others.length;
      for (let i = 0; i < others.length; i++) {
        if (centreTime < t + others[i].duration / 2) { index = i; break; }
        t += others[i].duration;
      }
      others.splice(index, 0, scene);
      project.scenes = others;
      selected = scene.id;
      changed({ sound: true, structure: true });
      void e;
    };
    block.addEventListener('pointermove', move);
    block.addEventListener('pointerup', up);
    block.addEventListener('pointercancel', up);
  });
}

function select(id) {
  selected = id;
  const item = timeline(project).items.find((it) => it.scene.id === id);
  if (item && !playing) time = item.start + Math.min(item.scene.duration * 0.5, 1.5);
  renderTimeline();
  renderInspector();
}

function addScene() {
  const index = Math.max(project.scenes.findIndex((s) => s.id === selected), project.scenes.length - 1);
  const scene = { id: newId(), type: 'text', duration: 4, title: 'Neue Szene', caption: '', voiceover: '', transition: 'fade', camera: 'push', prompt: '', seed: Math.floor(Math.random() * 1e6) };
  project.scenes.splice(index + 1, 0, scene);
  select(scene.id);
  changed({ sound: true, structure: true });
}

// --- inspector --------------------------------------------------------------------------------
function field(label, input, hint) {
  const wrap = el('label', 'vs-field');
  wrap.append(el('span', '', label), input);
  if (hint) wrap.append(el('small', '', hint));
  return wrap;
}
function selectBox(options, value) {
  const s = el('select', 'vs-sel');
  for (const [k, v] of Object.entries(options)) s.append(Object.assign(el('option', '', v), { value: k }));
  s.value = value;
  return s;
}

function renderInspector() {
  const box = ui.inspector;
  const scene = project?.scenes.find((s) => s.id === selected);
  if (!scene) {
    box.replaceChildren(el('p', 'vs-muted', 'Wähle unten eine Szene aus.'));
    return;
  }
  const index = project.scenes.indexOf(scene);
  const [icon, , kind] = TYPE_INFO[scene.type] || TYPE_INFO.particles;
  const head = el('div', 'vs-insp-head');
  head.append(el('b', '', `${icon} Szene ${index + 1}`), el('span', `vs-kind kind-${kind}`, KIND_LABEL[kind]));
  const types = Object.fromEntries(Object.entries(TYPE_INFO).filter(([k]) => k !== 'ai_video' || scene.type === 'ai_video').map(([k, [i, n]]) => [k, `${i} ${n}`]));
  const type = selectBox(types, scene.type);
  type.addEventListener('change', () => { scene.type = type.value; if (scene.type === 'image' && !scene.prompt) scene.prompt = `${scene.title || project.title}, cinematic film still, dramatic light`; changed({ images: true, structure: true }); });
  const dur = Object.assign(el('input', 'vs-range'), { type: 'range', min: '1.5', max: '20', step: '0.5', value: String(scene.duration) });
  const durLabel = el('span', 'vs-muted', `${scene.duration.toFixed(1).replace('.', ',')} s`);
  dur.addEventListener('input', () => { scene.duration = Number(dur.value); durLabel.textContent = `${scene.duration.toFixed(1).replace('.', ',')} s`; renderTimeline(); });
  dur.addEventListener('change', () => changed({ sound: true }));
  const durWrap = el('div', 'vs-inline');
  durWrap.append(dur, durLabel);
  const text = (value, max, onInput, rows = 0) => {
    const input = rows ? el('textarea', 'vs-input') : el('input', 'vs-input');
    if (rows) input.rows = rows;
    input.maxLength = max;
    input.value = value;
    input.addEventListener('input', () => onInput(input.value));
    input.addEventListener('change', () => changed({ sound: true }));
    return input;
  };
  const title = text(scene.title, 80, (v) => { scene.title = v; draw(); renderThumbsSoon(); });
  const caption = text(scene.caption, 160, (v) => { scene.caption = v; draw(); renderThumbsSoon(); });
  const voice = text(scene.voiceover, 400, (v) => { scene.voiceover = v; renderTimelineSoon(); }, 2);
  const transition = selectBox(TRANSITION_LABEL, scene.transition);
  transition.addEventListener('change', () => { scene.transition = transition.value; changed({ sound: true }); });
  const camera = selectBox(CAMERA_LABEL, scene.camera);
  camera.addEventListener('change', () => { scene.camera = camera.value; changed({}); });
  const parts = [head, field('Szenen-Typ', type), field('Dauer', durWrap), field('Großer Text im Bild', title), field('Untertitel', caption), field('Sprechtext (Sprecherstimme)', voice, status.voice ? 'Nach Änderungen „🎙️ Stimme erzeugen“ tippen.' : 'Sprecherstimme braucht den Deepgram-Schlüssel.'), field('Übergang zur nächsten Szene', transition), field('Kamerafahrt', camera)];
  if (scene.type === 'image') {
    const prompt = text(scene.prompt, 600, (v) => { scene.prompt = v; }, 3);
    prompt.addEventListener('change', () => changed({ images: true }));
    const reroll = el('button', 'vs-btn small', '🎲 Neues Bild');
    reroll.type = 'button';
    reroll.addEventListener('click', () => { scene.seed = Math.floor(Math.random() * 1e6); changed({ images: true }); });
    parts.push(field('Bildmotiv (am besten Englisch)', prompt, 'KI-Bild von Pollinations (kostenlos), im Video mit Kamerafahrt animiert – kein KI-Video.'), reroll);
  }
  if (status.aiVideo?.enabled && (scene.type === 'image' || scene.type === 'ai_video')) {
    const ai = el('button', 'vs-btn warn', scene.type === 'ai_video' ? '🎬 KI-Video neu erzeugen (kostenpflichtig)' : '🎬 Als echtes KI-Video erzeugen (kostenpflichtig)');
    ai.type = 'button';
    ai.addEventListener('click', () => confirmAiClip(scene));
    parts.push(ai);
  }
  const actions = el('div', 'vs-insp-actions');
  const mk = (label, fn, cls = 'vs-btn small') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  actions.append(
    mk('◀', () => { if (index > 0) { project.scenes.splice(index, 1); project.scenes.splice(index - 1, 0, scene); changed({ sound: true, structure: true }); } }),
    mk('▶', () => { if (index < project.scenes.length - 1) { project.scenes.splice(index, 1); project.scenes.splice(index + 1, 0, scene); changed({ sound: true, structure: true }); } }),
    mk('⧉ Duplizieren', () => { const copy = { ...scene, id: newId() }; project.scenes.splice(index + 1, 0, copy); selected = copy.id; changed({ images: true, sound: true, structure: true }); }),
    mk('🗑 Löschen', () => { if (project.scenes.length < 2) { ctx.toast('Ein Video braucht mindestens eine Szene.', 'error'); return; } project.scenes.splice(index, 1); selected = project.scenes[Math.max(0, index - 1)].id; changed({ sound: true, structure: true }); }, 'vs-btn small danger')
  );
  parts.push(actions);
  box.replaceChildren(...parts);
}
let softTimer = null;
const renderThumbsSoon = () => { clearTimeout(softTimer); softTimer = setTimeout(() => { renderThumbs(); scheduleSave(); }, 400); };
const renderTimelineSoon = () => { clearTimeout(softTimer); softTimer = setTimeout(() => { renderTimeline(); scheduleSave(); }, 400); };

function renderBadges() {
  if (!ui) return;
  const kinds = new Set(project?.scenes.map((s) => TYPE_INFO[s.type]?.[2]));
  const list = [
    ['🎨', 'Eigener Renderer (Canvas)', kinds.has('renderer')],
    ['🖼️', 'KI-Bilder (Pollinations, kostenlos) mit Kamerafahrt', kinds.has('kibild')],
    ['🎬', 'Echte KI-Videos (Replicate)', kinds.has('kivideo')],
    ['🎙️', status.voice ? 'Stimme: Deepgram (verbraucht dein Guthaben)' : 'Stimme: nicht eingerichtet', true],
    ['🎵', 'Musik: eigener Synthesizer', project?.music !== 'none']
  ];
  ui.badges.replaceChildren(...list.filter(([, , on]) => on).map(([i, t]) => el('span', 'vs-badge', `${i} ${t}`)));
}

// --- paid AI clips (only with explicit confirmation) --------------------------------------------
function modal(content) {
  ui.modal.replaceChildren(content);
  ui.modal.hidden = false;
  return () => { ui.modal.hidden = true; ui.modal.replaceChildren(); };
}

function confirmAiClip(scene) {
  const box = el('div', 'vs-dialog');
  const prompt = Object.assign(el('textarea', 'vs-input'), { rows: 3, maxLength: 800, value: scene.prompt || scene.title || '' });
  const yes = el('button', 'vs-btn warn', 'Ja, kostenpflichtig erzeugen');
  const no = el('button', 'vs-btn ghost', 'Abbrechen');
  yes.type = no.type = 'button';
  box.append(el('h3', '', '🎬 Echtes KI-Video erzeugen'), el('p', '', `Modell: ${status.aiVideo.model}`), el('p', 'vs-warn', `💶 Kosten: ${status.aiVideo.price}. Abgerechnet über DEINEN Replicate-Schlüssel.`), field('Was soll im Clip passieren? (am besten Englisch)', prompt), el('p', 'vs-muted', 'Die Generierung dauert meist 1–5 Minuten. Erst nach „Ja“ wird etwas gestartet.'));
  const row = el('div', 'vs-insp-actions');
  row.append(no, yes);
  box.append(row);
  const close = modal(box);
  no.addEventListener('click', close);
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    try {
      const { id } = await api('/api/video/ai-clip', { prompt: prompt.value, format: project.format, confirmed: true });
      close();
      setBusy('Echtes KI-Video wird erzeugt (1–5 Minuten) …');
      for (;;) {
        await new Promise((r) => setTimeout(r, 6000));
        const st = await api(`/api/video/ai-clip?id=${encodeURIComponent(id)}`);
        if (st.status === 'fertig') break;
        if (st.status === 'fehler') throw new Error(st.error || 'Fehlgeschlagen');
      }
      const blob = await (await fetch(`/api/video/ai-clip/file?id=${encodeURIComponent(id)}`)).blob();
      await putAsset(`clip:${id}`, blob);
      scene.type = 'ai_video';
      scene.clip = id;
      scene.prompt = prompt.value;
      await loadClips();
      setBusy('');
      ctx.toast('KI-Video fertig und in die Szene eingesetzt.');
      changed({ structure: true });
      renderBadges();
    } catch (error) {
      setBusy('');
      yes.disabled = false;
      ctx.toast(error.message, 'error');
    }
  });
}

// --- projects drawer -----------------------------------------------------------------------------
async function openProjects() {
  const list = (await listProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
  const box = ui.drawer;
  const head = el('div', 'vs-drawer-head');
  const close = el('button', 'vs-icon', '✕');
  close.type = 'button';
  close.addEventListener('click', () => { box.hidden = true; });
  const fresh = el('button', 'vs-btn primary small', '＋ Neues Video');
  fresh.type = 'button';
  fresh.addEventListener('click', () => { box.hidden = true; loadProject(starterProject()); ui.prompt.querySelector('textarea').focus(); });
  head.append(el('b', '', 'Deine Videos'), fresh, close);
  const items = list.map((p) => {
    const row = el('div', `vs-proj${p.id === project?.id ? ' sel' : ''}`);
    const open = el('button', 'vs-proj-open');
    open.type = 'button';
    open.append(el('b', '', p.title), el('small', '', `${p.format} · ${p.scenes.length} Szenen · ${fmt(timeline(p).total)} · ${new Date(p.updatedAt).toLocaleDateString('de-DE')}`));
    open.addEventListener('click', () => { box.hidden = true; loadProject(p); });
    const del = el('button', 'vs-icon', '🗑');
    del.type = 'button';
    del.setAttribute('aria-label', `${p.title} löschen`);
    del.addEventListener('click', async () => {
      if (!confirm(`„${p.title}“ löschen?`)) return;
      await idb('projects', 'readwrite', (s) => s.delete(p.id));
      row.remove();
      if (p.id === project?.id) loadProject(starterProject());
    });
    row.append(open, del);
    return row;
  });
  box.replaceChildren(head, ...(items.length ? items : [el('p', 'vs-muted', 'Noch keine Videos gespeichert.')]), el('p', 'vs-muted', 'Gespeichert auf diesem Gerät.'));
  box.hidden = false;
}

// --- export ---------------------------------------------------------------------------------------
function pickMime() {
  // Only H.264 counts as a "real" MP4 (iPhone, TikTok, YouTube); everything else is converted on the server.
  const list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return typeof MediaRecorder === 'undefined' ? null : list.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

function openExport() {
  if (!project) return;
  pause();
  const box = el('div', 'vs-dialog');
  const total = timeline(project).total;
  const mime = pickMime();
  const formats = el('div', 'vs-seg');
  for (const f of ['16:9', '9:16', '1:1']) {
    const b = el('button', f === project.format ? 'on' : '', { '16:9': '16:9 YouTube', '9:16': '9:16 TikTok/Reels', '1:1': '1:1 Quadrat' }[f]);
    b.type = 'button';
    b.addEventListener('click', () => { project.format = f; formats.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); ui.overlay.querySelectorAll('.vs-prompt .vs-seg button').forEach((x) => x.classList.toggle('on', x.dataset.format === f)); changed({ images: true }); });
    formats.append(b);
  }
  const quality = selectBox({ 1080: '1080p (Full HD)', 720: '720p (schneller, für ältere Handys)' }, '1080');
  const start = el('button', 'vs-btn primary', '⬇️ Export starten');
  const cancel = el('button', 'vs-btn ghost', 'Abbrechen');
  start.type = cancel.type = 'button';
  const info = mime?.includes('avc1') ? '✅ Dein Browser nimmt direkt als MP4 auf.' : mime ? (status.mp4Server ? 'ℹ️ Dein Browser nimmt als WebM auf, der Server wandelt danach in MP4 um.' : '⚠️ Dein Browser kann nur WebM aufnehmen und auf dem Server ist kein ffmpeg – du bekommst eine WebM-Datei.') : '❌ Dieser Browser kann keine Videos aufnehmen. Bitte Chrome, Edge oder Safari verwenden.';
  box.append(el('h3', '', '⬇️ Video exportieren'), field('Format', formats), field('Auflösung', quality), el('p', 'vs-muted', `Länge ${fmt(total)} · 30 Bilder/s · Das Video wird in Echtzeit aufgenommen – lass die App so lange geöffnet und im Vordergrund.`), el('p', 'vs-muted', info));
  const missing = project.scenes.filter((s) => s.voiceover && voices.get(s.id)?.text !== s.voiceover).length;
  if (missing && status.voice) box.append(el('p', 'vs-warn', `🎙️ ${missing} Sprechtext(e) sind noch nicht vertont – vorher „Stimme erzeugen“ tippen, sonst fehlen sie im Video.`));
  const row = el('div', 'vs-insp-actions');
  row.append(cancel, start);
  box.append(row);
  const close = modal(box);
  cancel.addEventListener('click', close);
  start.disabled = !mime;
  start.addEventListener('click', () => { close(); runExport(Number(quality.value), mime); });
}

async function runExport(quality, mime) {
  const [FW, FH] = FORMAT_SIZE[project.format];
  const scale = quality === 720 ? 2 / 3 : 1;
  const W = Math.round((FW * scale) / 2) * 2;
  const H = Math.round((FH * scale) / 2) * 2;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = canvas.getContext('2d');
  const total = timeline(project).total;
  const ac = ensureAudio();
  if (!soundtrack) { clearTimeout(soundtrackTimer); try { soundtrack = await buildSoundtrack(project, new Map([...voices].filter(([id, b]) => project.scenes.find((s) => s.id === id)?.voiceover === b.text))); } catch { soundtrack = null; } }
  const stream = canvas.captureStream(30);
  let source = null;
  if (soundtrack) {
    const dest = ac.createMediaStreamDestination();
    source = ac.createBufferSource();
    source.buffer = soundtrack;
    source.connect(dest);
    dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }
  const box = el('div', 'vs-dialog vs-export');
  const bar = el('div', 'vs-progress');
  const fill = el('span');
  bar.append(fill);
  const label = el('p', 'vs-muted', 'Aufnahme läuft …');
  canvas.className = 'vs-export-canvas';
  box.append(el('h3', '', '⏺ Video wird aufgenommen'), canvas, bar, label);
  const close = modal(box);
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: quality === 720 ? 6_000_000 : 12_000_000, audioBitsPerSecond: 192_000 });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  let aborted = false;
  const onHide = () => { if (document.hidden) aborted = true; };
  document.addEventListener('visibilitychange', onHide);
  const done = new Promise((resolve) => { recorder.onstop = resolve; });
  // Draw the first frame before recording starts.
  g.setTransform(W / FW, 0, 0, W / FW, 0, 0);
  renderFrame(g, FW, FH, project, 0, { ...assets, preview: false });
  recorder.start(1000);
  const clock = ac.currentTime + 0.15;
  source?.start(clock);
  const wasPlaying = playing;
  playing = { source: null, clock };
  await new Promise((resolve) => {
    const loop = () => {
      const t = ac.currentTime - clock;
      if (aborted || t >= total + 0.15) { resolve(); return; }
      time = Math.max(0, t);
      syncClips();
      g.setTransform(W / FW, 0, 0, W / FW, 0, 0);
      renderFrame(g, FW, FH, project, Math.max(0, t), { ...assets, preview: false });
      fill.style.width = `${Math.min(100, (t / total) * 100)}%`;
      label.textContent = `Aufnahme ${fmt(Math.max(0, t))} / ${fmt(total)} – bitte App geöffnet lassen`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  playing = null;
  void wasPlaying;
  recorder.stop();
  try { source?.stop(); } catch { /* ended */ }
  await done;
  document.removeEventListener('visibilitychange', onHide);
  lock?.release?.().catch?.(() => {});
  stream.getTracks().forEach((t) => t.stop());
  if (aborted) { close(); ctx.toast('Export abgebrochen: Die App war im Hintergrund. Bitte noch einmal und dabei geöffnet lassen.', 'error'); return; }
  let blob = new Blob(chunks, { type: mime.split(';')[0] });
  let how = 'MP4 direkt im Browser aufgenommen';
  if (!mime.includes('avc1')) {
    if (status.mp4Server) {
      label.textContent = 'Server wandelt in MP4 um …';
      try {
        const response = await fetch('/api/video/convert', { method: 'POST', headers: { 'content-type': blob.type || 'video/webm' }, body: blob });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Umwandlung fehlgeschlagen');
        blob = await response.blob();
        how = 'Im Browser aufgenommen, vom Server in MP4 umgewandelt';
      } catch (error) {
        how = `WebM (Umwandlung in MP4 fehlgeschlagen: ${error.message})`;
      }
    } else how = mime.startsWith('video/mp4') ? 'MP4 (Codec deines Browsers, evtl. nicht überall abspielbar)' : 'WebM (dein Browser kann kein MP4 aufnehmen)';
  }
  showResult(blob, how, close, `${W}×${H}`);
}

function showResult(blob, how, close, size) {
  close();
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const name = `${(project.title || 'jarvis-video').toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'jarvis-video'}-${project.format.replace(':', 'x')}.${ext}`;
  const url = URL.createObjectURL(blob);
  const box = el('div', 'vs-dialog');
  const video = Object.assign(el('video', 'vs-result'), { src: url, controls: true, playsInline: true });
  const download = Object.assign(el('a', 'vs-btn primary', `⬇️ ${name} speichern`), { href: url, download: name });
  const row = el('div', 'vs-insp-actions');
  row.append(download);
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    const share = el('button', 'vs-btn', '📤 Teilen / In Fotos sichern');
    share.type = 'button';
    share.addEventListener('click', () => navigator.share({ files: [file], title: project.title }).catch(() => {}));
    row.append(share);
  }
  const done = el('button', 'vs-btn ghost', 'Fertig');
  done.type = 'button';
  row.append(done);
  box.append(el('h3', '', '✅ Video fertig'), video, el('p', 'vs-muted', `${size} · ${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB · ${how}`), row);
  const closeResult = modal(box);
  done.addEventListener('click', () => { closeResult(); URL.revokeObjectURL(url); });
}

// --- voice assistant ---------------------------------------------------------------------------------
export function handleVideoMessage(message) {
  if (message.type === 'video_open') {
    openVideoStudio(message.project).then(() => {
      if (message.voice && status.voice && message.project?.scenes?.some((s) => s.voiceover)) generateVoices({ quiet: true });
    });
  }
}

export function initVideo(options) {
  ctx = { ...ctx, ...options };
  document.getElementById('video-button')?.addEventListener('click', () => openVideoStudio());
}
