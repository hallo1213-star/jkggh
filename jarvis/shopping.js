// Shopping list helpers and shop search links. The list itself is stored on
// the user's device (the free server forgets everything when it sleeps); the
// browser sends it when a conversation starts and saves every change.
const MAX_ITEMS = 100;
const MAX_LENGTH = 80;

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
}

const key = (text) => clean(text).toLocaleLowerCase('de-DE');

export function sanitizeList(value) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(value) ? value : []) {
    const text = clean(typeof item === 'string' ? item : item?.text);
    if (!text || seen.has(key(text))) continue;
    seen.add(key(text));
    list.push({ text, done: typeof item === 'object' && item?.done === true });
    if (list.length >= MAX_ITEMS) break;
  }
  return list;
}

export function addItems(list, items) {
  const next = sanitizeList(list);
  const added = [];
  for (const raw of Array.isArray(items) ? items : [items]) {
    const text = clean(raw);
    if (!text) continue;
    const existing = next.find((item) => key(item.text) === key(text));
    if (existing) {
      existing.done = false;
    } else if (next.length < MAX_ITEMS) {
      next.push({ text, done: false });
      added.push(text);
    }
  }
  return { list: next, added };
}

// Removes exact matches first; otherwise the one item that contains the word
// ("Milch" also removes "Hafermilch"), so a slightly different wording works.
export function removeItems(list, items) {
  let next = sanitizeList(list);
  const removed = [];
  const notFound = [];
  for (const raw of Array.isArray(items) ? items : [items]) {
    const wanted = key(raw);
    if (!wanted) continue;
    let index = next.findIndex((item) => key(item.text) === wanted);
    if (index < 0) {
      const partial = next.map((item, i) => (key(item.text).includes(wanted) ? i : -1)).filter((i) => i >= 0);
      index = partial.length === 1 ? partial[0] : -1;
    }
    if (index < 0) {
      notFound.push(clean(raw));
      continue;
    }
    removed.push(next[index].text);
    next = next.filter((_, i) => i !== index);
  }
  return { list: next, removed, notFound };
}

export function listAsText(list) {
  const open = list.filter((item) => !item.done);
  const done = list.filter((item) => item.done);
  return [...open.map((item) => `☐ ${item.text}`), ...done.map((item) => `☑ ${item.text}`)].join('\n');
}

export function shopLinks(query) {
  const q = encodeURIComponent(clean(query));
  return [
    { name: 'Amazon', url: `https://www.amazon.de/s?k=${q}` },
    { name: 'idealo', url: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${q}` },
    { name: 'Google Shopping', url: `https://www.google.com/search?tbm=shop&q=${q}` }
  ];
}

// Price research for selling something used: current offers and sold items.
export function sellLinks(query) {
  const words = clean(query);
  const slug = encodeURIComponent(words.toLocaleLowerCase('de-DE').replace(/\s+/g, '-'));
  return [
    { name: 'Kleinanzeigen: ähnliche Angebote', url: `https://www.kleinanzeigen.de/s-${slug}/k0` },
    { name: 'eBay: verkaufte Preise', url: `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(words)}&LH_Sold=1&LH_Complete=1` },
    { name: 'Kleinanzeigen öffnen', url: 'https://www.kleinanzeigen.de/' }
  ];
}
