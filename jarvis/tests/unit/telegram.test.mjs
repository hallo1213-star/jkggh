process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
const { importanceOf, formatNotice } = await import('../../mail-watch.js');
const { sendTelegram, telegramConfigured, startSetupHelper } = await import('../../telegram.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const mail = (betreff, von, extra = {}) => ({ betreff, von, vonAdresse: von, labels: [], ...extra });
assert(importanceOf(mail('Ihre Bestellung wurde versendet', 'Amazon.de <versand-bestaetigung@amazon.de>'), []) === 'Paket/Bestellung', 'parcel: Amazon shipping');
assert(importanceOf(mail('Ihr Paket kommt heute', 'DHL <noreply@dhl.de>'), []) === 'Paket/Bestellung', 'parcel: DHL');
assert(importanceOf(mail('Black Friday Sale: 50% Rabatt auf Versand!', 'Shop <news@shop.de>'), []) === null, 'newsletter with "Versand" ignored');
assert(importanceOf(mail('Treffen morgen', 'Chef <chef@firma.de>', { labels: ['\\Important', '\\Inbox'] }), []) === 'von Gmail als wichtig markiert', 'Gmail important label');
assert(importanceOf(mail('Kuchen?', 'Oma Inge <oma@example.de>'), ['oma@example.de']) === 'wichtiger Absender', 'VIP sender by address');
assert(importanceOf(mail('Hallo', 'Oma Inge <oma@example.de>'), ['inge']) === 'wichtiger Absender', 'VIP sender by name part');
assert(importanceOf(mail('Wöchentlicher Newsletter', 'Blog <a@b.de>'), []) === null, 'normal mail ignored');
assert(formatNotice(mail('Ihr Paket kommt heute', 'DHL'), 'Paket/Bestellung') === '📦 Ihr Paket kommt heute\nVon: DHL', 'notice text');
assert(!telegramConfigured(), 'not configured without chat id');
try { await sendTelegram('x'); assert(false, 'needs chat id'); } catch (e) { assert(/nicht eingerichtet/.test(e.message), 'clear message when chat id missing'); }
// setup helper answers /start with the chat id
const sent = [];
let polls = 0;
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (url.endsWith('/getUpdates')) {
    polls += 1;
    if (polls === 1) return { ok: true, status: 200, json: async () => ({ ok: true, result: [{ update_id: 7, message: { chat: { id: 987654321, type: 'private' }, text: '/start' } }] }) };
    process.env.TELEGRAM_CHAT_ID = '987654321'; // user saved it → helper stops
    return { ok: true, status: 200, json: async () => ({ ok: true, result: [] }) };
  }
  sent.push({ url, body });
  return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
};
startSetupHelper({ fetchImpl: fakeFetch, log: { log() {}, warn() {} } });
await new Promise((r) => setTimeout(r, 100));
assert(sent[0]?.url === 'https://api.telegram.org/bot123:ABC/sendMessage' && sent[0].body.chat_id === 987654321 && sent[0].body.text.includes('987654321'), 'setup: bot replies with the chat id');
assert(polls === 2, 'setup helper stops once TELEGRAM_CHAT_ID is set');
assert(telegramConfigured(), 'configured with token + chat id');
await sendTelegram('📦 Test', { fetchImpl: fakeFetch });
assert(sent[1].body.chat_id === '987654321' && sent[1].body.text === '📦 Test', 'send goes only to the own chat');
const denied = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) });
try { await sendTelegram('x', { fetchImpl: denied }); assert(false, '401'); } catch (e) { assert(/Bot-Schlüssel/.test(e.message), 'wrong token → clear message'); }
