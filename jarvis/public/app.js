// Jarvis interface (desktop and iPhone): captures the microphone, plays Jarvis's
// voice, shows the conversation and asks for confirmation before important actions.
const OUTPUT_SAMPLE_RATE = 24000;

const $ = (id) => document.getElementById(id);
const els = {
  activate: $('activate'),
  statusLine: $('status-line'),
  chip: $('status-chip'),
  chipText: $('status-chip-text'),
  micToggle: $('mic-toggle'),
  micLabel: $('mic-label'),
  reconnect: $('reconnect'),
  transcript: $('transcript'),
  actionLog: $('action-log'),
  composer: $('composer'),
  textInput: $('text-input'),
  send: $('send'),
  halfDuplex: $('half-duplex'),
  confirm: $('confirm'),
  confirmTitle: $('confirm-title'),
  confirmDetail: $('confirm-detail'),
  confirmBar: $('confirm-bar'),
  confirmYes: $('confirm-yes'),
  confirmNo: $('confirm-no'),
  toasts: $('toasts'),
  canvas: $('reactor'),
  clock: $('clock'),
  laptopChip: $('laptop-chip'),
  laptopChipText: $('laptop-chip-text'),
  logout: $('logout'),
  gamesButton: $('games-button'),
  gamesModal: $('games-modal'),
  gamesList: $('games-list'),
  gamesEmpty: $('games-empty'),
  gamesClose: $('games-close'),
  gameOverlay: $('game-overlay'),
  gameFrame: $('game-frame'),
  gameClose: $('game-close'),
  gameShare: $('game-share')
};

const state = {
  ws: null,
  audio: null,
  stream: null,
  micNode: null,
  inputAnalyser: null,
  outputAnalyser: null,
  outputGain: null,
  playHead: 0,
  sources: new Set(),
  leftover: null,
  micMuted: false,
  mode: 'offline',
  connected: false,
  pendingConfirm: null,
  confirmQueue: [],
  actions: new Map()
};

const statusText = {
  offline: 'Bereit zur Aktivierung',
  connecting: 'Verbinde mit Jarvis …',
  listening: 'Ich höre zu',
  thinking: 'Analysiere …',
  speaking: 'Jarvis spricht',
  muted: 'Mikrofon stumm',
  error: 'Störung'
};

// --- Settings --------------------------------------------------------------

function loadSetting(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable; setting just isn't remembered
  }
}

els.halfDuplex.checked = loadSetting('jarvis.halfDuplex', false);
els.halfDuplex.addEventListener('change', () => saveSetting('jarvis.halfDuplex', els.halfDuplex.checked));

// --- Status ----------------------------------------------------------------

function setMode(mode) {
  state.mode = mode;
  const shown = state.micMuted && (mode === 'listening') ? 'muted' : mode;
  els.statusLine.textContent = statusText[shown] || mode;
  const chipState = mode === 'error' ? 'error' : mode === 'offline' ? '' : mode === 'connecting' || mode === 'thinking' ? 'busy' : 'online';
  els.chip.dataset.state = chipState;
  els.chipText.textContent = mode === 'offline' ? 'Offline' : mode === 'error' ? 'Fehler' : mode === 'connecting' ? 'Verbinde' : 'Online';
}

function isSpeaking() {
  return state.audio && state.playHead > state.audio.currentTime + 0.05;
}

function setControlsEnabled(enabled) {
  els.micToggle.disabled = !enabled;
  els.textInput.disabled = !enabled;
  els.send.disabled = !enabled;
}

// --- Transcript & log ------------------------------------------------------

function clearEmpty(container) {
  container.querySelector('.empty')?.remove();
}

