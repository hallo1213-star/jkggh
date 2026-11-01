// Jarvis cloud server: serves the interface behind a password login, bridges
// the browser microphone to Deepgram Voice Agent, runs cloud functions and
// forwards computer-control functions to the laptop connector when it is online.
// The API keys stay in this process and never reach the browser.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { DeepgramClient } from '@deepgram/sdk';
import { buildPrompt, buildSettings, missingConfig } from './agent-config.js';
import { attemptLogin, clearedCookie, isAuthenticated, passwordConfigured, sessionCookie, tokenMatches } from './auth.js';
import { cloudTools, findCloudTool } from './cloud-tools.js';
import { addItems, sanitizeList } from './shopping.js';
import { sanitizeCustomers } from './customers.js';
import { sanitizeHistory, sanitizeMemories } from './memories.js';
import { loadPinnedBackup, savePinnedBackup, sendTelegram, startSetupHelper, telegramConfigured } from './telegram.js';
import { startMailWatcher } from './mail-watch.js';
import { sanitizePlanner } from './planner.js';
import { sanitizeExpenses, sanitizeNotes, sanitizeVocab } from './personal.js';
import { composeBriefing, startScheduler } from './scheduler.js';
import { getNews, getWeather } from './knowledge.js';
import { gmailConfigured, listEmails } from './gmail.js';
import { sendVoiceNote, voiceMessagesEnabled } from './voice-message.js';
import { sendTelegramDocument } from './telegram.js';
import { addIncome, completeUserTask, sanitizeMoney, startMoney, stopMoney, addLog as addMoneyLog, updateProject, updateTask, incomeTotals } from './money-state.js';
import { moneyToolStatus, relinkPages, startMoneyAgent } from './money-agent.js';
import { gumroadConfigured, gumroadProducts } from './gumroad.js';
import { geocodePlace, placeDetails, reversePlace } from './places.js';
import { getActiveCall, handleStatusCallback, handleTwilioStream, hangup as hangupCall, simulateCall, startCall } from './phone-call.js';
import { spokenPhone } from './restaurants.js';
import { bauplanConfig, missingSettings, renderSalesPage } from './bauplan-page.js';
import { productFiles } from './bauplan-content.js';
import { designScene, sanitizeScene } from './model3d.js';
import { sanitizeProject, writeProject } from './projects.js';
import { findTool as findLaptopTool, functionDefinitions as laptopFunctions } from './laptop/tools.js';

if (!process.env.TZ) process.env.TZ = 'Europe/Berlin';
const root = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // no .env (on Render the values come from the dashboard)
}

// One failed message (e.g. to a conversation that just closed) must never take
// the whole server down for every device; log it instead.
process.on('unhandledRejection', (error) => console.error('Unerwarteter Fehler:', error?.message || error));
process.on('uncaughtException', (error) => console.error('Unerwarteter Fehler:', error?.message || error));

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const publicDir = join(root, 'public');
const CONFIRM_TIMEOUT_MS = 90_000;
const LAPTOP_CALL_TIMEOUT_MS = 16 * 60 * 1000;
// Game and website pages are public so they can be shared; they hold no secrets.
const publicFiles = new Set(['/login.html', '/login.js', '/style.css', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/play.html', '/game.js', '/game.css', '/game-config.js', '/site.html', '/site.js', '/site.css', '/site-config.js', '/link-codec.js']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};
const functionDefinitions = [
  ...cloudTools.map(({ name, description, parameters, confirm }) => ({ name, description, parameters, ...(confirm ? { defer_until_eot: true } : {}) })),
  ...laptopFunctions
];

const isSecure = (request) => request.headers['x-forwarded-proto'] === 'https';
// Render appends the real client address as the last X-Forwarded-For entry.
const clientId = (request) => String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',').pop().trim();

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

function readBody(request, limit = 2048) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Anfrage zu groß'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

// --- Laptop connector ------------------------------------------------------

const laptop = { ws: null, calls: new Map() };
const sessions = new Set();

// Lists shared by all devices (shopping list, customers). The free server
// forgets them while it sleeps, so every device keeps a copy stamped with the
// server's version time; the newest copy wins when a device connects, and
// every change is sent to all open devices.
function createSharedStore(type, sanitize, mergeUnstamped, onChange = () => {}) {
  const store = { items: sanitize(undefined), updatedAt: 0 };
  return {
    get items() {
      return store.items;
    },
    get updatedAt() {
      return store.updatedAt;
    },
    set(items) {
      store.items = sanitize(items);
      store.updatedAt = Date.now();
      for (const session of sessions) this.send(session);
      onChange(store);
    },
    send(session, extra = {}) {
      session.toBrowser({ type, items: store.items, updatedAt: store.updatedAt, ...extra });
    },
    adopt(items, updatedAt) {
      const deviceItems = sanitize(items);
      const deviceTime = Math.min(Number(updatedAt) || 0, Date.now());
      if (deviceTime > store.updatedAt) {
        store.items = deviceItems;
        store.updatedAt = deviceTime;
        onChange(store);
      } else if (!deviceTime && deviceItems.length && mergeUnstamped) {
        // Saved by an older app version without a timestamp: merge instead of losing items.
        this.set(mergeUnstamped(store.items, deviceItems));
      }
    }
  };
}

const shoppingStore = createSharedStore('shopping_list', sanitizeList, (current, device) => addItems(current, device.map((item) => item.text)).list);
const customerStore = createSharedStore('customers', sanitizeCustomers, null);
const memoryStore = createSharedStore('memories', sanitizeMemories, (current, device) => [...current, ...device]);
const notesStore = createSharedStore('notes', sanitizeNotes, null);
const expensesStore = createSharedStore('expenses', sanitizeExpenses, null);
const vocabStore = createSharedStore('vocab', sanitizeVocab, null);

// The planner is also kept as a pinned Telegram message, so reminders and the
// briefing survive restarts even when no device is open.
let backupTimer = null;
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    savePinnedBackup({ planner: plannerStore.items, updatedAt: plannerStore.updatedAt, money: moneyCompact() }).catch((error) => console.warn(`Telegram-Sicherung: ${error.message}`));
  }, 2000);
}
const plannerStore = createSharedStore('planner', sanitizePlanner, null, scheduleBackup);

