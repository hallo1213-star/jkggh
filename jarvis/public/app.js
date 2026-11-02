// Jarvis interface (desktop and iPhone): captures the microphone, plays Jarvis's
// voice, shows the conversation and asks for confirmation before important actions.
import { initMoney, showMoney } from './money.js';
import { handleGlobeMessage, initGlobe } from './globe.js';
import { addOrderCard, handleCallEvent, initCall } from './call.js';
import { initModels, modelLoading, showModel } from './model3d.js';
import { initProjects, projectLoading, showProject } from './projects.js';
import { handleTaskEvent, initTasks } from './tasks.js';
import { followJob, initStudio } from './studio.js';
import { initPalace, openPalace } from './palace.js';
import { chartCard, initVisuals, showWeather as showWeatherShow, startFocus } from './visuals.js';
import { initCards, isEverydayCard, showEverydayCard } from './cards.js';
import { handleCameraMessage, initCamera } from './camera.js';
import { handleVideoMessage, initVideo } from './video.js';
import { handleDesignMessage, initDesign } from './design.js';
import { handleBusinessMessage, initBusiness, openBusiness } from './business.js';
import { filmTab, initFilm } from './film.js';
import { handleFaceMessage, initFace } from './face.js';
import { handleExtrasMessage, initExtras } from './extras.js';
import { handleEffectMessage, initCamFx } from './camfx.js';
import { openPoster } from './poster.js';
import { handleFunMessage, initFun, levelState, personaColor } from './fun.js';
import { handleMirrorMessage, initMirror } from './mirror.js';
import { handlePrankMessage, initPrank } from './prank.js';
import { handleFactoryMessage, initFactory, openFactory } from './factory.js';
import { handleSuitMessage, initSuit, openSuitLab, ownedSuit, suitState } from './suit.js';
import { hudAction, hudBoot, hudResult, hudConnected, hudPong, hudToday, hudUser, initHud, reactorFx, refreshSystem } from './hud.js';

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
  gameShare: $('game-share'),
  shoppingButton: $('shopping-button'),
  shoppingModal: $('shopping-modal'),
  shoppingList: $('shopping-list'),
  shoppingEmpty: $('shopping-empty'),
  shoppingClose: $('shopping-close'),
  shoppingForm: $('shopping-form'),
  shoppingInput: $('shopping-input'),
  shoppingClearDone: $('shopping-clear-done'),
  customersButton: $('customers-button'),
  customersModal: $('customers-modal'),
  customersClose: $('customers-close'),
  customersSummary: $('customers-summary'),
  customerList: $('customer-list'),
  customersEmpty: $('customers-empty'),
  memoryButton: $('memory-button'),
  memoryModal: $('memory-modal'),
  memoryList: $('memory-list'),
  memoryEmpty: $('memory-empty'),
  memoryClose: $('memory-close'),
  historyClear: $('history-clear'),
  chips: $('chips'),
  plannerButton: $('planner-button'),
  plannerModal: $('planner-modal'),
  plannerClose: $('planner-close'),
  plannerBody: $('planner-body'),
  plannerHint: $('planner-hint')
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
  document.body.dataset.mode = mode;
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
  for (const chip of els.chips.children) chip.disabled = !enabled;
}

// Sends typed (or suggested) text to Jarvis as if it was spoken.
function sendText(text) {
  if (!text || !state.connected) return;
  stopPlayback();
  hudUser(text);
  state.ws.send(JSON.stringify({ type: 'text', text }));
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
  hudAction({ id, label, state: actionState, detail });
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
const gameTypeNames = { fangen: 'Fangen', ausweichen: 'Ausweichen', springen: 'Springen', reaktion: 'Reaktion', memory: 'Memory', quiz: 'Quiz', website: 'Website', anzeige: 'Kleinanzeige' };
let micMutedBeforeGame = false;

function loadGames() {
  try {
    const games = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]');
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

function saveGame({ title, type, emoji, url, listing }) {
  const id = url || `anzeige:${title}`;
  const games = [{ title, type, emoji, url, listing, created: Date.now() }, ...loadGames().filter((game) => (game.url || `anzeige:${game.title}`) !== id)].slice(0, 30);
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

function gameCard({ title, type, emoji, url, listing }) {
  if (type === 'anzeige' && listing) return listingCard({ title, ...listing });
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

// --- Lists synced with your other devices ---------------------------------

// A list saved on this device and shared through Jarvis with your other
// devices. `updatedAt` is the server's version stamp; the newest copy wins.
function syncedList({ key, timeKey, updateType, clean, onChange }) {
  return {
    load() {
      try {
        return clean(JSON.parse(localStorage.getItem(key) || 'null'));
      } catch {
        return clean(null);
      }
    },
    loadTime() {
      try {
        return Number(localStorage.getItem(timeKey)) || 0;
      } catch {
        return 0;
      }
    },
    store(items, { sync = true, updatedAt } = {}) {
      const list = clean(items);
      const online = state.ws?.readyState === WebSocket.OPEN;
      try {
        localStorage.setItem(key, JSON.stringify(list));
        if (updatedAt) localStorage.setItem(timeKey, String(updatedAt));
        // Edited while offline: this copy should win the next time we connect.
        else if (sync && !online) localStorage.setItem(timeKey, String(Date.now()));
      } catch {
        // storage unavailable; the list still works for this session
      }
      if (sync && online) state.ws.send(JSON.stringify({ type: updateType, items: list }));
      onChange();
    }
  };
}

// --- Memory & conversation history ---------------------------------------

const memories = syncedList({
  key: 'jarvis.memories',
  timeKey: 'jarvis.memoriesUpdatedAt',
  updateType: 'memories_update',
  clean: (list) => (Array.isArray(list) ? list : []).filter((item) => typeof item?.text === 'string').slice(0, 150).map((item) => ({ id: item.id, text: item.text.slice(0, 200), category: item.category, links: Array.isArray(item.links) ? item.links.slice(0, 6) : [], updatedAt: item.updatedAt })),
  onChange: () => {
    if (!els.memoryModal.hidden) renderMemories();
  }
});

function renderMemories() {
  const list = memories.load();
  els.memoryList.replaceChildren(...list.map((item, index) => {
    const row = document.createElement('li');
    const text = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = `🧠 ${item.text}`;
    text.append(span);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `„${item.text}“ vergessen`);
    remove.addEventListener('click', () => memories.store(list.filter((_, i) => i !== index)));
    row.append(text, remove);
    return row;
  }));
  els.memoryEmpty.hidden = list.length > 0;
}

function showMemories() {
  renderMemories();
  els.memoryModal.hidden = false;
}

els.memoryButton.addEventListener('click', () => openPalace());
els.memoryClose.addEventListener('click', () => {
  els.memoryModal.hidden = true;
});
els.memoryModal.addEventListener('click', (event) => {
  if (event.target === els.memoryModal) els.memoryModal.hidden = true;
});

// The last turns stay on this device so Jarvis can pick up the previous conversation.
const HISTORY_KEY = 'jarvis.history';

function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => (item?.role === 'user' || item?.role === 'assistant') && typeof item.content === 'string') : [];
  } catch {
    return [];
  }
}

