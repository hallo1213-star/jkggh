// Sends what is due from the planner: the morning briefing, reminders and
// appointment reminders. Runs on the server, so it works with the app closed
// (as long as the free server is kept awake, see README).
import { cleanupPast, dueItems, localNow, markSent, upcomingAppointments } from './planner.js';

const CHECK_MS = 30_000;

function spokenTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return m ? `${h} Uhr ${m}` : `${h} Uhr`;
}

export function noticeFor(item) {
  if (item.kind === 'reminder') return { spoken: `Hey, kleine Erinnerung: ${item.text}.`, caption: `⏰ ${item.text}` };
  const left = item.minutesLeft;
  const hours = Math.round(left / 60);
  const inHours = hours === 1 ? 'in einer Stunde' : `in ${hours} Stunden`;
  const when = left <= 1 ? 'jetzt' : left < 60 ? `in ${left} Minuten` : left < 24 * 60 ? `${inHours}${item.time ? `, um ${spokenTime(item.time)}` : ''}` : `am ${item.date}`;
  return { spoken: `Denk dran: ${item.title}, ${when}.`, caption: `📅 ${item.title}${item.time ? ` – ${item.time} Uhr` : ''} (${when})` };
}

// The morning briefing, composed from live data. Every part is optional.
export async function composeBriefing({ planner, place, getWeather, unreadMail, shopping, getNews }) {
  const now = localNow();
  const day = new Intl.DateTimeFormat('de-DE', { timeZone: process.env.TZ || 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const parts = [`Guten Morgen! Heute ist ${day}.`];
  const lines = [`☀️ Guten Morgen – ${day}`];
  const [weather, mail, news] = await Promise.allSettled([
    place ? getWeather(place, { days: 1 }) : Promise.reject(new Error('kein Ort')),
    unreadMail ? unreadMail() : Promise.reject(new Error('kein Gmail')),
    getNews ? getNews({ limit: 3 }) : Promise.reject(new Error('keine Nachrichten'))
  ]);
  if (weather.status === 'fulfilled') {
    const w = weather.value;
    const today = w.tage?.[0];
    parts.push(`In ${w.ort.split(',')[0]} sind es gerade ${w.jetzt.temperatur} Grad, ${w.jetzt.wetter}${today ? `, heute bis ${today.max} Grad${today.regenWahrscheinlichkeit >= 50 ? ', nimm besser einen Schirm mit' : ''}` : ''}.`);
    lines.push(`${w.jetzt.symbol} ${w.jetzt.temperatur}° ${w.jetzt.wetter}${today ? ` · max ${today.max}° · 💧 ${today.regenWahrscheinlichkeit} %` : ''}`);
  }
  const appointments = upcomingAppointments(planner, { from: now, days: 0 });
  if (appointments.length) {
    parts.push(`Heute steht an: ${appointments.map((a) => `${a.title}${a.time ? ` um ${spokenTime(a.time)}` : ''}`).join(', ')}.`);
    lines.push(...appointments.map((a) => `📅 ${a.time ? `${a.time} ` : ''}${a.title}`));
  }
  if (mail.status === 'fulfilled' && mail.value.treffer > 0) {
    const senders = [...new Set(mail.value.emails.map((e) => e.von.replace(/\s*<[^>]*>/, '').trim()))].slice(0, 2);
    parts.push(`Du hast ${mail.value.treffer} ungelesene ${mail.value.treffer === 1 ? 'Mail' : 'Mails'}${senders.length ? `, unter anderem von ${senders.join(' und ')}` : ''}.`);
    lines.push(`✉️ ${mail.value.treffer} ungelesen`);
  }
  const open = (shopping || []).filter((item) => !item.done);
  if (open.length) {
    parts.push(`Auf deiner Einkaufsliste ${open.length === 1 ? 'steht eine Sache' : `stehen ${open.length} Sachen`}.`);
    lines.push(`🛒 ${open.map((item) => item.text).slice(0, 6).join(', ')}`);
  }
  if (news.status === 'fulfilled' && news.value.meldungen.length) {
    parts.push(`Und in den Nachrichten: ${news.value.meldungen.slice(0, 2).map((m) => m.titel).join('. ')}.`);
    lines.push(...news.value.meldungen.slice(0, 3).map((m) => `📰 ${m.titel}`));
  }
  parts.push('Hab einen guten Tag!');
  return { spoken: parts.join(' '), caption: lines.join('\n') };
}

export function startScheduler({ getPlanner, setPlanner, deliver, briefing, log = console }) {
  const fired = new Set();
  let lastCleanup = '';
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const now = localNow();
      if (lastCleanup !== now.date) {
        lastCleanup = now.date;
        fired.clear();
        const cleaned = cleanupPast(getPlanner(), now);
        if (JSON.stringify(cleaned) !== JSON.stringify(getPlanner())) setPlanner(cleaned);
      }
      for (const item of dueItems(getPlanner(), now, fired)) {
        fired.add(item.key);
        setPlanner(markSent(getPlanner(), item, now));
        try {
          const notice = item.kind === 'briefing' ? await briefing() : noticeFor(item);
          await deliver(notice);
          log.log(`Geplant gesendet: ${item.kind}`);
        } catch (error) {
          log.warn(`Geplante Nachricht (${item.kind}): ${error.message}`);
        }
      }
    } finally {
      running = false;
    }
  }
  const timer = setInterval(tick, CHECK_MS);
  tick();
  return { tick, stop: () => clearInterval(timer) };
}
