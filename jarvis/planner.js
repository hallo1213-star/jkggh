// Appointments, recurring reminders and the morning briefing time. Times are
// German local time (Europe/Berlin). The server checks every 30 seconds what
// is due; a fired item is remembered per day so nothing is sent twice.
import { randomUUID } from 'node:crypto';

const TZ = () => process.env.TZ || 'Europe/Berlin';
export const REPEATS = ['einmal', 'taeglich', 'werktags', 'woechentlich'];
export const WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX = { reminders: 40, appointments: 60 };

const newId = () => randomUUID().replace(/-/g, '').slice(0, 8);
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeTime(value) {
  const match = TIME.exec(String(value ?? '').trim().replace(/\s*uhr$/i, '').replace('.', ':'));
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

export function normalizeWeekday(value) {
  const wanted = String(value ?? '').trim().toLowerCase().slice(0, 2);
  const index = WEEKDAYS.findIndex((day) => day.startsWith(wanted));
  return wanted && index >= 0 ? WEEKDAYS[index] : null;
}

// Date, time and weekday (montag … sonntag) in German local time.
export function localNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' })
    .formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday.toLowerCase() };
}

function minutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function cleanReminder(item) {
  const time = normalizeTime(item?.time);
  const repeat = REPEATS.includes(item?.repeat) ? item.repeat : 'einmal';
  const reminder = { id: typeof item?.id === 'string' && /^[a-z0-9]{6,12}$/.test(item.id) ? item.id : newId(), text: text(item?.text, 160), time, repeat };
  if (DATE.test(item?.lastSent)) reminder.lastSent = item.lastSent;
  if (repeat === 'woechentlich') reminder.weekday = normalizeWeekday(item?.weekday);
  if (repeat === 'einmal') reminder.date = DATE.test(item?.date) ? item.date : null;
  if (!reminder.text || !time || (repeat === 'woechentlich' && !reminder.weekday) || (repeat === 'einmal' && !reminder.date)) return null;
  return reminder;
}

function cleanAppointment(item) {
  const appointment = {
    id: typeof item?.id === 'string' && /^[a-z0-9]{6,12}$/.test(item.id) ? item.id : newId(),
    title: text(item?.title, 120),
    date: DATE.test(item?.date) ? item.date : null,
    time: normalizeTime(item?.time),
    remindMinutes: Math.min(Math.max(Math.round(Number(item?.remindMinutes ?? 60)), 0), 7 * 24 * 60),
    notified: item?.notified === true
  };
  return appointment.title && appointment.date ? appointment : null;
}

export function sanitizePlanner(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const briefing = input.briefing && typeof input.briefing === 'object' ? input.briefing : {};
  return {
    briefing: { time: normalizeTime(briefing.time), place: text(briefing.place, 80), ...(DATE.test(briefing.lastSent) ? { lastSent: briefing.lastSent } : {}) },
    reminders: (Array.isArray(input.reminders) ? input.reminders : []).map(cleanReminder).filter(Boolean).slice(0, MAX.reminders),
    appointments: (Array.isArray(input.appointments) ? input.appointments : []).map(cleanAppointment).filter(Boolean)
      .sort((a, b) => `${a.date} ${a.time || '00:00'}`.localeCompare(`${b.date} ${b.time || '00:00'}`)).slice(0, MAX.appointments)
  };
}

export function addReminder(planner, fields) {
  const reminder = cleanReminder({ ...fields, id: undefined });
  if (!reminder) {
    if (!normalizeTime(fields.time)) throw new Error('Um wie viel Uhr soll ich erinnern? Bitte eine Uhrzeit wie 18:30 angeben.');
    if (fields.repeat === 'woechentlich') throw new Error('An welchem Wochentag?');
    if ((fields.repeat || 'einmal') === 'einmal') throw new Error('An welchem Datum? (Format JJJJ-MM-TT)');
    throw new Error('Woran soll ich erinnern?');
  }
  const next = sanitizePlanner(planner);
  const same = next.reminders.find((item) => item.text.toLowerCase() === reminder.text.toLowerCase() && item.time === reminder.time && item.repeat === reminder.repeat && item.weekday === reminder.weekday && item.date === reminder.date);
  if (same) return { planner: next, reminder: same, existing: true };
  if (next.reminders.length >= MAX.reminders) throw new Error('Es sind schon 40 Erinnerungen gespeichert. Lösch zuerst eine.');
  return { planner: { ...next, reminders: [...next.reminders, reminder] }, reminder };
}

export function addAppointment(planner, fields) {
  const appointment = cleanAppointment({ ...fields, id: undefined });
  if (!appointment) throw new Error('Für einen Termin brauche ich einen Titel und ein Datum (JJJJ-MM-TT).');
  const next = sanitizePlanner(planner);
  const same = next.appointments.find((item) => item.title.toLowerCase() === appointment.title.toLowerCase() && item.date === appointment.date && item.time === appointment.time);
  if (same) return { planner: next, appointment: same, existing: true };
  return { planner: sanitizePlanner({ ...next, appointments: [...next.appointments, appointment] }), appointment };
}