// --- Money mode --------------------------------------------------------------
// The full state (products can be long) lives here and on the user's devices;
// the pinned Telegram backup only holds whether the mode is on. After a restart
// the worker waits until a device has sent its copy back (`pending`).
const money = { state: sanitizeMoney(), updatedAt: 0, pending: null, origin: process.env.RENDER_EXTERNAL_URL || '' };
function moneyCompact() {
  return money.state.enabled || money.pending ? { enabled: money.pending?.enabled ?? money.state.enabled, goal: (money.pending?.goal ?? money.state.goal).slice(0, 200), activeProjectId: money.pending?.activeProjectId ?? money.state.activeProjectId, updatedAt: money.pending?.updatedAt ?? money.updatedAt } : null;
}
function setMoney(state) {
  const before = JSON.stringify(moneyCompact());
  money.state = sanitizeMoney(state);
  money.updatedAt = Date.now();
  if (JSON.stringify(moneyCompact()) !== before) scheduleBackup();
}
function adoptMoney(state, updatedAt) {
  const time = Math.min(Number(updatedAt) || 0, Date.now());
  if (time <= money.updatedAt) return false;
  money.state = sanitizeMoney(state);
  money.updatedAt = time;
  money.pending = null;
  return true;
}
// Everything except the long product texts (those load on demand).
function moneyOverview() {
  const { state } = money;
  return { ...state, products: state.products.map(({ content, ...rest }) => ({ ...rest, size: content.length })), pages: state.pages.map(({ site, ...rest }) => rest) };
}
const syncedStores = { planner: plannerStore, notes: notesStore, expenses: expensesStore, vocab: vocabStore };

// Scheduled messages go to Telegram (as a voice message if enabled) and to every open app.
async function deliverNotice({ spoken, caption }) {
  for (const session of sessions) session.toBrowser({ type: 'timer', message: caption });
  if (telegramConfigured()) {
    if (voiceMessagesEnabled()) await sendVoiceNote(spoken, caption);
    else await sendTelegram(caption);
  }
}

// Live updates of Jarvis' phone call go to every open app; the result also to
// Telegram and to the conversation that started the call.
function callEventHandler(origin) {
  return (event) => {
    for (const session of sessions) session.toBrowser({ type: 'call', ...event });
    if (event.event !== 'ended') return;
    const r = event.result;
    const text = r
      ? { angenommen: `✅ Bestellung bei ${event.restaurant} aufgegeben${r.preis ? ` – ${r.preis}` : ''}${r.fertigUm ? `, fertig: ${r.fertigUm}` : ''}.`, teilweise: `⚠️ Bestellung bei ${event.restaurant} nur teilweise aufgegeben${r.preis ? ` – ${r.preis}` : ''}${r.fertigUm ? `, fertig: ${r.fertigUm}` : ''}.`, abgelehnt: `❌ ${event.restaurant} hat die Bestellung nicht angenommen.`, nicht_erreicht: `📵 ${event.restaurant} nicht erreicht (${r.notiz || event.status}).` }[r.status] || `☎️ Anruf bei ${event.restaurant} beendet – Ergebnis unklar.`
      : `☎️ Anruf bei ${event.restaurant} beendet (${event.status}) – keine Bestellung bestätigt.`;
    const full = `${event.test ? '🧪 TEST – niemand wurde angerufen. ' : ''}${text}${r?.notiz && r.status !== 'nicht_erreicht' && !event.test ? `\nHinweis: ${r.notiz}` : ''}`;
    if (telegramConfigured()) sendTelegram(full).catch(() => {});
    origin?.tell?.(full);
  };
}

// "Wohnt in Köln" from the memory, used as the briefing's weather location.
function homeTown() {
  for (const memory of memoryStore.items) {
    const match = /wohnt in ([^,.;]+)/i.exec(memory.text);
    if (match) return match[1].trim();
  }
  return '';
}

function laptopConnected() {
  return laptop.ws?.readyState === WebSocket.OPEN;
}

function broadcastLaptopStatus() {
  for (const session of sessions) {
    session.toBrowser({ type: 'laptop', connected: laptopConnected() });
    session.updatePrompt?.();
  }
}

