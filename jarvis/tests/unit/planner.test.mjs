process.env.TELEGRAM_BOT_TOKEN = '1:A'; process.env.TELEGRAM_CHAT_ID = '987654321';
const P = await import('../../planner.js');
const X = await import('../../personal.js');
const { composeBriefing, noticeFor } = await import('../../scheduler.js');
const T = await import('../../telegram.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
assert(P.normalizeTime('7:05') === '07:05' && P.normalizeTime('19.30') === '19:30' && P.normalizeTime('18:00 Uhr') === '18:00' && P.normalizeTime('25:00') === null, 'times normalized');
assert(P.normalizeWeekday('Mo') === 'montag' && P.normalizeWeekday('Sonntag') === 'sonntag' && P.normalizeWeekday('x') === null, 'weekdays normalized');
const ln = P.localNow(new Date('2026-11-02T06:30:00Z'));
assert(ln.date === '2026-11-02' && ln.time === '07:30' && ln.weekday === 'montag', 'German local time (UTC+1 in November)');
let pl = P.sanitizePlanner();
pl = P.addReminder(pl, { text: 'Müll rausbringen', time: '19:00', repeat: 'woechentlich', weekday: 'Montag' }).planner;
pl = P.addReminder(pl, { text: 'Wasser trinken', time: '10:00', repeat: 'taeglich' }).planner;
pl = P.addReminder(pl, { text: 'Hausaufgaben', time: '16:00', repeat: 'werktags' }).planner;
pl = P.addReminder(pl, { text: 'Oma anrufen', time: '12:00', repeat: 'einmal', date: '2026-11-03' }).planner;
pl = P.addAppointment(pl, { title: 'Zahnarzt', date: '2026-11-06', time: '15:00', remindMinutes: 60 }).planner;
pl = { ...pl, briefing: { time: '07:00', place: 'Köln' } };
try { P.addReminder(pl, { text: 'x', time: 'bald', repeat: 'taeglich' }); assert(false, 'needs time'); } catch (e) { assert(/Uhrzeit/.test(e.message), 'reminder without time → asks for time'); }
try { P.addReminder(pl, { text: 'x', time: '10:00', repeat: 'woechentlich' }); assert(false, 'needs weekday'); } catch (e) { assert(/Wochentag/.test(e.message), 'weekly without weekday → asks for weekday'); }
const at = (date, time, weekday) => ({ date, time, weekday });
const kinds = (due) => due.map((d) => d.kind + ':' + (d.text || d.title || '')).join(', ');
const fired = new Set();
assert(kinds(P.dueItems(pl, at('2026-11-02', '07:00', 'montag'), fired)) === 'briefing:', 'briefing at 07:00');
assert(kinds(P.dueItems(pl, at('2026-11-02', '07:14', 'montag'), fired)) === 'briefing:', 'still due within 15 minutes (server hiccup)');
assert(kinds(P.dueItems(pl, at('2026-11-02', '07:16', 'montag'), fired)) === '', 'not due after the window');
assert(kinds(P.dueItems(pl, at('2026-11-02', '19:00', 'montag'), fired)) === 'reminder:Müll rausbringen', 'weekly reminder on Monday');
assert(kinds(P.dueItems(pl, at('2026-11-03', '19:00', 'dienstag'), fired)) === '', 'not on Tuesday');
assert(kinds(P.dueItems(pl, at('2026-11-07', '16:00', 'samstag'), fired)) === '', 'workday reminder not on Saturday');
assert(kinds(P.dueItems(pl, at('2026-11-06', '16:00', 'freitag'), fired)) === 'reminder:Hausaufgaben', 'workday reminder on Friday');
assert(kinds(P.dueItems(pl, at('2026-11-03', '12:05', 'dienstag'), fired)) === 'reminder:Oma anrufen', 'one-time reminder on its date');
assert(kinds(P.dueItems(pl, at('2026-11-06', '14:00', 'freitag'), fired)) === 'appointment:Zahnarzt', 'appointment reminder 60 min before');
const f2 = new Set(); const d = P.dueItems(pl, at('2026-11-02', '10:00', 'montag'), f2); d.forEach((x) => f2.add(x.key));
assert(P.dueItems(pl, at('2026-11-02', '10:01', 'montag'), f2).length === 0, 'fired items are not sent twice');
assert(P.upcomingAppointments(pl, { from: at('2026-11-02', '08:00', 'montag'), days: 7 }).length === 1, 'upcoming appointments within 7 days');
const cleaned = P.cleanupPast(pl, at('2026-11-10', '08:00', 'dienstag'));
assert(cleaned.appointments.length === 0 && cleaned.reminders.length === 3, 'past appointments and one-time reminders cleaned up');
assert(P.removeEntry(pl, 'reminders', 'müll').removed === 'Müll rausbringen', 'remove reminder by keyword');
assert(noticeFor({ kind: 'appointment', title: 'Zahnarzt', time: '15:00', date: '2026-11-06', minutesLeft: 60 }).spoken === 'Denk dran: Zahnarzt, in einer Stunde, um 15 Uhr.' && noticeFor({ kind: 'appointment', title: 'Training', time: '18:30', minutesLeft: 125 }).spoken === 'Denk dran: Training, in 2 Stunden, um 18 Uhr 30.' && noticeFor({ kind: 'reminder', text: 'Müll rausbringen' }).spoken === 'Hey, kleine Erinnerung: Müll rausbringen.', 'notice texts (singular/plural, spoken time)');
let notes = X.addNote([], 'Lisa ein Buch leihen').notes; notes = X.addNote(notes, 'Geschenkidee: Kopfhörer für Max').notes;
assert(X.findNotes(notes, 'buch')[0].text === 'Lisa ein Buch leihen' && X.findNotes(notes, '').length === 2, 'notes find by keyword / newest');
assert(X.removeNote(notes, 'geschenk').removed.startsWith('Geschenkidee'), 'note removed by keyword');
let ex = X.addExpense([], { amount: '12,50', category: 'Essen', date: '2026-11-02' }).expenses;
ex = X.addExpense(ex, { amount: 30, category: 'Kleidung', date: '2026-11-03' }).expenses;
ex = X.addExpense(ex, { amount: 5, category: 'Essen', date: '2026-10-30' }).expenses;
const sum = X.summarizeExpenses(ex, '2026-11');
assert(sum.gesamt === '42,50 €' && sum.nachKategorie.Kleidung === '30,00 €' && sum.nachKategorie.Essen === '12,50 €' && sum.anzahl === 2, 'monthly summary (comma decimals, other months excluded)');
try { X.addExpense([], { amount: 'viel' }); assert(false, 'bad amount'); } catch (e) { assert(/Betrag/.test(e.message), 'invalid amount rejected'); }
assert(X.removeLastExpense(ex).removed === '5,00 € Essen', 'remove last expense');
let vocab = X.addVocab([], 'Englisch Unit 3', [{ a: 'Hund', b: 'dog' }, { a: 'Katze', b: 'cat' }]).vocab;
vocab = X.addVocab(vocab, 'englisch unit 3', [{ a: 'Hund', b: 'dog' }, { a: 'Maus', b: 'mouse' }]).vocab;
assert(vocab.length === 1 && vocab[0].pairs.length === 3, 'vocab merged into existing list without duplicates');
const quiz = X.quizPairs(vocab, 'unit 3', 2);
assert(quiz.abfrage.length === 2 && quiz.liste === 'Englisch Unit 3', 'quiz picks random pairs');
const fakeData = { getWeather: async () => ({ ort: 'Köln, NRW, Deutschland', jetzt: { temperatur: 11, wetter: 'leichter Regen', symbol: '🌦️' }, tage: [{ max: 13, regenWahrscheinlichkeit: 80 }] }), unreadMail: async () => ({ treffer: 2, emails: [{ von: 'Oma Inge <oma@x.de>' }, { von: 'DHL <a@b>' }] }), getNews: async () => ({ meldungen: [{ titel: 'Schlagzeile eins' }, { titel: 'Schlagzeile zwei' }] }) };
const today = P.localNow().date;
const b = await composeBriefing({ planner: P.addAppointment(P.sanitizePlanner(), { title: 'Training', date: today, time: '18:00' }).planner, place: 'Köln', shopping: [{ text: 'Milch', done: false }], ...fakeData });
assert(b.spoken.startsWith('Guten Morgen! Heute ist') && b.spoken.includes('In Köln sind es gerade 11 Grad, leichter Regen, heute bis 13 Grad, nimm besser einen Schirm mit.') && b.spoken.includes('Heute steht an: Training um 18 Uhr.') && b.spoken.includes('2 ungelesene Mails, unter anderem von Oma Inge und DHL') && b.spoken.includes('eine Sache') && b.spoken.includes('Schlagzeile eins'), 'briefing: weather, appointment, mail, shopping, news');
const b2 = await composeBriefing({ planner: P.sanitizePlanner(), place: '', shopping: [], getWeather: fakeData.getWeather, unreadMail: null, getNews: async () => { throw new Error('offline'); } });
assert(b2.spoken.startsWith('Guten Morgen!') && b2.spoken.endsWith('Hab einen guten Tag!'), 'briefing still works when sources are missing');
// Telegram pinned backup
const tg = []; let pinned = null; let nextId = 100;
const tgFetch = async (url, init) => {
  const m = url.split('/').pop(); const body = JSON.parse(init.body); tg.push(m);
  const ok = (result) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });
  if (m === 'getChat') return ok(pinned ? { id: 1, pinned_message: pinned } : { id: 1 });
  if (m === 'sendMessage') { const msg = { message_id: nextId++, text: body.text }; return ok(msg); }
  if (m === 'pinChatMessage') { pinned = { message_id: body.message_id, text: tg.lastText }; return ok(true); }
  if (m === 'editMessageText') { if (pinned && body.text === pinned.text) return { ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request: message is not modified' }) }; pinned.text = body.text; return ok({}); }
  return ok({});
};
const wrap = async (url, init) => { if (url.endsWith('/sendMessage')) tg.lastText = JSON.parse(init.body).text; return tgFetch(url, init); };
assert(await T.loadPinnedBackup({ fetchImpl: wrap }) === null, 'no backup yet');
await T.savePinnedBackup({ planner: pl, updatedAt: 111 }, { fetchImpl: wrap });
assert(tg.includes('sendMessage') && tg.includes('pinChatMessage') && pinned.text.startsWith('🗂 Jarvis-Daten'), 'first save: message sent and pinned');
await T.savePinnedBackup({ planner: pl, updatedAt: 111 }, { fetchImpl: wrap });
assert(tg.filter((m) => m === 'sendMessage').length === 1, 'unchanged save: no new message (not modified is fine)');
await T.savePinnedBackup({ planner: { ...pl, briefing: { time: '08:00', place: '' } }, updatedAt: 222 }, { fetchImpl: wrap });
assert(tg.includes('editMessageText') && tg.filter((m) => m === 'sendMessage').length === 1, 'changes edit the pinned message');
const restored = await T.loadPinnedBackup({ fetchImpl: wrap });
assert(restored.updatedAt === 222 && restored.planner.briefing.time === '08:00' && restored.planner.reminders.length === 4, 'backup restored after restart');
assert(JSON.stringify({ planner: P.sanitizePlanner(restored.planner) }).length < 4000, 'backup fits into one Telegram message');
// persisted "sent" flags, late appointments, duplicates
let q = P.addAppointment(P.sanitizePlanner(), { title: 'Training', date: '2026-11-02', time: '18:30', remindMinutes: 60 }).planner;
const late = P.dueItems(q, at('2026-11-02', '18:00', 'montag'), new Set());
assert(late.length === 1 && late[0].kind === 'appointment' && late[0].minutesLeft === 30, 'appointment entered after its reminder time → reminded right away');
q = P.markSent(q, late[0], at('2026-11-02', '18:00', 'montag'));
assert(P.dueItems(q, at('2026-11-02', '18:05', 'montag'), new Set()).length === 0, 'after restart (empty memory) an announced appointment is not sent again');
let r = P.addReminder(P.sanitizePlanner(), { text: 'Wasser trinken', time: '10:00', repeat: 'taeglich' }).planner;
const due = P.dueItems(r, at('2026-11-02', '10:00', 'montag'), new Set());
r = P.markSent(r, due[0], at('2026-11-02', '10:00', 'montag'));
assert(P.dueItems(r, at('2026-11-02', '10:05', 'montag'), new Set()).length === 0 && P.dueItems(r, at('2026-11-03', '10:00', 'dienstag'), new Set()).length === 1, 'daily reminder: once per day, again the next day (even after restart)');
assert(P.addReminder(r, { text: 'wasser trinken', time: '10:00', repeat: 'taeglich' }).existing && P.addAppointment(q, { title: 'training', date: '2026-11-02', time: '18:30' }).existing, 'identical reminders/appointments are not saved twice');
