// Things Jarvis remembers about the user ("wohnt in Köln", "mag Pizza").
// Stored on the user's devices and synced like the other lists; passwords,
// PINs and bank or card numbers are never stored.
const MAX_MEMORIES = 150;

// Memory Palace categories (shown as hubs in the 3D view).
export const CATEGORIES = {
  praeferenz: 'Persönliche Präferenzen',
  projekt: 'Projekte',
  wissen: 'Wissen',
  aufgabe: 'Aufgaben',
  gespraech: 'Gesprächserinnerungen',
  entscheidung: 'Wichtige Entscheidungen',
  offen: 'Offene Aufgaben'
};

export function guessCategory(text) {
  const t = String(text).toLowerCase();
  if (/^(stil|anrede):|mag |liebt |lieblings|hasst |bevorzugt|wohnt|heißt|geburtstag|isst gern|hört gern/.test(t)) return 'praeferenz';
  if (/projekt|website|app\b|shop|jarvis|studio|spiel/.test(t)) return 'projekt';
  if (/entschied|entscheidung|hat sich für|will nicht mehr|möchte künftig/.test(t)) return 'entscheidung';
  if (/muss noch|offen|todo|noch erledigen|nicht vergessen/.test(t)) return 'offen';
  if (/aufgabe|erledigt|hausaufgabe|arbeit an/.test(t)) return 'aufgabe';
  return 'wissen';
}

const newId = () => Math.random().toString(36).slice(2, 10);
const cleanLinks = (links) => [...new Set((Array.isArray(links) ? links : String(links ?? '').split(/[,;]/)).map((l) => clean(l).slice(0, 40)).filter(Boolean))].slice(0, 6);
const MAX_LENGTH = 200;
const SENSITIVE = /passw|kennwort|\bpin\b|\btan\b|iban|kreditkart|kartennummer|cvc|sicherheitscode|zugangsdaten|\b\d(?:[ -]?\d){11,}\b/i;

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
}

const key = (value) => clean(value).toLocaleLowerCase('de-DE');

export function isSensitive(text) {
  return SENSITIVE.test(String(text ?? ''));
}

export function sanitizeMemories(value) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(value) ? value : []) {
    const text = clean(typeof item === 'string' ? item : item?.text);
    if (!text || isSensitive(text) || seen.has(key(text))) continue;
    seen.add(key(text));
    const category = CATEGORIES[item?.category] ? item.category : guessCategory(text);
    list.push({
      id: typeof item?.id === 'string' && /^[a-z0-9]{4,12}$/.test(item.id) ? item.id : newId(),
      text,
      category,
      links: cleanLinks(item?.links).filter((l) => !isSensitive(l)),
      updatedAt: Number.isFinite(Number(item?.updatedAt)) && Number(item.updatedAt) > 0 ? Number(item.updatedAt) : Date.now()
    });
    if (list.length >= MAX_MEMORIES) break;
  }
  return list;
}

export function addMemory(list, fact, { category, links } = {}) {
  const text = clean(fact);
  if (!text) throw new Error('Was soll ich mir merken?');
  if (isSensitive(text) || cleanLinks(links).some(isSensitive)) throw new Error('Passwörter, PINs und Bank- oder Kartendaten merke ich mir aus Sicherheitsgründen nicht.');
  const next = sanitizeMemories(list);
  const existing = next.find((item) => key(item.text) === key(text));
  if (existing) {
    // Known already: only enrich category/links.
    const updated = { ...existing, category: CATEGORIES[category] ? category : existing.category, links: cleanLinks([...existing.links, ...cleanLinks(links)]), updatedAt: Date.now() };
    return { list: next.map((item) => (item.id === existing.id ? updated : item)), added: false, memory: updated };
  }
  const memory = sanitizeMemories([{ text, category, links }])[0];
  // When full, the oldest memory makes room.
  return { list: [...next, memory].slice(-MAX_MEMORIES), added: true, memory };
}

export function updateMemory(list, id, changes = {}) {
  const next = sanitizeMemories(list);
  const item = next.find((m) => m.id === id);
  if (!item) throw new Error('Diese Erinnerung gibt es nicht mehr.');
  const text = changes.text !== undefined ? clean(changes.text) : item.text;
  if (!text) throw new Error('Die Erinnerung darf nicht leer sein.');
  if (isSensitive(text) || cleanLinks(changes.links ?? item.links).some(isSensitive)) throw new Error('Passwörter, PINs und Bank- oder Kartendaten speichere ich nicht.');
  const updated = { ...item, text, category: CATEGORIES[changes.category] ? changes.category : item.category, links: changes.links !== undefined ? cleanLinks(changes.links) : item.links, updatedAt: Date.now() };
  return next.map((m) => (m.id === id ? updated : m));
}

export function removeMemoryById(list, id) {
  return sanitizeMemories(list).filter((m) => m.id !== id);
}

// Removes the memory that matches exactly, or the only one containing the words.
export function forgetMemory(list, fact) {
  const next = sanitizeMemories(list);
  const wanted = key(fact);
  if (!wanted) throw new Error('Was soll ich vergessen?');
  let index = next.findIndex((item) => key(item.text) === wanted);
  if (index < 0) {
    const partial = next.map((item, i) => (key(item.text).includes(wanted) ? i : -1)).filter((i) => i >= 0);
    if (partial.length > 1) throw new Error(`Das passt auf mehrere Erinnerungen: ${partial.map((i) => next[i].text).join(' / ')}. Welche genau?`);
    index = partial.length ? partial[0] : -1;
  }
  if (index < 0) return { list: next, removed: null };
  return { list: next.filter((_, i) => i !== index), removed: next[index].text };
}

// Recent conversation turns from the device, in the Voice Agent's history format.
export function sanitizeHistory(value, limit = 16) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => (item?.role === 'user' || item?.role === 'assistant') && typeof item.content === 'string' && item.content.trim())
    .slice(-limit)
    .map((item) => ({ type: 'History', role: item.role, content: clean(item.content).slice(0, 400) }));
}