// Resolves with the connector's result message: { ok, result } | { ok: false, error } | { ok: false, denied }.
function callLaptop(id, name, args, session) {
  return new Promise((resolve) => {
    if (!laptopConnected()) {
      resolve({ ok: false, error: 'Der Laptop ist gerade nicht verbunden (ausgeschaltet oder Laptop-Verbinder nicht gestartet).' });
      return;
    }
    const timeout = setTimeout(() => finish({ ok: false, error: 'Der Laptop hat nicht rechtzeitig geantwortet.' }), LAPTOP_CALL_TIMEOUT_MS);
    function finish(result) {
      clearTimeout(timeout);
      laptop.calls.delete(id);
      resolve(result);
    }
    laptop.calls.set(id, {
      finish,
      confirm: async (request) => {
        const approved = await session.askConfirmation(id, request);
        if (laptopConnected()) laptop.ws.send(JSON.stringify({ type: 'confirm_response', id, approved }));
      }
    });
    laptop.ws.send(JSON.stringify({ type: 'call', id, name, args }));
  });
}

const laptopWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
laptopWss.on('connection', (ws) => {
  if (laptopConnected()) laptop.ws.close(4000, 'replaced');
  laptop.ws = ws;
  ws.isAlive = true;
  console.log('Laptop verbunden');
  broadcastLaptopStatus();
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    const call = laptop.calls.get(message.id);
    if (!call) return;
    if (message.type === 'confirm_request') call.confirm({ title: message.title, detail: message.detail, code: message.code });
    else if (message.type === 'result') call.finish(message);
  });
  ws.on('close', () => {
    if (laptop.ws !== ws) return;
    laptop.ws = null;
    console.log('Laptop getrennt');
    for (const call of laptop.calls.values()) call.finish({ ok: false, error: 'Die Verbindung zum Laptop wurde getrennt.' });
    broadcastLaptopStatus();
  });
});

// Heartbeat keeps the connection alive through proxies and detects dead laptops.
setInterval(() => {
  const ws = laptop.ws;
  if (!ws) return;
  if (!ws.isAlive) {
    ws.terminate();
    return;
  }
  ws.isAlive = false;
  ws.ping();
}, 25_000);

// --- HTTP ------------------------------------------------------------------