function rememberTurn(role, content) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...loadHistory(), { role, content: String(content).slice(0, 400), at: Date.now() }].slice(-40)));
  } catch {
    // storage unavailable; Jarvis just starts fresh next time
  }
}

function restoreHistory() {
  if (document.body.classList.contains('theme-film')) return; // the video look starts clean
  const recent = loadHistory().slice(-10);
  if (!recent.length) return;
  clearEmpty(els.transcript);
  const divider = document.createElement('div');
  divider.className = 'history-divider';
  divider.textContent = 'Letztes Gespräch';
  els.transcript.append(divider);
  for (const turn of recent) {
    addMessage(turn.role, turn.content);
    els.transcript.lastElementChild.classList.add('past');
  }
}

els.historyClear.addEventListener('click', () => {
  if (!confirm('Gesprächsverlauf auf diesem Gerät löschen? Jarvis knüpft dann nicht mehr an das letzte Gespräch an.')) return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // nothing to remove
  }
  for (const node of els.transcript.querySelectorAll('.past, .history-divider')) node.remove();
  els.historyClear.textContent = 'Verlauf gelöscht ✓';
});

// --- Planner: appointments, reminders, notes, expenses, vocabulary ----------------

const asArray = (value) => (Array.isArray(value) ? value : []);
const personalStores = {
  planner: syncedList({
    key: 'jarvis.planner', timeKey: 'jarvis.plannerUpdatedAt', updateType: 'planner_update',
    clean: (value) => ({
      briefing: { time: value?.briefing?.time || null, place: String(value?.briefing?.place || '') },
      reminders: asArray(value?.reminders).filter((item) => typeof item?.text === 'string'),
      appointments: asArray(value?.appointments).filter((item) => typeof item?.title === 'string')
    }),
    onChange: () => renderPlannerIfOpen()
  }),
  notes: syncedList({ key: 'jarvis.notes', timeKey: 'jarvis.notesUpdatedAt', updateType: 'notes_update', clean: (value) => asArray(value).filter((item) => typeof item?.text === 'string'), onChange: () => renderPlannerIfOpen() }),
  expenses: syncedList({ key: 'jarvis.expenses', timeKey: 'jarvis.expensesUpdatedAt', updateType: 'expenses_update', clean: (value) => asArray(value).filter((item) => Number(item?.amount) > 0), onChange: () => renderPlannerIfOpen() }),
  vocab: syncedList({ key: 'jarvis.vocab', timeKey: 'jarvis.vocabUpdatedAt', updateType: 'vocab_update', clean: (value) => asArray(value).filter((item) => typeof item?.name === 'string'), onChange: () => renderPlannerIfOpen() })
};
let plannerTab = 'termine';
const WEEKDAY_NAMES = { montag: 'Montag', dienstag: 'Dienstag', mittwoch: 'Mittwoch', donnerstag: 'Donnerstag', freitag: 'Freitag', samstag: 'Samstag', sonntag: 'Sonntag' };
const euro = (value) => `${Number(value).toFixed(2).replace('.', ',')} €`;
const germanDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }) : iso);

function plannerRow(title, detail, onDelete) {
  const row = document.createElement('div');
  row.className = 'planner-row';
  const info = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = title;
  info.append(b);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    info.append(small);
  }
  row.append(info);
  if (onDelete) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `${title} löschen`);
    remove.addEventListener('click', onDelete);
    row.append(remove);
  }
  return row;
}

function plannerSection(label) {
  const heading = document.createElement('div');
  heading.className = 'planner-section';
  heading.textContent = label;
  return heading;
}

