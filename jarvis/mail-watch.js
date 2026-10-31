// Watches the Gmail inbox and sends a Telegram message for important new
// mail only: parcels and orders, mail Gmail marks as important, and senders
// the user listed in TELEGRAM_WICHTIG (e.g. "oma@example.de, Chef").
import { fetchInboxSince, gmailConfigured } from './gmail.js';
import { sendTelegram, telegramConfigured } from './telegram.js';

const PARCEL = /versand|versendet|verschickt|zugestellt|zustellung|unterwegs|lieferung|geliefert|paket|sendung|bestellung|bestellbest|abholbereit|packstation|dhl|hermes|\bdpd\b|\bups\b|\bgls\b/i;
const NEWSLETTER = /newsletter|angebot der woche|% rabatt|gutschein|deals?\b|sale\b|werbung/i;

function vipList() {
  return String(process.env.TELEGRAM_WICHTIG || '').split(/[,;]/).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

// Returns a short reason why the mail matters, or null.
export function importanceOf(email, vips = vipList()) {
  const from = `${email.von} ${email.vonAdresse}`.toLowerCase();
  if (vips.some((vip) => from.includes(vip))) return 'wichtiger Absender';
  const text = `${email.betreff} ${email.von}`;
  if (PARCEL.test(text) && !NEWSLETTER.test(email.betreff)) return 'Paket/Bestellung';
  if (email.labels?.some((label) => /^\\?important$/i.test(label))) return 'von Gmail als wichtig markiert';
  return null;
}

export function formatNotice(email, reason) {
  const icon = reason === 'Paket/Bestellung' ? '📦' : reason === 'wichtiger Absender' ? '⭐' : '✉️';
  return `${icon} ${email.betreff}\nVon: ${email.von}`;
}

export function startMailWatcher({ intervalMinutes = Number(process.env.TELEGRAM_MAIL_CHECK_MINUTES) || 5, log = console } = {}) {
  let lastUid = null;
  let running = false;
  async function check() {
    if (running || !gmailConfigured() || !telegramConfigured()) return;
    running = true;
    try {
      const { maxUid, emails } = await fetchInboxSince(lastUid);
      for (const email of emails) {
        const reason = importanceOf(email);
        if (reason && email.ungelesen) {
          await sendTelegram(formatNotice(email, reason));
          log.log(`Telegram-Hinweis gesendet (${reason}).`);
        }
      }
      lastUid = maxUid;
    } catch (error) {
      log.warn(`Mail-Prüfung: ${error.message}`);
    } finally {
      running = false;
    }
  }
  check();
  const timer = setInterval(check, Math.max(2, intervalMinutes) * 60_000);
  return { check, stop: () => clearInterval(timer) };
}