function addMessage(role, content) {
  clearEmpty(els.transcript);
  const item = document.createElement('div');
  item.className = `msg ${role}`;
  const label = document.createElement('span');
  label.className = 'msg-role';
  label.textContent = role === 'assistant' ? 'Jarvis' : role === 'user' ? 'Du' : 'System';
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = content;
  item.append(label, body);
  els.transcript.append(item);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function upsertAction({ id, label, state: actionState, detail }) {
  clearEmpty(els.actionLog);
  let item = state.actions.get(id);
  if (!item) {
    item = document.createElement('li');
    item.innerHTML = '<span class="state-dot"></span><span class="action-text"></span><time></time>';
    item.querySelector('time').textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    els.actionLog.prepend(item);
    state.actions.set(id, item);
  }
  item.dataset.state = actionState;
  const text = item.querySelector('.action-text');
  text.textContent = label;
  const suffix = { denied: 'Abgelehnt', cancelled: 'Abgebrochen' }[actionState] || detail;
  if (suffix) {
    const span = document.createElement('span');
    span.className = 'action-detail';
    span.textContent = suffix;
    text.append(span);
  }
}

function addLink(url, title) {
  clearEmpty(els.transcript);
  const item = document.createElement('div');
  item.className = 'msg assistant';
  const label = document.createElement('span');
  label.className = 'msg-role';
  label.textContent = 'Link';
  const link = document.createElement('a');
  link.className = 'msg-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = title || url;
  item.append(label, link);
  els.transcript.append(item);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

// --- Games ---------------------------------------------------------------

const GAMES_KEY = 'jarvis.games';
const gameTypeNames = { fangen: 'Fangen', ausweichen: 'Ausweichen', springen: 'Springen', reaktion: 'Reaktion', memory: 'Memory', quiz: 'Quiz', website: 'Website' };
let micMutedBeforeGame = false;

function loadGames() {
  try {
    const games = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]');
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

function saveGame({ title, type, emoji, url }) {
  const games = [{ title, type, emoji, url, created: Date.now() }, ...loadGames().filter((game) => game.url !== url)].slice(0, 30);
  try {
    localStorage.setItem(GAMES_KEY, JSON.stringify(games));
  } catch {
    // storage unavailable; the card in the conversation still works
  }
}

// Only links to this server's game and website pages are opened in the app.
function projectPath(url) {
  try {
    const parsed = new URL(url, location.href);
    return parsed.origin === location.origin ? parsed.pathname : '';
  } catch {
    return '';
  }
}

function isGameUrl(url) {
  return projectPath(url) === '/play.html';
}

function isSiteUrl(url) {
  return projectPath(url) === '/site.html';
}

function gameCard({ title, type, emoji, url }) {
  const card = document.createElement('div');
  card.className = 'game-card';
  const icon = document.createElement('span');
  icon.className = 'game-card-emoji';
  icon.textContent = emoji || '🎮';
  const text = document.createElement('span');
  text.className = 'game-card-text';
  const name = document.createElement('span');
  name.className = 'game-card-title';
  name.textContent = title;
  const kind = document.createElement('span');
  kind.className = 'game-card-type';
  kind.textContent = gameTypeNames[type] || 'Spiel';
  text.append(name, kind);
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'btn btn-primary';
  play.textContent = isSiteUrl(url) ? '↗ Öffnen' : '▶ Spielen';
  play.addEventListener('click', () => openGame(url, title));
  card.append(icon, text, play);
  return card;
}

function addGameCard(game) {
  clearEmpty(els.transcript);
  const item = document.createElement('div');
  item.className = 'msg assistant';
  const label = document.createElement('span');
  label.className = 'msg-role';
  label.textContent = isSiteUrl(game.url) ? 'Neue Website' : 'Neues Spiel';
  item.append(label, gameCard(game));
  els.transcript.append(item);
  els.transcript.scrollTop = els.transcript.scrollHeight;
  chime([660, 880, 1320]);
}

function openGame(url, title) {
  if (!isGameUrl(url) && !isSiteUrl(url)) return;
  els.gamesModal.hidden = true;
  if (els.gameOverlay.hidden) {
    micMutedBeforeGame = state.micMuted;
    // Mute Jarvis while playing so game sounds don't reach the microphone.
    // Websites keep listening, so changes can be requested while looking at them.
    if (isGameUrl(url)) {
      state.micMuted = true;
      stopPlayback();
    }
  }
  els.gameFrame.src = url;
  els.gameOverlay.dataset.url = url;
  els.gameOverlay.dataset.title = title || 'Jarvis-Spiel';
  els.gameOverlay.hidden = false;
  setMode(state.mode);
}

function closeGame() {
  els.gameOverlay.hidden = true;
  els.gameFrame.src = 'about:blank';
  state.micMuted = micMutedBeforeGame;
  setMode(state.mode);
}

function showGames() {
  const games = loadGames();
  els.gamesList.replaceChildren(...games.map((game) => {
    const item = document.createElement('li');
    item.append(gameCard(game));
    return item;
  }));
  els.gamesEmpty.hidden = games.length > 0;
  els.gamesModal.hidden = false;
  els.gamesClose.focus();
}

els.gamesButton.addEventListener('click', showGames);
els.gamesClose.addEventListener('click', () => {
  els.gamesModal.hidden = true;
});
els.gamesModal.addEventListener('click', (event) => {
  if (event.target === els.gamesModal) els.gamesModal.hidden = true;
});
els.gameClose.addEventListener('click', closeGame);
els.gameShare.addEventListener('click', async () => {
  const url = els.gameOverlay.dataset.url;
  try {
    if (navigator.share) await navigator.share({ title: els.gameOverlay.dataset.title, text: isSiteUrl(url) ? 'Eine Website, gebaut von Jarvis' : 'Ein Spiel, gebaut von Jarvis', url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Link kopiert – schick ihn deinen Freunden!');
    }
  } catch {
    // share sheet closed
  }
});

function setLaptop(connected) {
  els.laptopChip.dataset.state = connected ? 'online' : '';
  els.laptopChipText.textContent = connected ? 'Laptop an' : 'Laptop aus';
}

// Returns false (and goes to the login page) when the session has expired.
async function checkSession() {
  try {
    const response = await fetch('/api/session', { cache: 'no-store' });
    if (response.status === 401) {
      location.replace('/login.html');
      return false;
    }
    if (response.ok) setLaptop((await response.json()).laptop);
  } catch {
    // offline: keep going, the connection error is shown elsewhere
  }
  return true;
}

function toast(message, kind = '') {
  const item = document.createElement('div');
  item.className = `toast ${kind}`;
  item.textContent = message;
  els.toasts.append(item);
  setTimeout(() => item.remove(), kind === 'error' ? 9000 : 6000);
}

function chime(frequencies = [880, 1320]) {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  frequencies.forEach((frequency, index) => {
    const osc = state.audio.createOscillator();
    const gain = state.audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + index * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.14 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.14 + 0.25);
    osc.connect(gain).connect(state.audio.destination);
    osc.start(now + index * 0.14);
    osc.stop(now + index * 0.14 + 0.3);
  });
}

// --- Audio -----------------------------------------------------------------

// Must be called directly from a tap: iOS only allows audio that starts inside the gesture.
async function setupAudio() {
  if (state.audio) return;
  try {
    // Safari 17+: play through the speaker while recording, even with the mute switch on.
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
  } catch {
    // older Safari or other browsers
  }
  const audio = new AudioContext({ latencyHint: 'interactive' });
  audio.resume();
  state.stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  await audio.audioWorklet.addModule('/mic-worklet.js');
  const source = audio.createMediaStreamSource(state.stream);
  state.inputAnalyser = audio.createAnalyser();
  state.inputAnalyser.fftSize = 512;
  state.micNode = new AudioWorkletNode(audio, 'mic-capture');
  const sink = audio.createGain();
  sink.gain.value = 0;
  source.connect(state.inputAnalyser);
  source.connect(state.micNode).connect(sink).connect(audio.destination);

  state.outputGain = audio.createGain();
  state.outputAnalyser = audio.createAnalyser();
  state.outputAnalyser.fftSize = 512;
  state.outputGain.connect(state.outputAnalyser).connect(audio.destination);

  state.micNode.port.onmessage = ({ data }) => {
    const ws = state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !state.connected) return;
    // Silence keeps the stream steady while muted or while Jarvis talks in half-duplex mode.
    const silent = state.micMuted || (els.halfDuplex.checked && isSpeaking());
    ws.send(silent ? new ArrayBuffer(data.byteLength) : data);
  };
  state.audio = audio;
}

function playChunk(arrayBuffer) {
  const audio = state.audio;
  if (!audio) return;
  let bytes = new Uint8Array(arrayBuffer);
  if (state.leftover) {
    const merged = new Uint8Array(state.leftover.length + bytes.length);
    merged.set(state.leftover);
    merged.set(bytes, state.leftover.length);
    bytes = merged;
    state.leftover = null;
  }
  if (bytes.length % 2) {
    state.leftover = bytes.slice(-1);
    bytes = bytes.slice(0, -1);
  }
  if (!bytes.length) return;
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
  const buffer = audio.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(state.outputGain);
  const startAt = Math.max(audio.currentTime + 0.03, state.playHead);
  source.start(startAt);
  state.playHead = startAt + buffer.duration;
  state.sources.add(source);
  source.onended = () => state.sources.delete(source);
}

// Barge-in: stop Jarvis immediately when the user starts talking.
function stopPlayback() {
  for (const source of state.sources) {
    try {
      source.stop();
    } catch {
      // already stopped
    }
  }
  state.sources.clear();
  state.leftover = null;
  if (state.audio) state.playHead = state.audio.currentTime;
}

// --- Connection ------------------------------------------------------------

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  state.ws = ws;
  setMode('connecting');
  els.reconnect.hidden = true;

  ws.onopen = () => ws.send(JSON.stringify({ type: 'start', sampleRate: state.audio.sampleRate }));
  ws.onmessage = ({ data }) => {
    if (typeof data !== 'string') {
      playChunk(data);
      return;
    }
    handleMessage(JSON.parse(data));
  };
  ws.onclose = async () => {
    if (state.ws !== ws) return;
    if (!(await checkSession())) return;
    disconnected('Verbindung zu Jarvis getrennt.');
  };
}

function disconnected(reason) {
  state.connected = false;
  setControlsEnabled(false);
  stopPlayback();
  hideConfirm();
  if (state.mode !== 'error') setMode('offline');
  els.statusLine.textContent = reason ? 'Verbindung getrennt' : statusText.offline;
  els.reconnect.hidden = false;
}

function handleMessage(message) {
  switch (message.type) {
    case 'status':
      if (message.state === 'listening' && !state.connected) {
        state.connected = true;
        setControlsEnabled(true);
      }
      setMode(message.state);
      break;
    case 'transcript':
      addMessage(message.role === 'user' ? 'user' : 'assistant', message.content);
      break;
    case 'user_speaking':
      stopPlayback();
      setMode('listening');
      break;
    case 'agent_audio_done': {
      // Return to listening once the queued audio has finished playing.
      const wait = state.audio ? Math.max(0, (state.playHead - state.audio.currentTime) * 1000) : 0;
      setTimeout(() => {
        if (state.mode === 'speaking' && !isSpeaking()) setMode('listening');
      }, wait + 80);
      break;
    }
    case 'action':
      upsertAction(message);
      break;
    case 'link':
      addLink(message.url, message.title);
      break;
    case 'game': {
      const created = { title: message.title, type: message.gameType, emoji: message.emoji, url: message.url };
      saveGame(created);
      addGameCard(created);
      break;
    }
    case 'site': {
      const created = { title: message.title, type: 'website', emoji: message.emoji, url: message.url };
      saveGame(created);
      addGameCard(created);
      // A website that is open right now shows the new version immediately.
      if (!els.gameOverlay.hidden && isSiteUrl(els.gameOverlay.dataset.url)) openGame(created.url, created.title);
      break;
    }
    case 'laptop':
      setLaptop(message.connected);
      break;
    case 'confirm':
      queueConfirm(message);
      break;
    case 'confirm_close':
      closeConfirm(message.id);
      break;
    case 'timer':
      chime([660, 990, 1320]);
      toast(`⏰ ${message.message}`, 'timer');
      addMessage('system', `Erinnerung: ${message.message}`);
      break;
    case 'error':
      setMode('error');
      toast(message.message, 'error');
      addMessage('system', message.message);
      // Failed before a session started (e.g. missing keys): allow a retry.
      if (!state.connected && state.ws) {
        const ws = state.ws;
        state.ws = null;
        ws.close();
        els.reconnect.hidden = false;
      }
      break;
    case 'closed':
      if (state.ws) {
        const ws = state.ws;
        state.ws = null;
        ws.close();
      }
      disconnected(message.reason || 'Sitzung beendet');
      break;
    default:
      break;
  }
}

async function activate() {
  els.activate.disabled = true;
  try {
    await setupAudio();
    await state.audio.resume();
    if (!(await checkSession())) return;
    els.activate.hidden = true;
    connect();
  } catch (error) {
    els.activate.disabled = false;
    setMode('error');
    const denied = error.name === 'NotAllowedError' || error.name === 'SecurityError';
    toast(denied ? 'Mikrofonzugriff wurde verweigert. Erlaube ihn über das Schloss-Symbol in der Adressleiste.' : `Audio konnte nicht gestartet werden: ${error.message}`, 'error');
  }
}

// --- Confirmation ----------------------------------------------------------

// Several confirmations can arrive at once; they are shown one after another.
function queueConfirm(request) {
  state.confirmQueue.push({ ...request, deadline: Date.now() + request.timeoutMs });
  if (!state.pendingConfirm) showNextConfirm();
}

function showNextConfirm() {
  const next = state.confirmQueue.shift();
  state.pendingConfirm = next || null;
  els.confirm.hidden = !next;
  if (!next) return;
  els.confirmTitle.textContent = next.title;
  els.confirmDetail.textContent = next.detail || '';
  els.confirmDetail.classList.toggle('code', Boolean(next.code));
  const remaining = Math.max(0, next.deadline - Date.now());
  els.confirmBar.style.transition = 'none';
  els.confirmBar.style.transform = `scaleX(${remaining / next.timeoutMs})`;
  requestAnimationFrame(() => {
    els.confirmBar.style.transition = `transform ${remaining}ms linear`;
    els.confirmBar.style.transform = 'scaleX(0)';
  });
  chime([740, 554]);
  els.confirmNo.focus();
}

function closeConfirm(id) {
  state.confirmQueue = state.confirmQueue.filter((request) => request.id !== id);
  if (state.pendingConfirm?.id === id) showNextConfirm();
}

function hideConfirm() {
  state.confirmQueue = [];
  state.pendingConfirm = null;
  els.confirm.hidden = true;
}

function answerConfirm(approved) {
  const pending = state.pendingConfirm;
  if (!pending) return;
  state.ws?.send(JSON.stringify({ type: 'confirm_response', id: pending.id, approved }));
  closeConfirm(pending.id);
}

els.confirmYes.addEventListener('click', () => answerConfirm(true));
els.confirmNo.addEventListener('click', () => answerConfirm(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.pendingConfirm) answerConfirm(false);
});

