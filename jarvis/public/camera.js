// "Jarvis-Augen": the device camera in a full-screen view. Jarvis only looks
// when the user asks (by voice or the button); single frames are sent for
// analysis and never stored.
let ctx = { send: () => false, toast: () => {}, addAnswer: () => {} };
let stream = null;
let facing = 'environment';
let ui = null;
let busy = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function build() {
  if (ui) return ui;
  const overlay = el('div', 'cam-overlay');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Jarvis-Augen');
  const video = el('video', 'cam-video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');
  const hud = el('div', 'cam-hud');
  ['tl', 'tr', 'bl', 'br'].forEach((corner) => hud.append(el('span', `cam-corner ${corner}`)));
  const scan = el('div', 'cam-scan');
  const flash = el('div', 'cam-flash');
  const top = el('div', 'cam-top');
  const title = el('div', 'cam-title');
  title.append(el('span', 'cam-dot'), el('b', '', 'JARVIS-AUGEN'), el('small', '', 'Kamera aktiv'));
  const close = el('button', 'cam-icon', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Kamera schließen');
  top.append(title, close);
  const answer = el('div', 'cam-answer');
  answer.hidden = true;
  const bar = el('form', 'cam-bar');
  const flip = el('button', 'cam-icon', '🔄');
  flip.type = 'button';
  flip.setAttribute('aria-label', 'Kamera wechseln');
  const input = el('input', 'cam-input');
  input.placeholder = 'Frag mich etwas dazu … (oder sag es einfach)';
  input.maxLength = 300;
  const shoot = el('button', 'cam-shoot');
  shoot.type = 'submit';
  shoot.setAttribute('aria-label', 'Was siehst du?');
  shoot.append(el('span'));
  bar.append(flip, input, shoot);
  overlay.append(video, hud, scan, flash, top, answer, bar);
  document.body.append(overlay);
  close.addEventListener('click', closeCamera);
  flip.addEventListener('click', () => switchCamera());
  bar.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    input.value = '';
    lookManually(question);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) closeCamera();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && stream) closeCamera();
  });
  ui = { overlay, video, scan, flash, answer, title };
  return ui;
}

function stopStream() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

export async function openCamera(wanted) {
  const view = build();
  if (wanted) facing = wanted;
  if (stream && (!wanted || stream.facing === facing)) {
    view.overlay.hidden = false;
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieses Gerät oder dieser Browser erlaubt keinen Kamerazugriff.');
  stopStream();
  view.overlay.hidden = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
  } catch (error) {
    view.overlay.hidden = true;
    throw new Error(error.name === 'NotAllowedError' ? 'Kamerazugriff nicht erlaubt. Erlaube die Kamera für Jarvis in den Browser-Einstellungen.' : 'Die Kamera konnte nicht gestartet werden.');
  }
  stream.facing = facing;
  view.video.srcObject = stream;
  view.video.classList.toggle('mirror', facing === 'user');
  await view.video.play().catch(() => {});
  await new Promise((resolve) => {
    if (view.video.readyState >= 2 && view.video.videoWidth) resolve();
    else view.video.addEventListener('loadeddata', resolve, { once: true });
    setTimeout(resolve, 4000);
  });
  // Let the exposure settle for a moment before the first picture.
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export function closeCamera() {
  stopStream();
  if (ui) {
    ui.overlay.hidden = true;
    ui.answer.hidden = true;
    ui.video.srcObject = null;
  }
}

async function switchCamera() {
  try {
    await openCamera(facing === 'user' ? 'environment' : 'user');
  } catch (error) {
    ctx.toast(error.message, 'error');
  }
}

function frame() {
  const { video, flash } = ui;
  if (!video.videoWidth) throw new Error('Die Kamera liefert noch kein Bild.');
  const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const g = canvas.getContext('2d');
  if (facing === 'user') {
    g.translate(canvas.width, 0);
    g.scale(-1, 1);
  }
  g.drawImage(video, 0, 0, canvas.width, canvas.height);
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
  return canvas.toDataURL('image/jpeg', 0.8);
}

function scanning(on, text = 'Jarvis schaut …') {
  ui.scan.classList.toggle('on', on);
  ui.title.querySelector('small').textContent = on ? text : 'Kamera aktiv';
  if (on) showAnswer('');
}

function showAnswer(text) {
  ui.answer.hidden = !text;
  ui.answer.textContent = text;
}

// Voice: the server asks for a picture (see the camera_look tool).
async function captureForServer({ id, facing: wanted }) {
  try {
    await openCamera(wanted);
    scanning(true);
    const image = frame();
    ctx.send({ type: 'camera_frame', id, image });
  } catch (error) {
    scanning(false);
    ctx.send({ type: 'camera_frame', id, error: error.message });
    ctx.toast(error.message, 'error');
  }
}

// Button: analyse here and let Jarvis say it (like a sent photo).
async function lookManually(question) {
  if (busy) return;
  busy = true;
  try {
    scanning(true);
    const image = frame();
    const response = await fetch('/api/vision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, question }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler bei der Bildanalyse');
    scanning(false);
    showAnswer(data.answer);
    if (!ctx.send({ type: 'vision_result', answer: data.answer, question })) ctx.addAnswer(question, data.answer);
  } catch (error) {
    scanning(false);
    showAnswer(`⚠️ ${error.message}`);
  } finally {
    busy = false;
  }
}

export function handleCameraMessage(message) {
  build();
  switch (message.action) {
    case 'capture':
      return captureForServer(message);
    case 'answer':
      scanning(false);
      if (stream) showAnswer(String(message.text || ''));
      return undefined;
    case 'open':
      return openCamera(message.facing).catch((error) => ctx.toast(error.message, 'error'));
    case 'switch':
      return switchCamera();
    case 'close':
      return closeCamera();
    default:
      return undefined;
  }
}

export function initCamera(options) {
  ctx = { ...ctx, ...options };
  document.getElementById('camera-button')?.addEventListener('click', () => openCamera().catch((error) => ctx.toast(error.message, 'error')));
}
