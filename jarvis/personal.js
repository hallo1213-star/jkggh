// Notes, expenses and vocabulary lists. Stored on the user's devices and
// synced through the server like the shopping list.
import { randomUUID } from 'node:crypto';
import { localNow } from './planner.js';

const newId = () => randomUUID().replace(/-/g, '').slice(0, 8);
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const validId = (value) => (typeof value === 'string' && /^[a-z0-9]{6,12}$/.test(value) ? value : newId());
const isoDay = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? value : null);
const today = () => localNow().date;

function matchOne(list, field, query) {
  const wanted = String(query ?? '').trim().toLowerCase();
  if (!wanted) throw new Error('Welchen Eintrag meinst du?');
  let matches = list.filter((item) => item.id === query || item[field].toLowerCase() === wanted);
  if (!matches.length) matches = list.filter((item) => item[field].toLowerCase().includes(wanted));
  if (matches.length > 1) throw new Error(`Das passt auf mehrere Einträge: ${matches.slice(0, 4).map((item) => item[field].slice(0, 40)).join(' / ')}. Welcher genau?`);
  return matches[0] || null;
}

// --- Notes -------------------------------------------------------------------

export function sanitizeNotes(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({ id: validId(item?.id), text: text(item?.text, 1000), date: isoDay(item?.date) || today() }))
    .filter((item) => item.text)
    .slice(-200);
}

export function addNote(notes, value, date) {
  const note = { id: newId(), text: text(value, 1000), date: isoDay(date) || today() };
  if (!note.text) throw new Error('Was soll ich notieren?');
  return { notes: [...sanitizeNotes(notes), note].slice(-200), note };
}

export function findNotes(notes, query, limit = 10) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const list = sanitizeNotes(notes);
  const hits = words.length ? list.filter((note) => words.every((word) => note.text.toLowerCase().includes(word))) : list;
  return hits.slice(-limit).reverse();
}

export function removeNote(notes, query) {
  const list = sanitizeNotes(notes);
  const hit = matchOne(list, 'text', query);
  return { notes: hit ? list.filter((note) => note.id !== hit.id) : list, removed: hit?.text || null };
}

// --- Expenses ----------------------------------------------------------------

export function sanitizeExpenses(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({ id: validId(item?.id), amount: Math.round(Number(item?.amount) * 100) / 100, category: text(item?.category, 30) || 'Sonstiges', note: text(item?.note, 120), date: isoDay(item?.date) || today() }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0 && item.amount < 1_000_000)
    .slice(-1000);
}

export function addExpense(expenses, { amount, category, note, date }) {
  const value = Number(String(amount ?? '').replace(',', '.'));
  if (!(value > 0) || value >= 1_000_000) throw new Error('Wie viel hast du ausgegeben? Bitte einen Betrag in Euro nennen.');
  const expense = sanitizeExpenses([{ amount: value, category, note, date }])[0];
  return { expenses: [...sanitizeExpenses(expenses), expense].slice(-1000), expense };
}

const euro = (value) => `${value.toFixed(2).replace('.', ',')} €`;

export function summarizeExpenses(expenses, month) {
  const wanted = /^\d{4}-\d{2}$/.test(String(month ?? '')) ? month : today().slice(0, 7);
  const list = sanitizeExpenses(expenses).filter((item) => item.date.startsWith(wanted));
  const total = list.reduce((sum, item) => sum + item.amount, 0);
  const byCategory = {};
  for (const item of list) byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
  return {
    monat: wanted,
    gesamt: euro(total),
    anzahl: list.length,
    nachKategorie: Object.fromEntries(Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([name, sum]) => [name, euro(sum)])),
    letzte: list.slice(-5).reverse().map((item) => `${item.date}: ${euro(item.amount)} ${item.category}${item.note ? ` (${item.note})` : ''}`)
  };
}

export function removeLastExpense(expenses) {
  const list = sanitizeExpenses(expenses);
  const last = list[list.length - 1];
  return { expenses: list.slice(0, -1), removed: last ? `${euro(last.amount)} ${last.category}` : null };
}

// --- Vocabulary --------------------------------------------------------------

export function sanitizeVocab(value) {
  return (Array.isArray(value) ? value : [])
    .map((list) => ({
      id: validId(list?.id),
      name: text(list?.name, 40),
      pairs: (Array.isArray(list?.pairs) ? list.pairs : [])
        .map((pair) => ({ a: text(pair?.a ?? pair?.de, 80), b: text(pair?.b ?? pair?.fremd ?? pair?.en, 80) }))
        .filter((pair) => pair.a && pair.b)
        .slice(0, 300)
    }))
    .filter((list) => list.name)
    .slice(0, 30);
}

export function addVocab(vocab, name, pairs) {
  const lists = sanitizeVocab(vocab);
  const listName = text(name, 40);
  if (!listName) throw new Error('Wie soll die Vokabelliste heißen (z. B. "Englisch Unit 3")?');
  const fresh = sanitizeVocab([{ name: listName, pairs }])[0].pairs;
  if (!fresh.length) throw new Error('Keine gültigen Vokabelpaare angegeben.');
  const existing = lists.find((list) => list.name.toLowerCase() === listName.toLowerCase());
  if (existing) {
    const known = new Set(existing.pairs.map((pair) => pair.a.toLowerCase()));
    existing.pairs = [...existing.pairs, ...fresh.filter((pair) => !known.has(pair.a.toLowerCase()))].slice(0, 300);
    return { vocab: lists, list: existing, added: fresh.length };
  }
  if (lists.length >= 30) throw new Error('Es gibt schon 30 Vokabellisten. Lösch zuerst eine.');
  const list = { id: newId(), name: listName, pairs: fresh };
  return { vocab: [...lists, list], list, added: fresh.length };
}

export function quizPairs(vocab, name, count = 10) {
  const lists = sanitizeVocab(vocab);
  const list = name ? matchOne(lists, 'name', name) : lists[lists.length - 1];
  if (!list) throw new Error(lists.length ? `Die Liste „${name}“ gibt es nicht. Vorhanden: ${lists.map((l) => l.name).join(', ')}.` : 'Es gibt noch keine Vokabellisten.');
  const shuffled = [...list.pairs];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { liste: list.name, insgesamt: list.pairs.length, abfrage: shuffled.slice(0, Math.min(Math.max(Number(count) || 10, 1), 30)) };
}

export function removeVocabList(vocab, name) {
  const lists = sanitizeVocab(vocab);
  const hit = matchOne(lists, 'name', name);
  return { vocab: hit ? lists.filter((list) => list.id !== hit.id) : lists, removed: hit?.name || null };
}