// Removes the item whose text/title matches exactly or as the only partial match.
export function removeEntry(planner, kind, query) {
  const next = sanitizePlanner(planner);
  const list = next[kind];
  const field = kind === 'reminders' ? 'text' : 'title';
  const wanted = String(query ?? '').trim().toLowerCase();
  if (!wanted) throw new Error('Welchen Eintrag soll ich löschen?');
  let matches = list.filter((item) => item.id === query || item[field].toLowerCase() === wanted);
  if (!matches.length) matches = list.filter((item) => item[field].toLowerCase().includes(wanted));
  if (matches.length > 1) throw new Error(`Das passt auf mehrere Einträge: ${matches.map((item) => item[field]).join(' / ')}. Welcher genau?`);
  if (!matches.length) return { planner: next, removed: null };
  return { planner: { ...next, [kind]: list.filter((item) => item.id !== matches[0].id) }, removed: matches[0][field] };
}

export function upcomingAppointments(planner, { from = localNow(), days = 14 } = {}) {
  const until = shiftDate(from.date, days);
  return sanitizePlanner(planner).appointments.filter((item) => item.date >= from.date && item.date <= until);
}

// Everything due at `now` that has not been sent yet. Briefing and reminders
// fire within a 15-minute window, so a short server hiccup does not lose them;
// an appointment entered after its reminder time is announced right away.
// "Sent" is stored in the planner itself (lastSent / notified), so nothing is
// sent twice even after a restart.
export function dueItems(planner, now, fired) {
  const p = sanitizePlanner(planner);
  const nowMin = minutes(now.time);
  const inWindow = (time) => nowMin >= minutes(time) && nowMin - minutes(time) < 15;
  const due = [];
  const push = (key, item) => {
    if (!fired.has(key)) due.push({ key, ...item });
  };
  if (p.briefing.time && inWindow(p.briefing.time) && p.briefing.lastSent !== now.date) push(`briefing:${now.date}`, { kind: 'briefing' });
  for (const reminder of p.reminders) {
    if (!inWindow(reminder.time) || reminder.lastSent === now.date) continue;
    const today = reminder.repeat === 'taeglich'
      || (reminder.repeat === 'werktags' && !['samstag', 'sonntag'].includes(now.weekday))
      || (reminder.repeat === 'woechentlich' && reminder.weekday === now.weekday)
      || (reminder.repeat === 'einmal' && reminder.date === now.date);
    if (today) push(`reminder:${reminder.id}:${now.date}`, { kind: 'reminder', text: reminder.text, id: reminder.id, once: reminder.repeat === 'einmal' });
  }
  for (const appointment of p.appointments) {
    const start = appointment.time || '09:00';
    const startAbs = Date.parse(`${appointment.date}T${start}:00Z`) / 60000;
    const nowAbs = Date.parse(`${now.date}T${now.time}:00Z`) / 60000;
    const remindAt = startAbs - appointment.remindMinutes;
    if (!appointment.notified && nowAbs >= remindAt && nowAbs <= startAbs) {
      push(`appointment:${appointment.id}`, { kind: 'appointment', id: appointment.id, title: appointment.title, time: appointment.time, date: appointment.date, minutesLeft: Math.round(startAbs - nowAbs) });
    }
  }
  return due;
}

// Marks a sent item in the planner (see dueItems).
export function markSent(planner, item, now = localNow()) {
  const p = sanitizePlanner(planner);
  if (item.kind === 'briefing') return { ...p, briefing: { ...p.briefing, lastSent: now.date } };
  if (item.kind === 'reminder') return { ...p, reminders: p.reminders.map((entry) => (entry.id === item.id ? { ...entry, lastSent: now.date } : entry)) };
  if (item.kind === 'appointment') return { ...p, appointments: p.appointments.map((entry) => (entry.id === item.id ? { ...entry, notified: true } : entry)) };
  return p;
}

// Removes one-time reminders and appointments that are over.
export function cleanupPast(planner, now = localNow()) {
  const p = sanitizePlanner(planner);
  return {
    ...p,
    reminders: p.reminders.filter((item) => item.repeat !== 'einmal' || item.date >= now.date),
    appointments: p.appointments.filter((item) => item.date >= shiftDate(now.date, -1))
  };
}

export function describeReminder(reminder) {
  const when = reminder.repeat === 'taeglich' ? 'täglich' : reminder.repeat === 'werktags' ? 'werktags' : reminder.repeat === 'woechentlich' ? `jeden ${reminder.weekday[0].toUpperCase()}${reminder.weekday.slice(1)}` : `am ${reminder.date}`;
  return `${reminder.text} (${when} um ${reminder.time} Uhr)`;
}