const httpServer = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');

  if (pathname === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    let password = '';
    try {
      password = JSON.parse(await readBody(request)).password;
    } catch {
      sendJson(response, 400, { error: 'Ungültige Anfrage' });
      return;
    }
    if (!passwordConfigured()) {
      sendJson(response, 503, { error: 'JARVIS_PASSWORD ist nicht gesetzt (mindestens 8 Zeichen).' });
      return;
    }
    const result = attemptLogin(clientId(request), password);
    if (result.ok) sendJson(response, 200, { ok: true }, { 'set-cookie': sessionCookie(isSecure(request)) });
    else if (result.locked) sendJson(response, 429, { error: `Zu viele Fehlversuche. Bitte in ${Math.ceil(result.retryAfterSeconds / 60)} Minuten erneut versuchen.` });
    else sendJson(response, 401, { error: 'Falsches Passwort.' });
    return;
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    sendJson(response, 200, { ok: true }, { 'set-cookie': clearedCookie(isSecure(request)) });
    return;
  }

  if (pathname === '/api/session') {
    if (!isAuthenticated(request)) sendJson(response, 401, { error: 'Nicht angemeldet' });
    else sendJson(response, 200, { ok: true, laptop: laptopConnected() });
    return;
  }

  // The public sales page for the Jarvis-Bauplan (no login – it is meant to be shared).
  if (pathname === '/bauplan' || pathname === '/bauplan/') {
    const config = bauplanConfig();
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
    response.end(renderSalesPage(config));
    return;
  }

  if (pathname === '/api/project' && request.method === 'POST') {
    if (!isAuthenticated(request) || !String(request.headers['content-type'] || '').startsWith('application/json')) {
      sendJson(response, 401, { error: 'Nicht angemeldet' });
      return;
    }
    try {
      const body = JSON.parse(await readBody(request, 600 * 1024));
      const project = await writeProject(body.prompt, { base: body.base ? sanitizeProject(body.base) : null });
      sendJson(response, 200, { project });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/model' && request.method === 'POST') {
    if (!isAuthenticated(request) || !String(request.headers['content-type'] || '').startsWith('application/json')) {
      sendJson(response, 401, { error: 'Nicht angemeldet' });
      return;
    }
    try {
      const body = JSON.parse(await readBody(request, 256 * 1024));
      const scene = await designScene(body.prompt, { base: body.base ? sanitizeScene(body.base) : null });
      sendJson(response, 200, { scene });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/bauplan/download') {
    if (!isAuthenticated(request)) {
      sendJson(response, 401, { error: 'Nicht angemeldet' });
      return;
    }
    const file = new URL(request.url, 'http://localhost').searchParams.get('file');
    const products = productFiles();
    const download = file === 'page'
      ? { filename: 'jarvis-bauplan-website.html', content: renderSalesPage(bauplanConfig()), type: 'text/html' }
      : products[file] ? { ...products[file], type: 'text/markdown' } : null;
    if (!download) {
      sendJson(response, 404, { error: 'Unbekannte Datei' });
      return;
    }
    response.writeHead(200, { 'content-type': `${download.type}; charset=utf-8`, 'content-disposition': `attachment; filename="${download.filename}"`, 'cache-control': 'no-store' });
    response.end(download.content);
    return;
  }

  if (pathname === '/twilio/status' && request.method === 'POST') {
    const token = new URL(request.url, 'http://localhost').searchParams.get('token');
    let params = new URLSearchParams();
    try {
      params = new URLSearchParams(await readBody(request, 16384));
    } catch {
      // ignore
    }
    response.writeHead(handleStatusCallback(token, params) ? 204 : 404);
    response.end();
    return;
  }

  if (pathname === '/api/call') {
    if (!isAuthenticated(request)) {
      sendJson(response, 401, { error: 'Nicht angemeldet' });
      return;
    }
    if (request.method === 'POST' && String(request.headers['content-type'] || '').startsWith('application/json')) {
      sendJson(response, 200, { ok: await hangupCall() });
    } else {
      sendJson(response, 200, { call: getActiveCall() });
    }
    return;
  }

  if (pathname.startsWith('/api/globe/')) {
    if (!isAuthenticated(request)) {
      sendJson(response, 401, { error: 'Nicht angemeldet' });
      return;
    }
    const params = new URL(request.url, 'http://localhost').searchParams;
    try {
      if (pathname === '/api/globe/config') sendJson(response, 200, { ionToken: process.env.CESIUM_ION_TOKEN?.trim() || null });
      else if (pathname === '/api/globe/search') sendJson(response, 200, { place: await geocodePlace(params.get('q')) });
      else if (pathname === '/api/globe/details') {
        const place = await geocodePlace(params.get('q'));
        const details = await placeDetails(place, params.get('topic') || '');
        sendJson(response, 200, { place, left: details.left, right: details.right });
      } else if (pathname === '/api/globe/reverse') sendJson(response, 200, { place: await reversePlace(params.get('lat'), params.get('lon')) });
      else sendJson(response, 404, { error: 'Nicht gefunden' });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (pathname.startsWith('/api/money')) {
    if (!isAuthenticated(request)) {
      sendJson(response, 401, { error: 'Nicht angemeldet' });
      return;
    }
    if (!money.origin || !process.env.RENDER_EXTERNAL_URL) money.origin = `${isSecure(request) ? 'https' : 'http'}://${request.headers.host}`;
    await handleMoneyApi(request, response, pathname);
    return;
  }

  const route = pathname === '/' ? '/index.html' : pathname;
  if (!publicFiles.has(route) && !isAuthenticated(request)) {
    if (route === '/index.html') {
      response.writeHead(302, { location: '/login.html', 'cache-control': 'no-store' });
      response.end();
    } else {
      sendJson(response, 401, { error: 'Nicht angemeldet' });
    }
    return;
  }

  const file = normalize(join(publicDir, decodeURIComponent(route)));
  const type = contentTypes[extname(file)];
  if (!file.startsWith(publicDir + sep) || !type) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Nicht gefunden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Nicht gefunden');
  }
});

async function handleMoneyApi(request, response, pathname) {
  try {
    if (request.method === 'GET' && pathname === '/api/money') {
      let gumroad = null;
      let gumroadError = null;
      if (gumroadConfigured()) gumroad = await gumroadProducts().catch((error) => { gumroadError = error.message; return null; });
      sendJson(response, 200, {
        version: money.updatedAt,
        waitingForDevice: Boolean(money.pending),
        state: moneyOverview(),
        totals: incomeTotals(money.state, gumroad),
        gumroad: gumroad ? { products: gumroad.products, checkedAt: gumroad.checkedAt } : null,
        gumroadError,
        tools: moneyToolStatus({ telegram: telegramConfigured(), gmail: gmailConfigured(), laptop: laptopConnected() }),
        origin: money.origin
      });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/money/full') {
      sendJson(response, 200, { version: money.updatedAt, state: money.state });
      return;
    }
    if (request.method !== 'POST' || !String(request.headers['content-type'] || '').startsWith('application/json')) {
      sendJson(response, 405, { error: 'Nicht erlaubt' });
      return;
    }
    if (pathname === '/api/money/restore') {
      const body = JSON.parse(await readBody(request, 5 * 1024 * 1024));
      const adopted = adoptMoney(body.state, body.version);
      if (adopted) console.log('Geld-Modus: Daten vom Gerät übernommen.');
      sendJson(response, 200, { ok: true, adopted, version: money.updatedAt });
      return;
    }
    if (pathname === '/api/money/command') {
      const body = JSON.parse(await readBody(request, 8192));
      const result = applyMoneyCommand(body);
      sendJson(response, 200, { ok: true, ...result, version: money.updatedAt });
      return;
    }
    sendJson(response, 404, { error: 'Nicht gefunden' });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

// Changes from the dashboard and from voice commands.
function applyMoneyCommand({ action, ...args }) {
  // Acting in the dashboard means the current data is the right one.
  money.pending = null;
  const state = money.state;
  const without = (list, id) => list.filter((item) => item.id !== id);
  switch (action) {
    case 'start':
      setMoney(startMoney(state, args.goal));
      setTimeout(() => moneyAgent?.tick(), 500);
      return { message: 'Geld-Modus läuft.' };
    case 'stop':
      setMoney(stopMoney(state));
      return { message: 'Geld-Modus ist aus.' };
    case 'run_now':
      if (!state.enabled) throw new Error('Der Geld-Modus ist aus.');
      setTimeout(() => moneyAgent?.tick(), 100);
      return { message: 'Nächster Schritt startet.' };
    case 'income_add': {
      const { state: next, income } = addIncome(state, args);
      setMoney(next);
      return { income };
    }
    case 'income_remove':
      setMoney(addMoneyLog({ ...state, income: without(state.income, args.id) }, 'Einnahme gelöscht'));
      return {};
    case 'task_done': {
      const done = completeUserTask(state, args.id, { link: args.link, note: args.note });
      setMoney(done.buyLink ? relinkPages(done.state, done.project.id, done.buyLink) : done.state);
      setTimeout(() => moneyAgent?.tick(), 500);
      return { task: done.task.title, buyLink: done.buyLink || null };
    }
    case 'task_retry': {
      const project = state.projects.find((p) => p.tasks.some((t) => t.id === args.id));
      if (!project) throw new Error('Aufgabe nicht gefunden.');
      setMoney(updateTask(state, project.id, args.id, { status: 'offen', attempts: 0, result: '' }));
      setTimeout(() => moneyAgent?.tick(), 500);
      return {};
    }
    case 'task_skip': {
      const project = state.projects.find((p) => p.tasks.some((t) => t.id === args.id));
      if (!project) throw new Error('Aufgabe nicht gefunden.');
      setMoney(updateTask(state, project.id, args.id, { status: 'erledigt', result: 'Übersprungen' }));
      return {};
    }
    case 'project_activate': {
      if (!state.projects.some((p) => p.id === args.id)) throw new Error('Projekt nicht gefunden.');
      let next = { ...state, activeProjectId: args.id, projects: state.projects.map((p) => (p.id === args.id ? { ...p, status: 'aktiv' } : p.status === 'aktiv' ? { ...p, status: 'pausiert' } : p)) };
      next = updateProject(next, args.id, { status: 'aktiv' });
      setMoney(addMoneyLog(next, 'Projekt gewechselt'));
      return {};
    }
    case 'project_delete':
      setMoney(addMoneyLog({ ...state, activeProjectId: state.activeProjectId === args.id ? null : state.activeProjectId, projects: without(state.projects, args.id), products: state.products.filter((p) => p.projectId !== args.id), pages: state.pages.filter((p) => p.projectId !== args.id) }, 'Projekt gelöscht'));
      return {};
    case 'product_delete':
      setMoney({ ...state, products: without(state.products, args.id) });
      return {};
    case 'page_delete':
      setMoney({ ...state, pages: without(state.pages, args.id) });
      return {};
    default:
      throw new Error('Unbekannte Aktion.');
  }
}

let moneyAgent = null;

// --- WebSockets ------------------------------------------------------------

// Browser connections need a valid login cookie and must come from a page on
// this same host; the laptop connector authenticates with LAPTOP_TOKEN.
const browserWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
const twilioWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/twilio-stream') {
    // Twilio's media stream; the call token inside the first message is checked.
    twilioWss.handleUpgrade(request, socket, head, (ws) => handleTwilioStream(ws));
    return;
  }
  if (pathname === '/laptop') {
    if (!tokenMatches(request.headers.authorization, process.env.LAPTOP_TOKEN)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    laptopWss.handleUpgrade(request, socket, head, (ws) => laptopWss.emit('connection', ws));
    return;
  }
  let originHost = '';
  try {
    originHost = new URL(request.headers.origin).host;
  } catch {
    // missing or invalid origin
  }
  if (pathname !== '/ws' || originHost !== request.headers.host || !isAuthenticated(request)) {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return;
  }
  browserWss.handleUpgrade(request, socket, head, (ws) => browserWss.emit('connection', ws, request));
});

browserWss.on('connection', (browser, request) => {
  const origin = `${isSecure(request) ? 'https' : 'http'}://${request.headers.host}`;
  let agent = null;
  let agentOpen = false;
  let lastAudioAt = 0;
  let keepAlive = null;
  let queue = Promise.resolve();
  const confirmations = new Map();
  const cancelled = new Set();
  const timers = new Set();

  const session = {
    toBrowser(message) {
      if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(message));
    },
    askConfirmation(id, { title, detail, code }) {
      return new Promise((resolve) => {
        if (cancelled.has(id)) {
          resolve(false);
          return;
        }
        const timeout = setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS);
        function finish(approved) {
          clearTimeout(timeout);
          confirmations.delete(id);
          session.toBrowser({ type: 'confirm_close', id });
          resolve(approved);
        }
        confirmations.set(id, finish);
        session.toBrowser({ type: 'confirm', id, title, detail, code: Boolean(code), timeoutMs: CONFIRM_TIMEOUT_MS });
      });
    }
  };
  const toBrowser = session.toBrowser;
  // Tells the running conversation whether the laptop is reachable right now.
  session.updatePrompt = () => {
    if (!agentOpen || !settingsApplied) return;
    try {
      agent.sendUpdatePrompt({ type: 'UpdatePrompt', prompt: buildPrompt({ laptopConnected: laptopConnected(), memories: memoryStore.items }) });
    } catch (error) {
      console.warn(`Konnte Laptop-Status nicht ans Gespräch melden: ${error.message}`);
    }
  };
  sessions.add(session);
  toBrowser({ type: 'laptop', connected: laptopConnected() });

  const context = {
    schedule(ms, message) {
      // With Telegram the reminder also arrives when the app is closed by then.
      if (telegramConfigured()) {
        setTimeout(() => {
          const notice = voiceMessagesEnabled() ? sendVoiceNote(`Erinnerung: ${message}`, `⏰ Erinnerung: ${message}`) : sendTelegram(`⏰ Erinnerung: ${message}`);
          notice.catch((error) => console.warn(`Telegram-Erinnerung: ${error.message}`));
        }, ms);
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        toBrowser({ type: 'timer', message });
        if (agentOpen) agent.sendInjectAgentMessage({ type: 'InjectAgentMessage', message: `Erinnerung: ${message}` });
      }, ms);
      timers.add(timer);
    },
    showLink(url, title) {
      toBrowser({ type: 'link', url, title });
    },
    showGame({ title, type, emoji, url }) {
      toBrowser({ type: 'game', gameType: type, title, emoji, url });
    },
    showSite({ title, emoji, url }) {
      toBrowser({ type: 'site', title, emoji, url });
    },
    showShop({ query, links }) {
      toBrowser({ type: 'shop', query, links });
    },
    showListing({ title, text, links }) {
      toBrowser({ type: 'listing', title, text, links });
    },
    getShoppingList() {
      return shoppingStore.items;
    },
    setShoppingList(list, { show = false } = {}) {
      shoppingStore.set(list);
      if (show) shoppingStore.send(session, { show: true });
    },
    getCustomers() {
      return customerStore.items;
    },
    getMemories() {
      return memoryStore.items;
    },
    // Planner, notes, expenses and vocabulary lists (synced like the shopping list).
    getStore(name) {
      return syncedStores[name].items;
    },
    setStore(name, value, { show = false } = {}) {
      syncedStores[name].set(value);
      if (show) syncedStores[name].send(session, { show: true });
    },
    setMemories(list, { show = false } = {}) {
      memoryStore.set(list);
      if (show) memoryStore.send(session, { show: true });
    },
    getMoney() {
      return { state: money.state, waitingForDevice: Boolean(money.pending) };
    },
    moneyCommand(command) {
      return applyMoneyCommand(command);
    },
    showMoney() {
      toBrowser({ type: 'money_show' });
    },
    showGlobe(command) {
      toBrowser({ type: 'globe', ...command });
    },
    globeMemory: {},
    modelMemory: {},
    projectMemory: {},
    showProject(project) {
      toBrowser({ type: 'project', project });
    },
    projectLoading(text) {
      toBrowser({ type: 'project_loading', text });
    },
    showModel(scene) {
      toBrowser({ type: 'model3d', scene });
    },
    modelLoading(text) {
      toBrowser({ type: 'model3d_loading', text });
    },
    orderDraft: {},
    homeTown,
    showOrder(order) {
      toBrowser({ type: 'order', ...order, phoneLabel: order.phone ? spokenPhone(order.phone) : '' });
    },
    simulatePhoneCall(order) {
      simulateCall({
        order,
        userName: process.env.USER_NAME?.trim() || order.customerName,
        onEvent: callEventHandler({
          tell(text) {
            if (agentOpen) agent.sendInjectAgentMessage({ type: 'InjectAgentMessage', message: `Kurze Info zum Probeanruf: ${text}` });
          }
        })
      });
    },
    async startPhoneCall(order) {
      await startCall({
        order,
        origin,
        userName: process.env.USER_NAME?.trim() || order.customerName,
        onEvent: callEventHandler({
          tell(text) {
            if (agentOpen) agent.sendInjectAgentMessage({ type: 'InjectAgentMessage', message: `Kurze Info zum Telefonat: ${text}` });
          }
        })
      });
    },
    showWebcams({ title, cams, links }) {
      toBrowser({ type: 'webcams', title, cams, links });
    },
    showWeather(weather) {
      toBrowser({ type: 'weather', weather });
    },
    showNews(news) {
      toBrowser({ type: 'news', news });
    },
    showBauplan(info) {
      toBrowser({ type: 'bauplan', ...info });
    },
    showMarkets(markets) {
      toBrowser({ type: 'markets', markets });
    },
    showWeekly(numbers) {
      toBrowser({ type: 'weekly', numbers });
    },
    refreshPrompt() {
      session.updatePrompt?.();
    },
    setCustomers(list, { show = false } = {}) {
      customerStore.set(list);
      if (show) customerStore.send(session, { show: true });
    },
    origin,
    laptopConnected
  };

  async function runFunction(id, name, args) {
    const cloudTool = findCloudTool(name);
    if (cloudTool) {
      try {
        const request = cloudTool.confirm ? await cloudTool.confirm(args, context) : null;
        if (request && !(await session.askConfirmation(id, request))) {
          return { state: 'denied', result: { ok: false, abgelehnt: true, hinweis: 'Der Nutzer hat die Aktion nicht bestätigt. Sie wurde nicht ausgeführt.' } };
        }
        return { state: 'done', result: { ok: true, ergebnis: await cloudTool.run(args, context) } };
      } catch (error) {
        return { state: 'failed', result: { ok: false, fehler: error.message } };
      }
    }
    if (!findLaptopTool(name)) return { state: 'failed', result: { ok: false, fehler: `Unbekannte Funktion: ${name}` } };
    const reply = await callLaptop(id, name, args, session);
    if (reply.denied) return { state: 'denied', result: { ok: false, abgelehnt: true, hinweis: 'Der Nutzer hat die Aktion nicht bestätigt. Sie wurde nicht ausgeführt.' } };
    if (!reply.ok) return { state: 'failed', result: { ok: false, fehler: reply.error } };
    return { state: 'done', result: { ok: true, ergebnis: reply.result } };
  }

  async function handleFunctionCall({ id, name, arguments: rawArgs }) {
    let args = {};
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
      // leave args empty; the tool reports what is missing
    }
    const tool = findCloudTool(name) || findLaptopTool(name);
    const label = tool?.label(args) ?? name;
    toBrowser({ type: 'action', id, label, state: 'running', laptop: !findCloudTool(name) });
    const { state, result } = await runFunction(id, name, args);
    if (cancelled.has(id) || !agentOpen) {
      toBrowser({ type: 'action', id, label, state: 'cancelled' });
      return;
    }
    agent.sendFunctionCallResponse({ type: 'FunctionCallResponse', id, name, content: JSON.stringify(result) });
    toBrowser({ type: 'action', id, label, state, detail: result.fehler });
    console.log(`Funktion ${name}: ${state}${result.fehler ? ` – ${result.fehler}` : ''}`);
  }

  async function handleAgentMessage(message) {
    // Binary frames are Jarvis's voice (linear16, 24 kHz mono).
    if (message instanceof Blob) {
      const audio = Buffer.from(await message.arrayBuffer());
      if (browser.readyState === WebSocket.OPEN) browser.send(audio);
      return;
    }
    if (typeof message !== 'object' || !message) return;
    switch (message.type) {
      case 'Welcome':
        console.log(`Deepgram-Sitzung: ${message.request_id}`);
        break;
      case 'SettingsApplied':
        settingsApplied = true;
        toBrowser({ type: 'status', state: 'listening' });
        break;
      case 'ConversationText':
        toBrowser({ type: 'transcript', role: message.role, content: message.content });
        break;
      case 'UserStartedSpeaking':
        toBrowser({ type: 'user_speaking' });
        break;
      case 'AgentThinking':
        toBrowser({ type: 'status', state: 'thinking' });
        break;
      case 'AgentStartedSpeaking':
        toBrowser({ type: 'status', state: 'speaking' });
        break;
      case 'AgentAudioDone':
        toBrowser({ type: 'agent_audio_done' });
        break;
      case 'FunctionCallRequest':
        // Not awaited: a pending confirmation must not hold up the audio stream.
        for (const call of message.functions) {
          if (call.client_side) handleFunctionCall(call).catch((error) => console.error(`Funktion ${call.name}: ${error.message}`));
        }
        break;
      case 'FunctionCallCancelled':
        for (const call of message.functions) {
          cancelled.add(call.id);
          confirmations.get(call.id)?.(false);
        }
        break;
      case 'Error':
        console.error(`Deepgram-Fehler ${message.code}: ${message.description}`);
        if (!settingsApplied && startedWith.history.length && !retriedWithoutHistory) {
          console.warn('Starte ohne Gesprächsverlauf neu.');
          restartWithoutHistory();
          break;
        }
        toBrowser({ type: 'error', message: `${message.description} (${message.code})` });
        break;
      case 'Warning':
        console.warn(`Deepgram-Warnung ${message.code}: ${message.description}`);
        break;
      default:
        break;
    }
  }

  // `history` = recent turns of the previous conversation. If Deepgram rejects
  // the settings before applying them, Jarvis starts once more without it.
  let settingsApplied = false;
  let retriedWithoutHistory = false;
  let startedWith = { inputSampleRate: 48000, history: [] };

  async function startAgent(inputSampleRate, history = []) {
    if (agent) return;
    startedWith = { inputSampleRate, history };
    settingsApplied = false;
    const missing = missingConfig();
    if (missing.length) {
      toBrowser({ type: 'error', message: `Bei Render bzw. in der .env fehlt: ${missing.join(', ')}` });
      return;
    }
    toBrowser({ type: 'status', state: 'connecting' });
    const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY.trim() });
    // No automatic reconnect: a new conversation starts from the interface instead.
    const current = await client.agent.v1.connect({ reconnectAttempts: 0 });
    agent = current;
    current.on('open', () => {
      agentOpen = true;
      current.sendSettings(buildSettings({ inputSampleRate, functions: functionDefinitions, laptopConnected: laptopConnected(), memories: memoryStore.items, history }));
      keepAlive = setInterval(() => {
        if (agentOpen && Date.now() - lastAudioAt > 5000) agent.sendKeepAlive({ type: 'KeepAlive' });
      }, 5000);
    });
    // Handled in order so audio chunks are never reordered.
    current.on('message', (message) => {
      if (current !== agent) return;
      queue = queue.then(() => handleAgentMessage(message)).catch((error) => console.error(error));
    });
    current.on('close', (event) => {
      if (current !== agent) return;
      agentOpen = false;
      clearInterval(keepAlive);
      for (const finish of confirmations.values()) finish(false);
      toBrowser({ type: 'closed', code: event?.code, reason: event?.reason || '' });
    });
    current.on('error', (error) => {
      if (current !== agent) return;
      console.error('Verbindungsfehler zu Deepgram:', error.message);
      toBrowser({ type: 'error', message: `Verbindung zu Deepgram fehlgeschlagen: ${error.message}` });
    });
    current.connect();
  }

  function restartWithoutHistory() {
    retriedWithoutHistory = true;
    const old = agent;
    agent = null;
    agentOpen = false;
    clearInterval(keepAlive);
    old.close();
    startAgent(startedWith.inputSampleRate, []).catch((error) => toBrowser({ type: 'error', message: `Jarvis konnte nicht starten: ${error.message}` }));
  }

  browser.on('message', (data, isBinary) => {
    if (isBinary) {
      if (agentOpen) {
        agent.sendMedia(data);
        lastAudioAt = Date.now();
      }
      return;
    }
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message.type === 'start') {
      shoppingStore.adopt(message.shoppingList, message.shoppingListUpdatedAt);
      shoppingStore.send(session);
      customerStore.adopt(message.customers, message.customersUpdatedAt);
      customerStore.send(session);
      memoryStore.adopt(message.memories, message.memoriesUpdatedAt);
      memoryStore.send(session);
      for (const [name, store] of Object.entries(syncedStores)) {
        store.adopt(message.stores?.[name]?.items, message.stores?.[name]?.updatedAt);
        store.send(session);
      }
      const rate = Number(message.sampleRate);
      startAgent(rate >= 8000 && rate <= 96000 ? rate : 48000, sanitizeHistory(message.history)).catch((error) => {
        agent = null;
        toBrowser({ type: 'error', message: `Jarvis konnte nicht starten: ${error.message}` });
      });
    } else if (message.type === 'shopping_list_update') {
      shoppingStore.set(message.items);
    } else if (message.type === 'customers_update') {
      customerStore.set(message.items);
    } else if (message.type === 'memories_update') {
      memoryStore.set(message.items);
    } else if (/^(planner|notes|expenses|vocab)_update$/.test(message.type)) {
      syncedStores[message.type.replace('_update', '')].set(message.items);
    } else if (message.type === 'project_current') {
      context.projectMemory.last = sanitizeProject(message.project);
    } else if (message.type === 'model_current') {
      context.modelMemory.last = sanitizeScene(message.scene);
    } else if (message.type === 'globe_location') {
      // "Wo bin ich?": the device sent its position; name the place and tell the agent.
      reversePlace(message.lat, message.lon)
        .then((place) => {
          toBrowser({ type: 'globe', action: 'located', place });
          if (agentOpen) agent.sendInjectAgentMessage({ type: 'InjectAgentMessage', message: `Laut deinem Gerät bist du gerade hier: ${place.name}${place.country ? `, ${place.country}` : ''}.` });
        })
        .catch((error) => toBrowser({ type: 'globe', action: 'error', message: `Ort nicht erkannt: ${error.message}` }));
    } else if (message.type === 'globe_location_error') {
      if (agentOpen) agent.sendInjectAgentMessage({ type: 'InjectAgentMessage', message: `Ich konnte deinen Standort nicht abfragen: ${String(message.message || 'keine Erlaubnis').slice(0, 120)}. Erlaube den Standortzugriff für Jarvis im Browser.` });
    } else if (message.type === 'confirm_response') {
      confirmations.get(message.id)?.(message.approved === true);
    } else if (message.type === 'text' && agentOpen && String(message.text || '').trim()) {
      agent.sendInjectUserMessage({ type: 'InjectUserMessage', content: String(message.text).trim().slice(0, 2000) });
    }
  });

  browser.on('close', () => {
    sessions.delete(session);
    for (const finish of confirmations.values()) finish(false);
    for (const timer of timers) clearTimeout(timer);
    clearInterval(keepAlive);
    // Close the Deepgram session so it stops running (and billing).
    if (agent) agent.close();
    agentOpen = false;
  });
});