// --- Controls --------------------------------------------------------------

els.activate.addEventListener('click', activate);

els.logout.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  location.replace('/login.html');
});

els.reconnect.addEventListener('click', () => {
  els.reconnect.hidden = true;
  addMessage('system', 'Neue Sitzung gestartet.');
  connect();
});

els.micToggle.addEventListener('click', () => {
  state.micMuted = !state.micMuted;
  els.micToggle.setAttribute('aria-pressed', String(state.micMuted));
  els.micLabel.textContent = state.micMuted ? 'Mikro aus' : 'Mikro an';
  setMode(state.mode);
});

els.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = els.textInput.value.trim();
  if (!text || !state.connected) return;
  stopPlayback();
  state.ws.send(JSON.stringify({ type: 'text', text }));
  els.textInput.value = '';
});

// --- Clock -----------------------------------------------------------------

function tickClock() {
  els.clock.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
tickClock();
setInterval(tickClock, 10_000);

// --- Reactor visual --------------------------------------------------------

const ctx = els.canvas.getContext('2d');
const levelData = new Uint8Array(512);
let smoothLevel = 0;
let angle = 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readLevel(analyser) {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(levelData);
  let sum = 0;
  for (let i = 0; i < analyser.fftSize; i += 1) {
    const value = (levelData[i] - 128) / 128;
    sum += value * value;
  }
  return Math.min(1, Math.sqrt(sum / analyser.fftSize) * 4);
}

function palette() {
  if (state.mode === 'error') return [255, 77, 106];
  if (state.mode === 'thinking' || state.mode === 'connecting') return [255, 181, 71];
  if (state.mode === 'offline' || state.micMuted) return [90, 140, 160];
  return [56, 225, 255];
}

function draw() {
  const { width, height } = els.canvas;
  const cx = width / 2;
  const cy = height / 2;
  const speaking = isSpeaking();
  const raw = speaking ? readLevel(state.outputAnalyser) : state.micMuted ? 0 : readLevel(state.inputAnalyser);
  smoothLevel += (raw - smoothLevel) * 0.2;
  const speed = state.mode === 'thinking' ? 0.04 : state.mode === 'offline' ? 0.004 : 0.012;
  if (!reduceMotion) angle += speed;
  const [r, g, b] = palette();
  const color = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';

  // Outer tick ring
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-angle * 0.5);
  for (let i = 0; i < 90; i += 1) {
    const a = (i / 90) * Math.PI * 2;
    const long = i % 5 === 0;
    ctx.strokeStyle = color(long ? 0.6 : 0.22);
    ctx.lineWidth = long ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 250, Math.sin(a) * 250);
    ctx.lineTo(Math.cos(a) * (long ? 236 : 242), Math.sin(a) * (long ? 236 : 242));
    ctx.stroke();
  }
  ctx.restore();

  // Rotating segmented arcs
  const rings = [
    { radius: 215, width: 3, segments: 3, gap: 0.5, dir: 1, alpha: 0.75 },
    { radius: 190, width: 8, segments: 6, gap: 0.35, dir: -1.6, alpha: 0.35 },
    { radius: 165, width: 2, segments: 12, gap: 0.2, dir: 2.2, alpha: 0.6 }
  ];
  for (const ring of rings) {
    const seg = (Math.PI * 2) / ring.segments;
    ctx.strokeStyle = color(ring.alpha);
    ctx.lineWidth = ring.width;
    for (let i = 0; i < ring.segments; i += 1) {
      const start = angle * ring.dir + i * seg;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.radius, start, start + seg * (1 - ring.gap));
      ctx.stroke();
    }
  }

  // Voice-reactive waveform ring
  ctx.beginPath();
  for (let i = 0; i <= 128; i += 1) {
    const a = (i / 128) * Math.PI * 2;
    const wobble = Math.sin(a * 6 + angle * 8) * Math.sin(a * 3 - angle * 5);
    const radius = 128 + smoothLevel * 26 * wobble + smoothLevel * 10;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color(0.9);
  ctx.lineWidth = 2;
  ctx.shadowColor = color(0.9);
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Core glow
  const coreRadius = 70 + smoothLevel * 22;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 1.6);
  glow.addColorStop(0, 'rgba(235, 255, 255, 0.95)');
  glow.addColorStop(0.25, color(0.85));
  glow.addColorStop(0.6, color(0.25));
  glow.addColorStop(1, color(0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, coreRadius * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Inner triangle, a nod to the reactor look
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle * 0.8);
  ctx.strokeStyle = color(0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * 48;
    const y = Math.sin(a) * 48;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  if (speaking && state.mode !== 'speaking' && state.mode !== 'error') setMode('speaking');
  requestAnimationFrame(draw);
}

setMode('offline');
checkSession();
requestAnimationFrame(draw);