function renderPlanner() {
  for (const tab of document.querySelectorAll('#planner-modal .tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === plannerTab));
  const body = [];
  let hint = '';
  if (plannerTab === 'termine') {
    const planner = personalStores.planner.load();
    const save = (next) => personalStores.planner.store(next);
    body.push(plannerSection('Morgen-Briefing'));
    body.push(plannerRow(planner.briefing.time ? `Jeden Morgen um ${planner.briefing.time} Uhr` : 'Aus', planner.briefing.time ? `Wetter${planner.briefing.place ? ` für ${planner.briefing.place}` : ''}, Termine, Mails, Einkaufsliste und Nachrichten per Telegram` : 'Sag z. B. „Schick mir jeden Morgen um 7 ein Briefing“.',
      planner.briefing.time ? () => save({ ...planner, briefing: { ...planner.briefing, time: null } }) : null));
    body.push(plannerSection('Termine'));
    if (!planner.appointments.length) body.push(plannerRow('Keine Termine', 'Sag z. B. „Ich hab Freitag um 15 Uhr Zahnarzt“.'));
    for (const item of planner.appointments) {
      body.push(plannerRow(item.title, `${germanDate(item.date)}${item.time ? `, ${item.time} Uhr` : ''} · Erinnerung ${item.remindMinutes >= 60 ? `${Math.round(item.remindMinutes / 60)} Std.` : `${item.remindMinutes} Min.`} vorher`,
        () => save({ ...planner, appointments: planner.appointments.filter((entry) => entry.id !== item.id) })));
    }
    body.push(plannerSection('Erinnerungen'));
    if (!planner.reminders.length) body.push(plannerRow('Keine Erinnerungen', 'Sag z. B. „Erinner mich jeden Montag um 19 Uhr an den Müll“.'));
    for (const item of planner.reminders) {
      const when = item.repeat === 'taeglich' ? 'täglich' : item.repeat === 'werktags' ? 'werktags' : item.repeat === 'woechentlich' ? `jeden ${WEEKDAY_NAMES[item.weekday] || item.weekday}` : germanDate(item.date);
      body.push(plannerRow(item.text, `${when} um ${item.time} Uhr`, () => save({ ...planner, reminders: planner.reminders.filter((entry) => entry.id !== item.id) })));
    }
    hint = 'Erinnerungen und das Briefing kommen per Telegram – auch wenn die App zu ist.';
  } else if (plannerTab === 'notizen') {
    const notes = personalStores.notes.load();
    if (!notes.length) body.push(plannerRow('Noch keine Notizen', 'Sag z. B. „Notier dir, dass ich Lisa ein Buch leihen wollte“.'));
    for (const note of [...notes].reverse()) body.push(plannerRow(note.text, germanDate(note.date), () => personalStores.notes.store(notes.filter((entry) => entry.id !== note.id))));
  } else if (plannerTab === 'ausgaben') {
    const expenses = personalStores.expenses.load();
    const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
    const thisMonth = expenses.filter((item) => String(item.date).startsWith(month));
    const total = document.createElement('div');
    total.className = 'planner-total';
    total.textContent = 'Diesen Monat: ';
    const sum = document.createElement('b');
    sum.textContent = euro(thisMonth.reduce((acc, item) => acc + Number(item.amount), 0));
    total.append(sum);
    body.push(total);
    if (!expenses.length) body.push(plannerRow('Noch keine Ausgaben', 'Sag z. B. „Ich hab 12 Euro für Essen ausgegeben“.'));
    for (const item of [...expenses].reverse().slice(0, 60)) {
      body.push(plannerRow(`${euro(item.amount)} · ${item.category}`, `${germanDate(item.date)}${item.note ? ` · ${item.note}` : ''}`, () => personalStores.expenses.store(expenses.filter((entry) => entry.id !== item.id))));
    }
  } else {
    const lists = personalStores.vocab.load();
    if (!lists.length) body.push(plannerRow('Noch keine Vokabeln', 'Sag z. B. „Speicher Englisch-Vokabeln: Hund – dog, Katze – cat“ und dann „Frag mich ab“.'));
    for (const list of lists) {
      const preview = list.pairs.slice(0, 4).map((pair) => `${pair.a} – ${pair.b}`).join(', ');
      body.push(plannerRow(`${list.name} (${list.pairs.length})`, preview, () => {
        if (confirm(`Vokabelliste „${list.name}“ löschen?`)) personalStores.vocab.store(lists.filter((entry) => entry.id !== list.id));
      }));
    }
    hint = 'Abfragen: „Frag mich die Vokabeln ab“.';
  }
  els.plannerBody.replaceChildren(...body);
  els.plannerHint.textContent = hint;
}

function renderPlannerIfOpen() {
  if (!els.plannerModal.hidden) renderPlanner();
}

function showPlanner(tab) {
  if (tab) plannerTab = tab;
  renderPlanner();
  els.plannerModal.hidden = false;
}

els.plannerButton.addEventListener('click', () => showPlanner());
els.plannerClose.addEventListener('click', () => {
  els.plannerModal.hidden = true;
});
els.plannerModal.addEventListener('click', (event) => {
  if (event.target === els.plannerModal) els.plannerModal.hidden = true;
});
for (const tab of document.querySelectorAll('#planner-modal .tab')) {
  tab.addEventListener('click', () => {
    plannerTab = tab.dataset.tab;
    renderPlanner();
  });
}

// --- Weather & news cards ------------------------------------------------------

function cardMessage(label, card) {
  clearEmpty(els.transcript);
  const item = document.createElement('div');
  item.className = 'msg assistant';
  const role = document.createElement('span');
  role.className = 'msg-role';
  role.textContent = label;
  item.append(role, card);
  els.transcript.append(item);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

// --- Markets & weekly numbers (film-style status reports) ---------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function addMarketsCard(markets) {
  if (!Array.isArray(markets?.werte)) return;
  const card = el('div', 'info-card markets-card');
  card.append(el('span', 'shop-card-title', '📈 Märkte'));
  const grid = el('div', 'stat-grid');
  for (const w of markets.werte) {
    const tile = el('div', 'stat-tile');
    const change = typeof w.heuteProzent === 'number' ? w.heuteProzent : null;
    const value = w.unit === 'Punkte' ? Math.round(w.kurs).toLocaleString('de-DE') : w.kurs.toLocaleString('de-DE', { maximumFractionDigits: w.kurs < 10 ? 4 : 2 });
    tile.append(el('small', '', w.name), el('b', '', `${value}${w.unit === '$' ? ' $' : ''}`), el('em', change === null ? '' : change >= 0 ? 'up' : 'down', change === null ? '–' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toLocaleString('de-DE')} % heute${typeof w.wocheProzent === 'number' ? ` · Woche ${w.wocheProzent >= 0 ? '+' : ''}${w.wocheProzent.toLocaleString('de-DE')} %` : ''}`));
    grid.append(tile);
  }
  card.append(grid);
  if (markets.schlagzeilen?.length) {
    const list = el('ul', 'news-list');
    for (const item of markets.schlagzeilen.slice(0, 4)) {
      const row = el('li');
      const entry = /^https:\/\//.test(item.link || '') ? Object.assign(el('a', '', item.titel), { href: item.link, target: '_blank', rel: 'noopener noreferrer' }) : el('span', '', item.titel);
      row.append(entry);
      list.append(row);
    }
    card.append(list);
  }
  card.append(el('p', 'card-source', markets.quelle || ''));
  cardMessage('Börse', card);
}

function addWeeklyCard(numbers) {
  if (!Array.isArray(numbers)) return;
  const card = el('div', 'info-card markets-card');
  card.append(el('span', 'shop-card-title', '📊 Zahlen der Woche'));
  const grid = el('div', 'stat-grid');
  for (const n of numbers) {
    const tile = el('div', 'stat-tile');
    tile.append(el('small', '', n.label), el('b', '', n.value), el('em', '', n.sub || ''));
    grid.append(tile);
  }
  card.append(grid, el('p', 'card-source', 'Echte Daten aus deinem Jarvis'));
  cardMessage('Zahlen', card);
}

// --- Pictures: created by Jarvis, or sent to Jarvis for analysis -------------------

function addImageCard({ url, title, description }) {
  const card = el('div', 'image-card');
  const wait = el('p', 'image-wait', '🎨 Jarvis malt …');
  const img = el('img');
  img.alt = title || 'Bild von Jarvis';
  img.hidden = true;
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => { wait.remove(); img.hidden = false; els.transcript.scrollTop = els.transcript.scrollHeight; });
  img.addEventListener('error', () => { wait.textContent = 'Das Bild konnte nicht geladen werden. Sag „Mal es noch mal“.'; });
  img.src = url;
  const actions = el('div', 'order-actions');
  actions.append(Object.assign(el('a', 'ctrl', 'Groß öffnen / speichern'), { href: url, target: '_blank', rel: 'noopener noreferrer' }));
  card.append(wait, img, el('p', '', `${title || ''}${description ? ` – ${description}` : ''}`), actions);
  cardMessage('Bild', card);
}

async function sendImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    image.src = URL.createObjectURL(file);
  });
  const question = els.textInput?.value.trim() || '';
  if (els.textInput) els.textInput.value = '';
  const card = el('div', 'image-card');
  const img = el('img');
  img.src = dataUrl;
  img.alt = 'Dein Bild';
  const answer = el('p', '', '🔍 Jarvis schaut sich das Bild an …');
  card.append(img, answer);
  cardMessage(question ? `Du: ${question}` : 'Dein Bild', card);
  try {
    const response = await fetch('/api/vision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl, question }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler');
    answer.textContent = data.answer;
    if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: 'vision_result', answer: data.answer, question }));
  } catch (error) {
    answer.textContent = `⚠️ ${error.message}`;
  }
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

// The sales website for the Jarvis-Bauplan: link, downloads and what is missing.
function addBauplanCard(info) {
  const card = el('div', 'info-card bauplan-card');
  card.append(el('span', 'shop-card-title', '🚀 Deine Verkaufswebsite: Jarvis-Bauplan'));
  card.append(el('p', 'bauplan-status', info.missing?.length ? '🟡 Entwurf – vor dem Veröffentlichen noch ergänzen' : '🟢 Fertig und online'));
  const actions = el('div', 'order-actions');
  const open = Object.assign(el('a', 'ctrl', 'Website öffnen'), { href: info.url, target: '_blank', rel: 'noopener' });
  const copy = el('button', 'ctrl', 'Link kopieren');
  copy.type = 'button';
  copy.addEventListener('click', () => navigator.clipboard?.writeText(info.url).then(() => toast('Link kopiert.'), () => {}));
  const download = (file, label) => Object.assign(el('a', 'ctrl', label), { href: `/api/bauplan/download?file=${file}`, download: '' });
  actions.append(open, copy, download('page', 'Website als HTML'), download('starter', `Produkt Starter (${info.prices?.starter || ''})`), download('komplett', `Produkt Komplett (${info.prices?.komplett || ''})`));
  card.append(actions);
  if (info.missing?.length) {
    const list = el('ul', 'bauplan-missing');
    for (const m of info.missing) {
      const row = el('li');
      row.append(el('code', '', m.key), document.createTextNode(` – ${m.what}`));
      list.append(row);
    }
    card.append(el('p', 'card-source', 'Bei Render → Environment eintragen:'), list);
  }
  cardMessage('Website', card);
}

// "Alle Systeme online": short boot sequence when Jarvis connects.
let booted = false;
function bootSequence() {
  if (booted) return;
  booted = true;
  hudBoot('voice', true);
}

function addWeatherCard(weather) {
  if (!weather?.jetzt) return;
  const card = document.createElement('div');
  card.className = 'info-card';
  const now = document.createElement('div');
  now.className = 'weather-now';
  const icon = document.createElement('span');
  icon.className = 'weather-icon';
  icon.textContent = weather.jetzt.symbol || '🌡️';
  const temp = document.createElement('span');
  temp.className = 'weather-temp';
  temp.textContent = weather.jetzt.temperatur === null ? '–' : `${weather.jetzt.temperatur}°`;
  const text = document.createElement('div');
  const desc = document.createElement('span');
  desc.className = 'weather-desc';
  desc.textContent = `${weather.jetzt.wetter}${weather.jetzt.gefuehlt !== null ? `, gefühlt ${weather.jetzt.gefuehlt}°` : ''}${weather.jetzt.windKmh !== null ? `, Wind ${weather.jetzt.windKmh} km/h` : ''}`;
  const place = document.createElement('span');
  place.className = 'weather-place';
  place.textContent = `📍 ${weather.ort}`;
  text.append(desc, place);
  now.append(icon, temp, text);
  card.append(now);
  if (Array.isArray(weather.tage) && weather.tage.length > 1) {
    const days = document.createElement('div');
    days.className = 'weather-days';
    for (const day of weather.tage) {
      const box = document.createElement('div');
      box.className = 'weather-day';
      const name = document.createElement('b');
      name.textContent = String(day.tag || '').slice(0, 2);
      const symbol = document.createElement('span');
      symbol.textContent = day.symbol || '🌡️';
      const range = document.createElement('div');
      range.textContent = `${day.max ?? '–'}° / ${day.min ?? '–'}°`;
      const rain = document.createElement('div');
      rain.textContent = day.regenWahrscheinlichkeit !== null && day.regenWahrscheinlichkeit !== undefined ? `💧 ${day.regenWahrscheinlichkeit} %` : '';
      box.append(name, symbol, range, rain);
      days.append(box);
    }
    card.append(days);
  }
  const source = document.createElement('span');
  source.className = 'weather-source';
  source.textContent = 'Wetterdaten: Open-Meteo';
  card.append(source);
  cardMessage('Wetter', card);
}

function addWebcamCard({ title, cams, links }) {
  const card = document.createElement('div');
  card.className = 'info-card';
  const heading = document.createElement('span');
  heading.className = 'shop-card-title';
  heading.textContent = `📹 ${title}`;
  card.append(heading);
  const grid = document.createElement('div');
  grid.className = 'cam-grid';
  for (const cam of Array.isArray(cams) ? cams : []) {
    if (!/^https:\/\//.test(cam.link || '')) continue;
    const tile = document.createElement('a');
    tile.className = 'cam-tile';
    tile.href = cam.link;
    tile.target = '_blank';
    tile.rel = 'noopener noreferrer';
    if (/^https:\/\//.test(cam.bild || '')) {
      const img = document.createElement('img');
      img.src = cam.bild;
      img.alt = cam.titel;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove());
      tile.append(img);
    }
    const caption = document.createElement('span');
    caption.textContent = [cam.titel, cam.ort].filter(Boolean).join(' · ');
    tile.append(caption);
    grid.append(tile);
  }
  if (grid.children.length) card.append(grid);
  const buttons = document.createElement('div');
  buttons.className = 'shop-links';
  for (const link of Array.isArray(links) ? links : []) {
    if (!/^https:\/\//.test(link.url)) continue;
    const a = document.createElement('a');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link.name;
    buttons.append(a);
  }
  if (buttons.children.length) card.append(buttons);
  cardMessage('Webcams', card);
}

function addNewsCard(news) {
  if (!Array.isArray(news?.meldungen) || !news.meldungen.length) return;
  const card = document.createElement('div');
  card.className = 'info-card';
  const title = document.createElement('span');
  title.className = 'shop-card-title';
  title.textContent = `📰 Nachrichten (${news.quelle})`;
  const list = document.createElement('ul');
  list.className = 'news-list';
  for (const item of news.meldungen) {
    const row = document.createElement('li');
    let entry;
    if (/^https:\/\//.test(item.link || '')) {
      entry = document.createElement('a');
      entry.href = item.link;
      entry.target = '_blank';
      entry.rel = 'noopener noreferrer';
    } else {
      entry = document.createElement('span');
    }
    entry.textContent = item.titel;
    row.append(entry);
    list.append(row);
  }
  card.append(title, list);
  cardMessage('Nachrichten', card);
}

// --- Suggestions ------------------------------------------------------------------

const SUGGESTIONS = ['Guten Morgen!', 'Wie wird das Wetter?', 'Was steht diese Woche an?', 'Was gibt es Neues?', 'Hab ich neue Mails?', 'Mach mir ein Spiel', 'Was weißt du über mich?', 'Zeig meine Einkaufsliste', 'Erstelle eine Website'];
els.chips.replaceChildren(...SUGGESTIONS.map((text) => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip-btn';
  chip.textContent = text;
  chip.disabled = true;
  chip.addEventListener('click', () => sendText(text));
  return chip;
}));

// --- Customers (website business) ----------------------------------------

const STATUS_LABELS = { neu: 'Neu', angesprochen: 'Angesprochen', interessiert: 'Interessiert ✓', angebot_gesendet: 'Angebot gesendet', gekauft: 'Gekauft 💰', abgelehnt: 'Abgelehnt' };

const customers = syncedList({
  key: 'jarvis.customers',
  timeKey: 'jarvis.customersUpdatedAt',
  updateType: 'customers_update',
  clean: (list) => (Array.isArray(list) ? list : []).filter((customer) => typeof customer?.name === 'string' && typeof customer?.id === 'string').slice(0, 100),
  onChange: () => {
    if (!els.customersModal.hidden) renderCustomers();
  }
});

function renderCustomers() {
  const list = customers.load();
  const sold = list.filter((customer) => customer.status === 'gekauft').length;
  els.customersSummary.textContent = list.length ? `${list.length} ${list.length === 1 ? 'Kunde' : 'Kunden'} · ${sold} gekauft` : '';
  els.customerList.replaceChildren(...list.map((customer) => {
    const row = document.createElement('li');
    row.dataset.status = customer.status;
    const info = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'customer-name';
    name.textContent = customer.name;
    const meta = document.createElement('span');
    meta.className = 'customer-meta';
    meta.textContent = [customer.branche, customer.ort, customer.preis, customer.email].filter(Boolean).join(' · ') || 'Keine Details';
    info.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'customer-actions';
    const status = document.createElement('select');
    status.setAttribute('aria-label', `Status von ${customer.name}`);
    for (const [value, label] of Object.entries(STATUS_LABELS)) status.append(new Option(label, value, false, value === customer.status));
    status.addEventListener('change', () => {
      customers.store(list.map((entry) => (entry.id === customer.id ? { ...entry, status: status.value, aktualisiert: new Date().toISOString() } : entry)));
    });
    actions.append(status);
    if (customer.site?.path && /^\/site\.html#/.test(customer.site.path)) {
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'ctrl';
      preview.textContent = '↗ Vorschau';
      preview.addEventListener('click', () => {
        els.customersModal.hidden = true;
        openGame(location.origin + customer.site.path, customer.site.title || customer.name);
      });
      actions.append(preview);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `${customer.name} löschen`);
    remove.addEventListener('click', () => {
      if (confirm(`${customer.name} aus der Kundenliste löschen?`)) customers.store(list.filter((entry) => entry.id !== customer.id));
    });
    actions.append(remove);
    row.append(info, actions);
    return row;
  }));
  els.customersEmpty.hidden = list.length > 0;
}

function showCustomers() {
  renderCustomers();
  els.customersModal.hidden = false;
}

els.customersButton.addEventListener('click', showCustomers);
els.customersClose.addEventListener('click', () => {
  els.customersModal.hidden = true;
});
els.customersModal.addEventListener('click', (event) => {
  if (event.target === els.customersModal) els.customersModal.hidden = true;
});

// --- Listings (selling used things) ------------------------------------------

function listingCard({ title, text, links }) {
  const card = document.createElement('div');
  card.className = 'listing-card';
  const heading = document.createElement('span');
  heading.className = 'listing-title';
  heading.textContent = `🏷️ ${title}`;
  const body = document.createElement('pre');
  body.className = 'listing-text';
  body.textContent = text;
  const buttons = document.createElement('div');
  buttons.className = 'listing-buttons';
  for (const [label, value] of [['Titel kopieren', title], ['Text kopieren', text]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ctrl';
    button.textContent = label;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = 'Kopiert ✓';
      } catch {
        button.textContent = 'Kopieren nicht möglich';
      }
      setTimeout(() => {
        button.textContent = label;
      }, 1800);
    });
    buttons.append(button);
  }
  const shops = document.createElement('div');
  shops.className = 'shop-links';
  for (const shop of Array.isArray(links) ? links : []) {
    if (!/^https:\/\//.test(shop.url)) continue;
    const a = document.createElement('a');
    a.href = shop.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = shop.name;
    shops.append(a);
  }
  card.append(heading, body, buttons, shops);
  return card;
}

function addListingCard(listing) {
  clearEmpty(els.transcript);
  const item = document.createElement('div');
  item.className = 'msg assistant';
  const label = document.createElement('span');
  label.className = 'msg-role';
  label.textContent = 'Kleinanzeige';
  item.append(label, listingCard(listing));
  els.transcript.append(item);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

// --- Shopping ----------------------------------------------------------

const shopping = syncedList({
  key: 'jarvis.shoppingList',
  timeKey: 'jarvis.shoppingListUpdatedAt',
  updateType: 'shopping_list_update',
  clean: (list) => (Array.isArray(list) ? list : []).filter((item) => typeof item?.text === 'string').slice(0, 100).map((item) => ({ text: item.text.slice(0, 80), done: item.done === true })),
  onChange: () => {
    if (!els.shoppingModal.hidden) renderShoppingList();
  }
});
const loadShoppingList = () => shopping.load();
const storeShoppingList = (items, options) => shopping.store(items, options);

function renderShoppingList() {
  const list = loadShoppingList();
  els.shoppingList.replaceChildren(...list.map((item, index) => {
    const row = document.createElement('li');
    row.classList.toggle('done', item.done);
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.done;
    box.addEventListener('change', () => {
      list[index].done = box.checked;
      storeShoppingList(list);
    });
    const text = document.createElement('span');
    text.textContent = item.text;
    label.append(box, text);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `${item.text} entfernen`);
    remove.addEventListener('click', () => storeShoppingList(list.filter((_, i) => i !== index)));
    row.append(label, remove);
    return row;
  }));
  els.shoppingEmpty.hidden = list.length > 0;
  els.shoppingClearDone.hidden = !list.some((item) => item.done);
}

function showShoppingList() {
  renderShoppingList();
  els.shoppingModal.hidden = false;
}

function addShopCard(query, links) {
  clearEmpty(els.transcript);
  const item = document.createElement('div');
  item.className = 'msg assistant';
  const label = document.createElement('span');
  label.className = 'msg-role';
  label.textContent = 'Einkaufen';
  const card = document.createElement('div');
  card.className = 'shop-card';
  const title = document.createElement('span');
  title.className = 'shop-card-title';
  title.textContent = `🛒 ${query}`;
  const buttons = document.createElement('div');
  buttons.className = 'shop-links';
  for (const shop of Array.isArray(links) ? links : []) {
    if (!/^https:\/\//.test(shop.url)) continue;
    const a = document.createElement('a');
    a.href = shop.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = shop.name;
    buttons.append(a);
  }
  card.append(title, buttons);
  item.append(label, card);
  els.transcript.append(item);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

els.shoppingButton.addEventListener('click', showShoppingList);
els.shoppingClose.addEventListener('click', () => {
  els.shoppingModal.hidden = true;
});
els.shoppingModal.addEventListener('click', (event) => {
  if (event.target === els.shoppingModal) els.shoppingModal.hidden = true;
});
els.shoppingForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = els.shoppingInput.value.trim();
  if (!text) return;
  const list = loadShoppingList();
  if (!list.some((item) => item.text.toLocaleLowerCase('de-DE') === text.toLocaleLowerCase('de-DE'))) list.push({ text, done: false });
  storeShoppingList(list);
  els.shoppingInput.value = '';
});
els.shoppingClearDone.addEventListener('click', () => storeShoppingList(loadShoppingList().filter((item) => !item.done)));

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

initMoney({ toast });
initCall({ toast });
// Settings: status of all services plus design and style switches.
async function openSettings() {
  const modal = document.getElementById('settings-modal');
  const body = document.getElementById('settings-body');
  modal.hidden = false;
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler');
    const section = (title) => el('h4', 'planner-section', title);
    const row = (title, detail, ok) => {
      const r = el('div', 'planner-row');
      const text = el('div');
      text.append(el('b', '', `${ok === undefined ? '' : ok ? '🟢 ' : '⚪ '}${title}`), el('small', '', detail));
      r.append(text);
      return r;
    };
    const pill = (label, active, onClick) => {
      const b = el('button', 'ctrl', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(active));
      if (active) b.style.borderColor = 'var(--cyan)';
      b.addEventListener('click', onClick);
      return b;
    };
    const saveStyle = async (payload) => {
      await fetch('/api/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      toast('Gespeichert – gilt sofort.');
      openSettings();
    };
    const styleRow = el('div', 'order-actions');
    styleRow.append(pill('Locker (duzt)', data.persona.style === 'freund', () => saveStyle({ style: 'freund' })), pill('Butler („Master“)', data.persona.style === 'butler', () => saveStyle({ style: 'butler' })));
    const address = el('input');
    address.type = 'text';
    address.placeholder = 'Anrede, z. B. Master, Sir, dein Name';
    address.value = data.persona.address || '';
    address.className = 'settings-input';
    const addressSave = pill('Anrede speichern', false, () => saveStyle({ address: address.value }));
    const designRow = el('div', 'order-actions');
    const active = currentTheme();
    designRow.append(...THEMES.map(([name, label]) => pill(label, active === name, () => { applyTheme(name); openSettings(); })));
    body.replaceChildren(
      section('Persönlichkeit'), styleRow, address, addressSave,
      section('Design'), designRow,
      section('Gedächtnis'), row(`${data.memories} gespeicherte Erinnerungen`, 'Ansehen und löschen über den Gehirn-Knopf oben. Passwörter und Bankdaten werden nie gespeichert.'),
      section('Dienste & Modelle'), ...Object.entries(data.services).map(([name, s]) => row(name, s.detail, s.ok)),
      el('p', 'card-source', 'Schlüssel werden nur bei Render (Environment) eingetragen – nie hier in der App. Anleitung im README.')
    );
  } catch (error) {
    body.replaceChildren(el('p', 'order-missing', `Einstellungen nicht erreichbar: ${error.message}`));
  }
}
document.getElementById('settings-button').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', () => { document.getElementById('settings-modal').hidden = true; });

// Design: "Jarvis" like the videos (default: red main screen + pink business
// mode), pink-violet Neon HUD, cyan Iron-Man HUD or bright Orb.
const THEMES = [['film', 'Jarvis (wie im Video)'], ['neon', 'Neon-HUD (pink-violett)'], ['hud', 'Iron-Man (cyan)'], ['orb', 'Orb (hell)']];
function applyTheme(name) {
  document.body.classList.toggle('theme-film', name === 'film');
  document.body.classList.toggle('theme-orb', name === 'orb');
  document.body.classList.toggle('theme-neon', name === 'neon');
  try { localStorage.setItem('jarvis.look', name); } catch { /* ignore */ }
}
const currentTheme = () => (document.body.classList.contains('theme-film') ? 'film' : document.body.classList.contains('theme-neon') ? 'neon' : document.body.classList.contains('theme-orb') ? 'orb' : 'hud');
document.getElementById('theme-button').addEventListener('click', () => {
  const next = THEMES[(THEMES.findIndex(([n]) => n === currentTheme()) + 1) % THEMES.length];
  applyTheme(next[0]);
  toast(`Design: ${next[1]}`);
});
initTasks({ toast });
initBusiness({
  toast,
  onClose: () => filmTab('normal'),
  result: hudResult,
  openStudioJob: (id, prompt) => followJob(id, 'build', prompt),
  startStudio: async (prompt) => {
    const response = await fetch('/api/studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'build', prompt }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Jarvis Studio konnte nicht starten.');
    followJob(data.id, 'build', prompt);
  }
});
initFactory({ toast, showProject, result: hudResult, onClose: () => filmTab('normal') });
initSuit({ toast, result: hudResult, onClose: () => filmTab('normal'), send: (message) => { if (state.ws?.readyState === 1) state.ws.send(JSON.stringify(message)); } });
initFace({ toast, level: () => smoothLevel });
initExtras({ toast, level: () => smoothLevel, addShopping: (text) => { const list = loadShoppingList(); if (!list.some((i) => i.text === text)) storeShoppingList([...list, { text, done: false }]); toast(`Auf die Einkaufsliste: ${text}`); } });
initMirror({ toast });
initCamFx({ toast, sendText });
initFun({ toast, send: (message) => { if (state.ws?.readyState === 1) state.ws.send(JSON.stringify(message)); } });
initPrank({ send: (message) => { if (state.ws?.readyState === 1) state.ws.send(JSON.stringify(message)); } });
initFilm({ openBusiness, openFactory, openSuit: openSuitLab });
initPalace({ toast });
initVisuals({ toast, chime: (f) => chime(f) });
initCards({
  cardMessage,
  toast,
  addToShopping(items) {
    const list = loadShoppingList();
    const known = new Set(list.map((item) => item.text.toLowerCase()));
    const fresh = items.map((text) => String(text).trim().slice(0, 80)).filter((text) => text && !known.has(text.toLowerCase()) && known.add(text.toLowerCase()));
    if (fresh.length) storeShoppingList([...list, ...fresh.map((text) => ({ text, done: false }))]);
    return fresh.length;
  }
});
initStudio({
  toast,
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  }
});
document.getElementById('image-input').addEventListener('change', (event) => {
  sendImage(event.target.files[0]).catch((error) => toast(error.message, 'error'));
  event.target.value = '';
});
initProjects({
  toast,
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  }
});
initModels({
  toast,
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  }
});
initHud({
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  }
});
const updateToday = () => hudToday({ planner: personalStores.planner.load(), shopping: loadShoppingList(), memories: memories.load() });
updateToday();
setInterval(updateToday, 5000);
initDesign({
  toast,
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  }
});
initVideo({
  toast,
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  }
});
initCamera({
  toast,
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  },
  addAnswer: (question, answer) => {
    const card = el('div', 'info-card');
    card.append(el('p', '', answer));
    cardMessage(question ? `Du: ${question}` : 'Jarvis-Augen', card);
  }
});
initGlobe({
  toast,
  send: (message) => {
    if (state.ws?.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(message));
    return true;
  }
});

function chime(frequencies = [880, 1320]) {
  if (document.body.classList.contains('shield-on')) return; // shield = focus, no sounds
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

  ws.onopen = () => hudBoot('link', true) || ws.send(JSON.stringify({ type: 'start', sampleRate: state.audio.sampleRate, shoppingList: shopping.load(), shoppingListUpdatedAt: shopping.loadTime(), customers: customers.load(), customersUpdatedAt: customers.loadTime(), memories: memories.load(), memoriesUpdatedAt: memories.loadTime(), history: loadHistory().slice(-16), stores: Object.fromEntries(Object.entries(personalStores).map(([name, store]) => [name, { items: store.load(), updatedAt: store.loadTime() }])) })) || ws.send(JSON.stringify(suitState())) || ws.send(JSON.stringify(levelState()));
  ws.onmessage = ({ data }) => {
    if (typeof data !== 'string') {
      playChunk(data);
      return;
    }
    handleMessage(JSON.parse(data));
  };
  ws.onclose = async () => {
    if (state.ws !== ws) return;
    if (!state.connected) hudBoot('link', false, 'getrennt');
    hudConnected(false);
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
        bootSequence();
        hudConnected(true);
        refreshSystem();
        state.connected = true;
        setControlsEnabled(true);
      }
      setMode(message.state);
      break;
    case 'pong':
      hudPong(message.t);
      break;
    case 'transcript':
      if (message.role === 'user') hudUser(message.content);
      addMessage(message.role === 'user' ? 'user' : 'assistant', message.content);
      rememberTurn(message.role === 'user' ? 'user' : 'assistant', message.content);
      break;
    case 'weather':
      addWeatherCard(message.weather);
      break;
    case 'webcams':
      addWebcamCard(message);
      break;
    case 'news':
      addNewsCard(message.news);
      break;
    case 'markets':
      addMarketsCard(message.markets);
      break;
    case 'bauplan':
      addBauplanCard(message);
      break;
    case 'image':
      addImageCard(message);
      break;
    case 'task':
      handleTaskEvent(message);
      break;
    case 'weather_show':
      showWeatherShow(message.weather);
      break;
    case 'focus':
      startFocus(message);
      break;
    case 'chart':
      chartCard(message.chart, cardMessage);
      break;
    case 'translate':
    case 'recipe':
    case 'journeys':
    case 'departures':
    case 'holidays':
    case 'calc':
    case 'currency':
    case 'qr':
    case 'quiz':
    case 'countdown':
    case 'summary':
    case 'football':
    case 'route':
      if (isEverydayCard(message.type)) showEverydayCard(message);
      break;
    case 'studio_open':
      followJob(message.id, message.kind, message.prompt);
      break;
    case 'weekly':
      addWeeklyCard(message.numbers);
      break;
    case 'planner':
    case 'notes':
    case 'expenses':
    case 'vocab':
      personalStores[message.type].store(message.items, { sync: false, updatedAt: message.updatedAt });
      if (message.show) showPlanner({ planner: 'termine', notes: 'notizen', expenses: 'ausgaben', vocab: 'vokabeln' }[message.type]);
      break;
    case 'camera':
      handleCameraMessage(message);
      break;
    case 'video_open':
      handleVideoMessage(message);
      break;
    case 'design_open':
      handleDesignMessage(message);
      break;
    case 'drone':
    case 'rocket':
    case 'shield':
    case 'radio':
    case 'gift':
      handleExtrasMessage(message);
      break;
    case 'effect':
      handleEffectMessage(message);
      break;
    case 'poster':
      openPoster(message);
      break;
    case 'persona':
    case 'recap':
    case 'toss':
    case 'satzoom':
    case 'level':
      handleFunMessage(message);
      break;
    case 'mirror':
      handleMirrorMessage(message);
      break;
    case 'face':
      handleFaceMessage(message);
      break;
    case 'prank':
      handlePrankMessage(message);
      break;
    case 'factory':
      filmTab('apps');
      handleFactoryMessage(message);
      break;
    case 'suit':
      if (message.action !== 'on' && message.action !== 'off') filmTab('anzug');
      handleSuitMessage(message);
      break;
    case 'business_start':
    case 'business_result':
    case 'business_error':
      filmTab('business');
      handleBusinessMessage(message);
      break;
    case 'globe':
      handleGlobeMessage(message);
      break;
    case 'order':
      addOrderCard(message);
      break;
    case 'model3d_loading':
      modelLoading(message.text);
      break;
    case 'model3d':
      showModel(message.scene);
      break;
    case 'project_loading':
      projectLoading(message.text);
      break;
    case 'project':
      showProject(message.project);
      break;
    case 'call':
      handleCallEvent(message);
      break;
    case 'money_show':
      showMoney();
      break;
    case 'memories':
      memories.store(message.items, { sync: false, updatedAt: message.updatedAt });
      if (message.show) openPalace();
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
    case 'shop':
      addShopCard(message.query, message.links);
      break;
    case 'listing': {
      const listing = { text: String(message.text || ''), links: Array.isArray(message.links) ? message.links : [] };
      saveGame({ title: message.title, type: 'anzeige', emoji: '🏷️', listing });
      addListingCard({ title: message.title, ...listing });
      break;
    }
    case 'customers':
      customers.store(message.items, { sync: false, updatedAt: message.updatedAt });
      if (message.show) showCustomers();
      break;
    case 'shopping_list':
      storeShoppingList(message.items, { sync: false, updatedAt: message.updatedAt });
      if (message.show) showShoppingList();
      break;
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
  hudBoot('start');
  try {
    await setupAudio();
    await state.audio.resume();
    hudBoot('mic', true);
    if (!(await checkSession())) return;
    els.activate.hidden = true;
    connect();
  } catch (error) {
    els.activate.disabled = false;
    setMode('error');
    const denied = error.name === 'NotAllowedError' || error.name === 'SecurityError';
    hudBoot('mic', false, denied ? 'verweigert' : 'Fehler');
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
  sendText(text);
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

// Orb design: the orb breathes with the voice and a ring of frequency bars
// shows Jarvis' (or your) voice live.
const orbCanvas = document.getElementById('orb-spectrum');
const orbCtx = orbCanvas?.getContext('2d');
let orbBins = null;
function drawOrbSpectrum(speaking) {
  if (!orbCtx) return;
  document.body.style.setProperty('--voice', smoothLevel.toFixed(3));
  const analyser = speaking ? state.outputAnalyser : state.micMuted ? null : state.inputAnalyser;
  const { width, height } = orbCanvas;
  orbCtx.clearRect(0, 0, width, height);
  if (!analyser) return;
  if (!orbBins || orbBins.length !== analyser.frequencyBinCount) orbBins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(orbBins);
  const cx = width / 2;
  const cy = height / 2;
  const bars = 72;
  const inner = width * 0.3;
  orbCtx.lineCap = 'round';
  for (let i = 0; i < bars; i += 1) {
    const bin = orbBins[Math.floor((i < bars / 2 ? i : bars - i) * (orbBins.length * 0.5) / (bars / 2))] / 255;
    const len = 4 + bin * width * 0.16;
    const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
    orbCtx.strokeStyle = speaking ? `rgba(224, 112, 63, ${0.25 + bin * 0.75})` : `rgba(120, 130, 145, ${0.2 + bin * 0.6})`;
    orbCtx.lineWidth = 3;
    orbCtx.beginPath();
    orbCtx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    orbCtx.lineTo(cx + Math.cos(a) * (inner + len), cy + Math.sin(a) * (inner + len));
    orbCtx.stroke();
  }
}
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

let suitGlow = { key: '', rgb: null };
function palette() {
  if (document.body.classList.contains('suit-on') && state.mode !== 'error') {
    const hex = ownedSuit()?.farben?.leuchten || '';
    if (suitGlow.key !== hex) suitGlow = { key: hex, rgb: /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null };
    if (suitGlow.rgb) return state.mode === 'offline' || state.micMuted ? suitGlow.rgb.map((v) => Math.round(v * 0.5)) : suitGlow.rgb;
  }
  if (document.body.classList.contains('theme-film')) {
    if (state.mode === 'error') return [255, 150, 60];
    const persona = personaColor();
    if (persona) return state.mode === 'offline' || state.micMuted ? persona.map((v) => Math.round(v * 0.55)) : persona;
    if (state.mode === 'offline' || state.micMuted) return [150, 30, 42];
    if (state.mode === 'thinking' || state.mode === 'connecting') return [255, 70, 70];
    return [255, 38, 56];
  }
  if (document.body.classList.contains('theme-neon')) {
    if (state.mode === 'error') return [255, 77, 106];
    if (state.mode === 'thinking' || state.mode === 'connecting') return [168, 85, 247];
    if (state.mode === 'offline' || state.micMuted) return [130, 90, 160];
    if (state.mode === 'speaking') return [255, 92, 190];
    return [255, 62, 165];
  }
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
  if (document.body.classList.contains('suit-photo')) document.body.style.setProperty('--voice', smoothLevel.toFixed(3));
  if (document.body.classList.contains('theme-orb')) drawOrbSpectrum(speaking);
  if (document.body.classList.contains('theme-film')) {
    drawFilmReactor(width, height, speaking);
    if (speaking && state.mode !== 'speaking' && state.mode !== 'error') setMode('speaking');
    requestAnimationFrame(draw);
    return;
  }
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

  drawLiveEffects(cx, cy);
  if (speaking && state.mode !== 'speaking' && state.mode !== 'error') setMode('speaking');
  requestAnimationFrame(draw);
}

// Reactor like in the videos: a glowing red sphere with thin rings. It breathes
// with the microphone, swells with Jarvis' real voice and spins faster while
// he works; orbiting markers show running tools, a ring flash shows results.
function drawFilmReactor(width, height, speaking) {
  const cx = width / 2;
  const cy = height / 2;
  const speed = state.mode === 'thinking' || reactorFx().working ? 0.03 : state.mode === 'offline' ? 0.003 : 0.008;
  if (!reduceMotion) angle += speed;
  const [r, g, b] = palette();
  const color = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
  const t = performance.now() / 1000;
  const breathe = reduceMotion ? 0 : (Math.sin(t * 1.6) + 1) / 2;
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';

  // Thin outer circles and slow arcs
  ctx.strokeStyle = color(0.22);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 252, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color(0.14);
  ctx.beginPath(); ctx.arc(cx, cy, 200, 0, Math.PI * 2); ctx.stroke();
  for (const [radius, len, dir, alpha, lw] of [[252, 1.1, 1, 0.85, 3], [252, 0.35, 1, 0.6, 3], [226, 0.8, -1.4, 0.45, 1.5], [200, 1.6, 0.7, 0.5, 2]]) {
    ctx.strokeStyle = color(alpha);
    ctx.lineWidth = lw;
    const start = angle * dir * 2 + radius;
    ctx.beginPath(); ctx.arc(cx, cy, radius, start, start + len); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius, start + Math.PI, start + Math.PI + len * 0.5); ctx.stroke();
  }
  // Extra rings unlocked by Jarvis' level (2, 4, 8 …) and arcs from level 3
  const level = Number(document.body.dataset.level) || 1;
  const extra = [2, 4, 8].filter((l) => level >= l).length;
  for (let i = 0; i < extra; i += 1) {
    const rr = 261 + i * 8;
    ctx.strokeStyle = color(0.18 + i * 0.05); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color(0.7); ctx.lineWidth = 2.5;
    const st = -angle * (1.5 + i) + i;
    ctx.beginPath(); ctx.arc(cx, cy, rr, st, st + 0.5); ctx.stroke();
  }
  if (level >= 3) {
    for (let i = 0; i < 3; i += 1) {
      const st = angle * 3 + (i * Math.PI * 2) / 3;
      ctx.strokeStyle = level >= 5 ? `rgba(255, 210, 120, ${0.55 + smoothLevel * 0.4})` : color(0.55);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 176, st, st + 0.35); ctx.stroke();
    }
  }
  // Fine ticks on a quarter of the ring
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-angle);
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 160) * Math.PI * 2;
    ctx.strokeStyle = color(i % 5 === 0 ? 0.6 : 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 238, Math.sin(a) * 238); ctx.lineTo(Math.cos(a) * 244, Math.sin(a) * 244); ctx.stroke();
  }
  ctx.restore();

  // Voice ring: wobbles with the real audio level
  ctx.beginPath();
  for (let i = 0; i <= 160; i += 1) {
    const a = (i / 160) * Math.PI * 2;
    const wobble = Math.sin(a * 7 + t * 6) * Math.sin(a * 3 - t * 4);
    const radius = 150 + smoothLevel * 30 * wobble + smoothLevel * 14;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color(0.55 + smoothLevel * 0.4);
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color(0.9);
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Halo + sphere
  const radius = 92 + smoothLevel * 30 + breathe * 4 + (speaking ? 6 : 0);
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 2.4);
  halo.addColorStop(0, color(0.45));
  halo.addColorStop(0.5, color(0.12));
  halo.addColorStop(1, color(0));
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, cy, radius * 2.4, 0, Math.PI * 2); ctx.fill();
  const sphere = ctx.createRadialGradient(cx - radius * 0.18, cy - radius * 0.2, radius * 0.05, cx, cy, radius);
  sphere.addColorStop(0, `rgba(255, ${235 - (state.mode === 'offline' ? 120 : 0)}, 235, 1)`);
  sphere.addColorStop(0.22, `rgba(255, ${Math.min(255, g + 90)}, ${Math.min(255, b + 90)}, 1)`);
  sphere.addColorStop(0.6, color(1));
  sphere.addColorStop(1, `rgba(${Math.round(r * 0.35)}, ${Math.round(g * 0.2)}, ${Math.round(b * 0.25)}, 1)`);
  ctx.fillStyle = sphere;
  ctx.shadowColor = color(1);
  ctx.shadowBlur = 50;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color(0.9);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2); ctx.stroke();
  if (level >= 5) { ctx.strokeStyle = 'rgba(255, 205, 110, 0.85)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255, 190, 80, 0.9)'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
  if (level >= 6) {
    for (let i = 0; i < 14; i += 1) {
      const a = t * (0.6 + (i % 4) * 0.2) + i * 2.1;
      const rr = radius + 34 + Math.sin(t * 2 + i) * 14;
      ctx.fillStyle = `rgba(255, ${190 + (i % 3) * 20}, 120, ${0.5 + 0.4 * Math.sin(t * 5 + i)})`;
      ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, 3);
    }
  }
  if (level >= 10) { ctx.strokeStyle = 'rgba(255, 220, 140, 0.6)'; ctx.lineWidth = 1.5; for (const dir of [1, -1]) { const st = angle * 4 * dir; ctx.beginPath(); ctx.arc(cx, cy, 232, st, st + Math.PI * 0.6); ctx.stroke(); } }

  drawLiveEffects(cx, cy);
}

// Real status on the reactor: orbiting markers while Jarvis runs tools, a
// shock ring when an action finished (cyan = success, red = error).
function drawLiveEffects(cx, cy) {
  const fx = reactorFx();
  if (fx.working > 0) {
    for (let i = 0; i < 3; i += 1) {
      const a = angle * 3 + (i / 3) * Math.PI * 2;
      const x = cx + Math.cos(a) * 232;
      const y = cy + Math.sin(a) * 232;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
      g.addColorStop(0, 'rgba(160, 245, 255, 1)');
      g.addColorStop(1, 'rgba(56, 225, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (fx.flash) {
    const k = (performance.now() - fx.flash.at) / 900;
    if (k < 1) {
      const [r, g, b] = fx.flash.color;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.9 * (1 - k)})`;
      ctx.lineWidth = 10 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, 120 + k * 150, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

setMode('offline');
restoreHistory();
checkSession();
requestAnimationFrame(draw);