httpServer.listen(port, host, () => {
  console.log(`\n  J.A.R.V.I.S. läuft auf http://${host === '0.0.0.0' ? 'localhost' : host}:${port}\n`);
  const missing = missingConfig();
  if (missing.length) console.warn(`  Achtung – es fehlt: ${missing.join(', ')}`);
  if (!passwordConfigured()) console.warn('  Achtung – JARVIS_PASSWORD fehlt oder ist kürzer als 8 Zeichen; Anmelden ist nicht möglich.');
  if (!process.env.LAPTOP_TOKEN) console.warn('  Hinweis – LAPTOP_TOKEN fehlt; der Laptop kann sich nicht verbinden.');
  if (process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_CHAT_ID) {
    console.log('  Telegram: Schick deinem Bot /start, er antwortet mit deiner Chat-ID.');
    startSetupHelper();
  }
  if (telegramConfigured()) console.log('  Telegram: Hinweise bei wichtigen Mails und Erinnerungen sind aktiv.');
  startMailWatcher();
  if (telegramConfigured()) {
    loadPinnedBackup()
      .then((backup) => {
        if (backup?.planner) {
          plannerStore.adopt(backup.planner, backup.updatedAt);
          console.log('  Planer aus der Telegram-Sicherung geladen.');
        }
        if (backup?.money?.enabled && !money.updatedAt) {
          money.pending = backup.money;
          console.log('  Geld-Modus war an – er arbeitet weiter, sobald Jarvis einmal auf einem Gerät geöffnet wird.');
        }
      })
      .catch((error) => console.warn(`  Telegram-Sicherung konnte nicht geladen werden: ${error.message}`));
  }
  moneyAgent = startMoneyAgent({
    getState: () => (money.pending ? { ...money.state, enabled: false } : money.state),
    setState: setMoney,
    notify: (text) => (telegramConfigured() ? sendTelegram(text) : Promise.resolve()),
    sendFile: (content, filename, caption) => (telegramConfigured() ? sendTelegramDocument(content, filename, caption) : Promise.resolve()),
    getMemories: () => memoryStore.items.map((memory) => memory.text),
    origin: () => money.origin
  });
  startScheduler({
    getPlanner: () => plannerStore.items,
    setPlanner: (planner) => plannerStore.set(planner),
    deliver: deliverNotice,
    briefing: () => composeBriefing({
      planner: plannerStore.items,
      place: plannerStore.items.briefing.place || homeTown(),
      getWeather,
      unreadMail: gmailConfigured() ? () => listEmails({ unreadOnly: true, limit: 5 }) : null,
      shopping: shoppingStore.items,
      getNews
    })
  });
});
