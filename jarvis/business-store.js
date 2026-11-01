// Persistent storage for the Autonomous Business system – survives restarts of
// the (free) Render server. No extra packages. Backends, best first:
//  1. Supabase (real Postgres, free tier) over its REST API, if SUPABASE_URL and
//     SUPABASE_SERVICE_KEY are set. Table SQL: see README.
//  2. Telegram: the state is sent as a JSON file to the user's own chat; the
//     file's id is kept in the existing pinned "Jarvis-Daten" backup message.
//  3. A local file (DATA_DIR, default ./data) – always written as a fast cache;
//     on its own it is lost when Render redeploys (no persistent disk).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const TIMEOUT_MS = 20_000;
const dataDir = () => process.env.DATA_DIR?.trim() || join(process.cwd(), 'data');

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_KEY?.trim());
}
function telegramReady() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export function storeBackend() {
  if (supabaseConfigured()) return 'supabase';
  if (telegramReady()) return 'telegram';
  return 'datei';
}

export const BACKEND_LABEL = {
  supabase: 'Supabase-Datenbank (dauerhaft)',
  telegram: 'Telegram-Speicher (dauerhaft, kostenlos)',
  datei: 'Nur lokale Datei – geht bei einem Render-Neustart verloren'
};

// --- local file ----------------------------------------------------------------
async function fileLoad(key) {
  try {
    return JSON.parse(await readFile(join(dataDir(), `${key}.json`), 'utf8'));
  } catch {
    return null;
  }
}
async function fileSave(key, value) {
  await mkdir(dataDir(), { recursive: true });
  const target = join(dataDir(), `${key}.json`);
  await writeFile(`${target}.tmp`, JSON.stringify(value));
  await rename(`${target}.tmp`, target); // atomic replace
}

// --- Supabase (PostgREST) ------------------------------------------------------------
function supabase(path, init = {}, fetchImpl = fetch) {
  const base = process.env.SUPABASE_URL.trim().replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY.trim();
  return fetchImpl(`${base}/rest/v1/${path}`, { ...init, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
}
async function supabaseLoad(key, fetchImpl) {
  const response = await supabase(`jarvis_store?key=eq.${encodeURIComponent(key)}&select=value`, {}, fetchImpl);
  if (!response.ok) throw new Error(`Supabase: Status ${response.status} – gibt es die Tabelle jarvis_store? (SQL im README)`);
  const rows = await response.json();
  return rows?.[0]?.value ?? null;
}
async function supabaseSave(key, value, fetchImpl) {
  const response = await supabase('jarvis_store?on_conflict=key', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) }, fetchImpl);
  if (!response.ok) throw new Error(`Supabase: Speichern fehlgeschlagen (Status ${response.status})`);
}

// --- Telegram document -----------------------------------------------------------------
const tgApi = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${method}`;
async function telegramLoad(pointer, fetchImpl) {
  if (!pointer?.fileId) return null;
  const info = await (await fetchImpl(tgApi('getFile'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: pointer.fileId }), signal: AbortSignal.timeout(TIMEOUT_MS) })).json();
  if (!info.ok) throw new Error(`Telegram-Speicher: ${info.description || 'Datei nicht gefunden'}`);
  const file = await fetchImpl(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${info.result.file_path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!file.ok) throw new Error(`Telegram-Speicher: Download Status ${file.status}`);
  return JSON.parse(await file.text());
}
async function telegramSave(key, value, previous, fetchImpl) {
  const form = new FormData();
  form.append('chat_id', process.env.TELEGRAM_CHAT_ID.trim());
  form.append('disable_notification', 'true');
  form.append('caption', '🗄 Jarvis Business – Speicherstand (bitte nicht löschen)');
  form.append('document', new Blob([JSON.stringify(value)], { type: 'application/json' }), `${key}.json`);
  const data = await (await fetchImpl(tgApi('sendDocument'), { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) })).json();
  if (!data.ok) throw new Error(`Telegram-Speicher: ${data.description || 'Senden fehlgeschlagen'}`);
  // Keep the chat tidy: remove the previous save (works for messages < 48 h).
  if (previous?.messageId) {
    fetchImpl(tgApi('deleteMessage'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID.trim(), message_id: previous.messageId }), signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => {});
  }
  return { fileId: data.result.document.file_id, messageId: data.result.message_id, at: Date.now() };
}

// A store for one key with debounced writes. `getPointer`/`setPointer` keep
// the Telegram file id in the pinned backup (handled by server.js).
export function createStore(key, { getPointer = () => null, setPointer = () => {}, fetchImpl = fetch, log = console, remoteEveryMs = 60_000 } = {}) {
  let pending = null;
  let timer = null;
  let lastRemote = 0;
  let remoteTimer = null;
  let lastError = null;
  let lastSavedAt = 0;
  const backend = () => storeBackend();

  async function load() {
    const local = await fileLoad(key);
    let remote = null;
    try {
      if (backend() === 'supabase') remote = await supabaseLoad(key, fetchImpl);
      else if (backend() === 'telegram') remote = await telegramLoad(getPointer(), fetchImpl);
    } catch (error) {
      lastError = error.message;
      log.warn(`Business-Speicher laden: ${error.message}`);
    }
    // The newest copy wins.
    const pick = [local, remote].filter(Boolean).sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0))[0] || null;
    return pick;
  }

  async function writeRemote(value) {
    try {
      if (backend() === 'supabase') await supabaseSave(key, value, fetchImpl);
      else if (backend() === 'telegram') setPointer(await telegramSave(key, value, getPointer(), fetchImpl));
      lastRemote = Date.now();
      lastError = null;
    } catch (error) {
      lastError = error.message;
      log.warn(`Business-Speicher: ${error.message}`);
    }
  }

  async function flush({ remote = true } = {}) {
    clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const value = { ...pending, savedAt: Date.now() };
    pending = null;
    await fileSave(key, value).catch((error) => { lastError = error.message; });
    lastSavedAt = value.savedAt;
    if (!remote || backend() === 'datei') return;
    // Supabase can take every save; Telegram saves are spaced out.
    const wait = backend() === 'telegram' ? Math.max(0, remoteEveryMs - (Date.now() - lastRemote)) : 0;
    clearTimeout(remoteTimer);
    if (wait === 0) await writeRemote(value);
    else remoteTimer = setTimeout(() => writeRemote(value), wait);
  }

  return {
    load,
    save(value, { now = false } = {}) {
      pending = value;
      if (now) return flush();
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(() => {}), 1500);
      return Promise.resolve();
    },
    flush,
    status: () => ({ backend: backend(), label: BACKEND_LABEL[backend()], lastError, lastSavedAt, lastRemote })
  };
}
