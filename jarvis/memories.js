// Things Jarvis remembers about the user ("wohnt in Köln", "mag Pizza").
// Stored on the user's devices and synced like the other lists; passwords,
// PINs and bank or card numbers are never stored.
const MAX_MEMORIES = 60;
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
    list.push({ text });
    if (list.length >= MAX_MEMORIES) break;
  }
  return list;
}

export function addMemory(list, fact) {
  const text = clean(fact);
  if (!text) throw new Error('Was soll ich mir merken?');
  if (isSensitive(text)) throw new Error('Passwörter, PINs und Bank- oder Kartendaten merke ich mir aus Sicherheitsgründen nicht.');
  const next = sanitizeMemories(list);
  if (next.some((item) => key(item.text) === key(text))) return { list: next, added: false };
  // When full, the oldest memory makes room.
  return { list: [...next, { text }].slice(-MAX_MEMORIES), added: true };
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
