// Laptop connector: keeps an outgoing connection to Jarvis in the cloud and
// runs computer-control functions on this laptop when Jarvis asks for them.
// No router or firewall changes are needed because the laptop dials out.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { findTool } from './tools.js';

const root = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // no .env yet; checked below
}

const jarvisUrl = process.env.JARVIS_URL?.trim();
const token = process.env.LAPTOP_TOKEN?.trim();
if (!jarvisUrl || !token) {
  console.error('\n  In laptop/.env fehlen JARVIS_URL und/oder LAPTOP_TOKEN (siehe README).\n');
  process.exit(1);
}

const CONFIRM_TIMEOUT_MS = 100_000;
const url = new URL('/laptop', jarvisUrl);
url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
const confirmations = new Map();
let retryDelay = 2000;

function connect() {
  const ws = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
  const send = (message) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };

  async function handleCall({ id, name, args }) {
    const tool = findTool(name);
    try {
      if (!tool) throw new Error(`Unbekannte Laptop-Funktion: ${name}`);
      console.log(`  → ${tool.label(args ?? {})}`);
      const request = tool.confirm ? await tool.confirm(args ?? {}) : null;
      if (request) {
        send({ type: 'confirm_request', id, ...request });
        const approved = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), CONFIRM_TIMEOUT_MS);
          confirmations.set(id, (value) => {
            clearTimeout(timeout);
            resolve(value);
          });
        });
        confirmations.delete(id);
        if (!approved) {
          send({ type: 'result', id, ok: false, denied: true });
          return;
        }
      }
      send({ type: 'result', id, ok: true, result: await tool.run(args ?? {}) });
    } catch (error) {
      send({ type: 'result', id, ok: false, error: error.message });
    }
  }

  ws.on('open', () => {
    retryDelay = 2000;
    console.log(`  Verbunden mit ${jarvisUrl} – Jarvis kann jetzt diesen Laptop steuern.`);
  });

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message.type === 'call') handleCall(message);
    else if (message.type === 'confirm_response') confirmations.get(message.id)?.(message.approved === true);
  });

  ws.on('unexpected-response', (request, response) => {
    if (response.statusCode === 401) console.error('  Abgelehnt: LAPTOP_TOKEN stimmt nicht mit dem Wert bei Render überein.');
    else console.error(`  Jarvis antwortet mit Status ${response.statusCode} (wacht der Server gerade auf?).`);
  });

  ws.on('error', (error) => {
    if (!/Unexpected server response/.test(error.message)) console.error(`  Verbindungsfehler: ${error.message}`);
  });

  ws.on('close', () => {
    for (const finish of confirmations.values()) finish(false);
    console.log(`  Getrennt. Neuer Versuch in ${Math.round(retryDelay / 1000)} s …`);
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  });
}

console.log('\n  J.A.R.V.I.S. Laptop-Verbinder – zum Beenden Strg+C\n');
connect();
