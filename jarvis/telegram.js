// Telegram notifications to the user's own chat. Setup: create a bot with
// @BotFather (TELEGRAM_BOT_TOKEN), send it /start, and it replies with the
// chat ID to store as TELEGRAM_CHAT_ID. Messages to anyone else are ignored.
const API = 'https://api.telegram.org';
const TIMEOUT_MS = 35_000;

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
const chatId = () => process.env.TELEGRAM_CHAT_ID?.trim() || '';

export function telegramConfigured() {
  return Boolean(token() && /^-?\d{3,20}$/.test(chatId()));
}

async function call(method, body, fetchImpl) {
  const response = await fetchImpl(`${API}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) {
    if (response.status === 401) throw new Error('Telegram lehnt den Bot-Schlüssel ab. Bitte TELEGRAM_BOT_TOKEN bei Render prüfen.');
    if ((response.status === 400 || response.status === 403) && /chat not found|blocked|deactivated|initiate conversation/i.test(data.description || '')) {
      throw new Error('Telegram kann dir nicht schreiben. Hast du dem Bot schon /start geschickt und stimmt TELEGRAM_CHAT_ID?');
    }
    throw new Error(`Telegram-Fehler: ${data.description || response.status}`);
  }
  return data.result;
}

export async function sendTelegram(text, { fetchImpl = fetch } = {}) {
  if (!telegramConfigured()) throw new Error('Telegram ist noch nicht eingerichtet. Bei Render müssen TELEGRAM_BOT_TOKEN und TELEGRAM_CHAT_ID eingetragen werden (siehe README).');
  await call('sendMessage', { chat_id: chatId(), text: String(text).slice(0, 4000), disable_web_page_preview: true }, fetchImpl);
  return { gesendet: true };
}

// Voice message (OGG/Opus) to the user's own chat, with the text as caption.
export async function sendTelegramVoice(audio, caption, { fetchImpl = fetch } = {}) {
  if (!telegramConfigured()) throw new Error('Telegram ist noch nicht eingerichtet. Bei Render müssen TELEGRAM_BOT_TOKEN und TELEGRAM_CHAT_ID eingetragen werden (siehe README).');
  const form = new FormData();
  form.append('chat_id', chatId());
  form.append('voice', new Blob([audio], { type: 'audio/ogg' }), 'jarvis.ogg');
  if (caption) form.append('caption', String(caption).slice(0, 1000));
  const response = await fetchImpl(`${API}/bot${token()}/sendVoice`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram-Sprachnachricht: ${data.description || response.status}`);
  return { gesendet: true, sprachnachricht: true };
}

// A file (e.g. a product Jarvis created) to the user's own chat – a durable copy
// that survives restarts of the free server.
export async function sendTelegramDocument(content, filename, caption, { fetchImpl = fetch } = {}) {
  if (!telegramConfigured()) throw new Error('Telegram ist noch nicht eingerichtet.');
  const form = new FormData();
  form.append('chat_id', chatId());
  form.append('document', new Blob([content], { type: 'application/octet-stream' }), filename);
  if (caption) form.append('caption', String(caption).slice(0, 1000));
  const response = await fetchImpl(`${API}/bot${token()}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram-Datei: ${data.description || response.status}`);
  return { gesendet: true };
}

// A pinned message in the user's own chat stores Jarvis' planner (reminders,
// appointments, briefing time), so they survive server restarts even when no
// device is open. Format: first line is a marker, then JSON.
const BACKUP_MARKER = '🗂 Jarvis-Daten – bitte nicht löschen';
let backupMessageId = null;

export async function loadPinnedBackup({ fetchImpl = fetch } = {}) {
  if (!telegramConfigured()) return null;
  const chat = await call('getChat', { chat_id: chatId() }, fetchImpl);
  const pinned = chat?.pinned_message;
  if (!pinned?.text?.startsWith(BACKUP_MARKER)) return null;
  backupMessageId = pinned.message_id;
  try {
    return JSON.parse(pinned.text.slice(BACKUP_MARKER.length).trim());
  } catch {
    return null;
  }
}

export async function savePinnedBackup(data, { fetchImpl = fetch } = {}) {
  if (!telegramConfigured()) return false;
  const textValue = `${BACKUP_MARKER}\n${JSON.stringify(data)}`;
  if (textValue.length > 4000) throw new Error('Zu viele Einträge für die Telegram-Sicherung.');
  if (backupMessageId) {
    try {
      await call('editMessageText', { chat_id: chatId(), message_id: backupMessageId, text: textValue }, fetchImpl);
      return true;
    } catch (error) {
      if (/not modified/i.test(error.message)) return true;
      backupMessageId = null; // deleted by the user: send a new one
    }
  }
  const message = await call('sendMessage', { chat_id: chatId(), text: textValue, disable_notification: true }, fetchImpl);
  backupMessageId = message.message_id;
  await call('pinChatMessage', { chat_id: chatId(), message_id: backupMessageId, disable_notification: true }, fetchImpl);
  return true;
}

// While only the bot token is set, answer /start with the chat ID so the user
// can copy it into Render. Once TELEGRAM_CHAT_ID is set this stops.
export function startSetupHelper({ fetchImpl = fetch, log = console } = {}) {
  let offset = 0;
  let stopped = false;
  async function loop() {
    while (!stopped && token() && !chatId()) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, fetchImpl);
        for (const update of updates) {
          offset = update.update_id + 1;
          const chat = update.message?.chat;
          if (chat?.type !== 'private') continue;
          await call('sendMessage', {
            chat_id: chat.id,
            text: `Hallo! Deine Chat-ID ist:\n\n${chat.id}\n\nTrag sie bei Render unter Environment als TELEGRAM_CHAT_ID ein und klick auf „Save Changes“. Danach schickt dir Jarvis hier wichtige Hinweise.`
          }, fetchImpl);
          log.log(`Telegram: Chat-ID ${chat.id} an den Nutzer geschickt.`);
        }
      } catch (error) {
        log.warn(`Telegram-Einrichtung: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 30_000));
      }
    }
  }
  loop();
  return () => {
    stopped = true;
  };
}
