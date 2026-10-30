// Jarvis local server: serves the interface on localhost, bridges the browser
// microphone to Deepgram Voice Agent and runs computer-control functions.
// The API keys stay in this process and never reach the browser.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DeepgramClient } from '@deepgram/sdk';
import { buildSettings, missingConfig } from './agent-config.js';
import { findTool, functionDefinitions } from './tools.js';

const root = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // no .env yet; missingConfig() reports what is needed
}

const host = '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const publicDir = join(root, 'public');
const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const CONFIRM_TIMEOUT_MS = 90_000;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

const httpServer = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = normalize(join(publicDir, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
  const type = contentTypes[extname(file)];
  if (!file.startsWith(publicDir + sep) || !type) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Nicht gefunden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Nicht gefunden');
  }
});

// Only pages served by this server may connect. Without this check any website
// open in the browser could talk to ws://localhost and approve actions.
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname !== '/ws' || !allowedOrigins.has(request.headers.origin)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', (browser) => {
  let agent = null;
  let agentOpen = false;
  let lastAudioAt = 0;
  let keepAlive = null;
  let queue = Promise.resolve();
  const confirmations = new Map();
  const cancelled = new Set();
  const timers = new Set();

  const toBrowser = (message) => {
    if (browser.readyState === browser.OPEN) browser.send(JSON.stringify(message));
  };

  const context = {
    schedule(ms, message) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        toBrowser({ type: 'timer', message });
        if (agentOpen) agent.sendInjectAgentMessage({ type: 'InjectAgentMessage', message: `Erinnerung: ${message}` });
      }, ms);
      timers.add(timer);
    }
  };

  function askConfirmation(id, { title, detail, code }) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS);
      function finish(approved) {
        clearTimeout(timeout);
        confirmations.delete(id);
        toBrowser({ type: 'confirm_close', id });
        resolve(approved);
      }
      confirmations.set(id, finish);
      toBrowser({ type: 'confirm', id, title, detail, code: Boolean(code), timeoutMs: CONFIRM_TIMEOUT_MS });
    });
  }

  async function handleFunctionCall({ id, name, arguments: rawArgs }) {
    const tool = findTool(name);
    let args = {};
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
      // leave args empty; the tool reports what is missing
    }
    const label = tool?.label(args) ?? name;
    toBrowser({ type: 'action', id, label, state: 'running' });
    let result;
    let state = 'done';
    try {
      if (!tool) throw new Error(`Unbekannte Funktion: ${name}`);
      const request = tool.confirm ? await tool.confirm(args) : null;
      if (request && !(await askConfirmation(id, request))) {
        state = 'denied';
        result = { ok: false, abgelehnt: true, hinweis: 'Der Nutzer hat die Aktion nicht bestätigt. Sie wurde nicht ausgeführt.' };
      } else {
        result = { ok: true, ergebnis: await tool.run(args, context) };
      }
    } catch (error) {
      state = 'failed';
      result = { ok: false, fehler: error.message };
    }
    if (cancelled.has(id) || !agentOpen) {
      toBrowser({ type: 'action', id, label, state: 'cancelled' });
      return;
    }
    agent.sendFunctionCallResponse({ type: 'FunctionCallResponse', id, name, content: JSON.stringify(result) });
    toBrowser({ type: 'action', id, label, state, detail: result.fehler });
  }

  async function handleAgentMessage(message) {
    // Binary frames are Jarvis's voice (linear16, 24 kHz mono).
    if (message instanceof Blob) {
      const audio = Buffer.from(await message.arrayBuffer());
      if (browser.readyState === browser.OPEN) browser.send(audio);
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
      toBrowser({ type: 'error', message: `In der Datei .env fehlt: ${missing.join(', ')}` });
      return;
    }
    toBrowser({ type: 'status', state: 'connecting' });
    const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY.trim() });
    // No automatic reconnect: a new conversation starts from the interface instead.
    agent = await client.agent.v1.connect({ reconnectAttempts: 0 });
    agent.on('open', () => {
      agentOpen = true;
      agent.sendSettings(buildSettings({ inputSampleRate, functions: functionDefinitions }));
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
      const rate = Number(message.sampleRate);
      startAgent(rate >= 8000 && rate <= 96000 ? rate : 48000).catch((error) => {
        agent = null;
        toBrowser({ type: 'error', message: `Jarvis konnte nicht starten: ${error.message}` });
      });
    } else if (message.type === 'confirm_response') {
      confirmations.get(message.id)?.(message.approved === true);
    } else if (message.type === 'text' && agentOpen && String(message.text || '').trim()) {
      agent.sendInjectUserMessage({ type: 'InjectUserMessage', content: String(message.text).trim().slice(0, 2000) });
    }
  });

  browser.on('close', () => {
    for (const finish of confirmations.values()) finish(false);
    for (const timer of timers) clearTimeout(timer);
    clearInterval(keepAlive);
    // Close the Deepgram session so it stops running (and billing).
    if (agent) agent.close();
    agentOpen = false;
  });
});

httpServer.listen(port, host, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  J.A.R.V.I.S. läuft auf ${url}\n  Zum Beenden: Strg+C\n`);
  const missing = missingConfig();
  if (missing.length) console.warn(`  Achtung – in der .env fehlt: ${missing.join(', ')}\n`);
  if (process.platform === 'win32' && process.env.OPEN_BROWSER !== 'false') {
    execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, () => {});
  }
});
