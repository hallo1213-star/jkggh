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
import { buildSettings, missingConfig } from './agent-config.js';
import { attemptLogin, clearedCookie, isAuthenticated, passwordConfigured, sessionCookie, tokenMatches } from './auth.js';
import { cloudTools, findCloudTool } from './cloud-tools.js';
import { addItems, sanitizeList } from './shopping.js';
import { sanitizeCustomers } from './customers.js';
import { findTool as findLaptopTool, functionDefinitions as laptopFunctions } from './laptop/tools.js';

if (!process.env.TZ) process.env.TZ = 'Europe/Berlin';
const root = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // no .env (on Render the values come from the dashboard)
}

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
function createSharedStore(type, sanitize, mergeUnstamped) {
  const store = { items: [], updatedAt: 0 };
  return {
    get items() {
      return store.items;
    },
    set(items) {
      store.items = sanitize(items);
      store.updatedAt = Date.now();
      for (const session of sessions) this.send(session);
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
      } else if (!deviceTime && deviceItems.length && mergeUnstamped) {
        // Saved by an older app version without a timestamp: merge instead of losing items.
        this.set(mergeUnstamped(store.items, deviceItems));
      }
    }
  };
}

const shoppingStore = createSharedStore('shopping_list', sanitizeList, (current, device) => addItems(current, device.map((item) => item.text)).list);
const customerStore = createSharedStore('customers', sanitizeCustomers, null);

function laptopConnected() {
  return laptop.ws?.readyState === WebSocket.OPEN;
}

function broadcastLaptopStatus() {
  for (const session of sessions) session.toBrowser({ type: 'laptop', connected: laptopConnected() });
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

// --- WebSockets ------------------------------------------------------------

// Browser connections need a valid login cookie and must come from a page on
// this same host; the laptop connector authenticates with LAPTOP_TOKEN.
const browserWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, 'http://localhost');
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
  sessions.add(session);
  toBrowser({ type: 'laptop', connected: laptopConnected() });

  const context = {
    schedule(ms, message) {
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
        for (const call of message.functions) if (call.client_side) handleFunctionCall(call);
        break;
      case 'FunctionCallCancelled':
        for (const call of message.functions) {
          cancelled.add(call.id);
          confirmations.get(call.id)?.(false);
        }
        break;
      case 'Error':
        console.error(`Deepgram-Fehler ${message.code}: ${message.description}`);
        toBrowser({ type: 'error', message: `${message.description} (${message.code})` });
        break;
      case 'Warning':
        console.warn(`Deepgram-Warnung ${message.code}: ${message.description}`);
        break;
      default:
        break;
    }
  }

  async function startAgent(inputSampleRate) {
    if (agent) return;
    const missing = missingConfig();
    if (missing.length) {
      toBrowser({ type: 'error', message: `Bei Render bzw. in der .env fehlt: ${missing.join(', ')}` });
      return;
    }
    toBrowser({ type: 'status', state: 'connecting' });
    const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY.trim() });
    // No automatic reconnect: a new conversation starts from the interface instead.
    agent = await client.agent.v1.connect({ reconnectAttempts: 0 });
    agent.on('open', () => {
      agentOpen = true;
      agent.sendSettings(buildSettings({ inputSampleRate, functions: functionDefinitions, laptopConnected: laptopConnected() }));
      keepAlive = setInterval(() => {
        if (agentOpen && Date.now() - lastAudioAt > 5000) agent.sendKeepAlive({ type: 'KeepAlive' });
      }, 5000);
    });
    // Handled in order so audio chunks are never reordered.
    agent.on('message', (message) => {
      queue = queue.then(() => handleAgentMessage(message)).catch((error) => console.error(error));
    });
    agent.on('close', (event) => {
      agentOpen = false;
      clearInterval(keepAlive);
      for (const finish of confirmations.values()) finish(false);
      toBrowser({ type: 'closed', code: event?.code, reason: event?.reason || '' });
    });
    agent.on('error', (error) => {
      console.error('Verbindungsfehler zu Deepgram:', error.message);
      toBrowser({ type: 'error', message: `Verbindung zu Deepgram fehlgeschlagen: ${error.message}` });
    });
    agent.connect();
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
      const rate = Number(message.sampleRate);
      startAgent(rate >= 8000 && rate <= 96000 ? rate : 48000).catch((error) => {
        agent = null;
        toBrowser({ type: 'error', message: `Jarvis konnte nicht starten: ${error.message}` });
      });
    } else if (message.type === 'shopping_list_update') {
      shoppingStore.set(message.items);
    } else if (message.type === 'customers_update') {
      customerStore.set(message.items);
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
});
