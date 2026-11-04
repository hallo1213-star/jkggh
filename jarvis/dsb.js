// DSBmobile (Vertretungsplan): logs in with the school's DSB account (only in
// Render: DSB_USER / DSB_PASSWORD), loads the timetable pages and reads
// Untis plans ("Untis Monitor" HTML) – then filters them for one class.
// DSBmobile has no official API for own apps; this uses the same unofficial
// endpoints as the app and may stop working if the provider changes them.
const API = 'https://mobileapi.dsbcontrol.de';
const TIMEOUT = 20_000;
let tokenCache = { token: null, at: 0 };

export const dsbConfigured = () => Boolean(process.env.DSB_USER?.trim() && process.env.DSB_PASSWORD?.trim());
export const dsbClass = (fallback = '') => String(fallback || process.env.DSB_KLASSE || '').trim();

async function token(fetchImpl) {
  if (tokenCache.token && Date.now() - tokenCache.at < 50 * 60_000) return tokenCache.token;
  const q = new URLSearchParams({ bundleid: 'de.heinekingmedia.dsbmobile', appversion: '35', osversion: '22', pushid: '', user: process.env.DSB_USER.trim(), password: process.env.DSB_PASSWORD.trim() });
  const r = await fetchImpl(`${API}/authid?${q}`, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`DSBmobile antwortet nicht (Status ${r.status}).`);
  const t = String(await r.text()).replace(/"/g, '').trim();
  if (!t || /^0{8}-0{4}/.test(t)) throw new Error('DSBmobile-Anmeldung fehlgeschlagen – stimmen DSB_USER und DSB_PASSWORD bei Render?');
  tokenCache = { token: t, at: Date.now() };
  return t;
}

async function decode(response) {
  const buf = Buffer.from(await response.arrayBuffer());
  const head = buf.subarray(0, 2000).toString('latin1');
  const charset = (/charset=["']?([\w-]+)/i.exec(head)?.[1] || (/content-type/i.test(head) ? 'utf-8' : 'windows-1252')).toLowerCase();
  try { return new TextDecoder(/8859-1|1252|latin/.test(charset) ? 'windows-1252' : charset).decode(buf); } catch { return buf.toString('utf8'); }
}

const strip = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&(auml|ouml|uuml|Auml|Ouml|Uuml|szlig|quot|eacute);/g, (_, n) => ({ auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', quot: '"', eacute: 'é' }[n])).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
const KEYS = [['klasse', /klasse/i], ['stunde', /stunde|std/i], ['vertreter', /vertreter|lehrer/i], ['fach', /^fach|^\(?fach/i], ['raum', /raum/i], ['art', /art|typ/i], ['text', /text|bemerkung|hinweis|info/i], ['statt', /statt|\(lehrer\)|\(fach\)|\(raum\)/i]];

// Untis "Monitor" HTML → days with substitution rows
export function parseUntis(html) {
  const days = [];
  const blocks = String(html).split(/<div class=["']?mon_title["']?>/i).slice(1);
  for (const block of blocks) {
    const title = strip(block.slice(0, block.indexOf('</div>')));
    const date = (/(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(title) || []).slice(1).map(Number);
    const table = (/<table[^>]*class=["']?mon_list["']?[^>]*>([\s\S]*?)<\/table>/i.exec(block) || [])[1] || '';
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => ({ raw: m[0], cells: [...m[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => ({ th: c[1] === 'h', text: strip(c[2]) })) }));
    const headerRow = rows.find((r) => r.cells.length > 1 && r.cells.every((c) => c.th));
    const header = headerRow ? headerRow.cells.map((c) => c.text) : [];
    const cols = header.map((h, i) => {
      if (/^\(/.test(h)) return 'statt';
      const k = KEYS.find(([, re]) => re.test(h)); return k ? k[0] : `spalte${i}`;
    });
    let group = '';
    const entries = [];
    for (const r of rows) {
      if (r === headerRow || !r.cells.length) continue;
      if (r.cells.length === 1 || /inline_header/.test(r.raw)) { group = r.cells.map((c) => c.text).join(' '); continue; }
      const e = {};
      r.cells.forEach((c, i) => { const k = cols[i] || `spalte${i}`; e[k] = e[k] ? `${e[k]} ${c.text}` : c.text; });
      if (!e.klasse && group) e.klasse = group;
      if (Object.values(e).some((v) => v && v !== '---')) entries.push(e);
    }
    days.push({ title, date: date.length === 3 ? `${date[2]}-${String(date[1]).padStart(2, '0')}-${String(date[0]).padStart(2, '0')}` : null, entries });
  }
  return days;
}

// "7D", "07d", "7 D", "5a, 7d", "(7D)" → matches 7D
export function normClass(c) { return String(c || '').toUpperCase().replace(/\s+/g, '').replace(/^0+(?=\d)/, ''); }
export function matchesClass(field, wanted) {
  const w = normClass(wanted); if (!w) return true;
  const parts = String(field || '').toUpperCase().split(/[,;/()\s]+/).map(normClass).filter(Boolean);
  if (parts.includes(w)) return true;
  // compressed "7ABD" / "7A, B, D"
  const grade = /^(\d+)([A-Z]+)$/.exec(w);
  if (grade) for (const p of parts) { const m = /^(\d+)([A-Z]{2,})$/.exec(p); if (m && m[1] === grade[1] && m[2].includes(grade[2])) return true; }
  return false;
}

export async function loadPlan({ fetchImpl = fetch } = {}) {
  if (!dsbConfigured()) throw new Error('DSBmobile ist noch nicht eingerichtet: bei Render DSB_USER und DSB_PASSWORD (Zugang deiner Schule) und DSB_KLASSE eintragen.');
  const t = await token(fetchImpl);
  const r = await fetchImpl(`${API}/dsbtimetables?authid=${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`Vertretungsplan nicht abrufbar (Status ${r.status}).`);
  const items = await r.json().catch(() => []);
  const urls = []; const images = [];
  for (const item of Array.isArray(items) ? items : []) {
    for (const child of (item.Childs?.length ? item.Childs : [item])) {
      const url = String(child.Detail || '');
      if (!/^https:\/\//.test(url)) continue;
      if (/\.(png|jpe?g|gif|pdf)(\?|$)/i.test(url)) images.push({ url, title: String(item.Title || child.Title || 'Plan'), date: String(item.Date || '') });
      else urls.push(url);
    }
  }
  const days = [];
  for (const url of urls.slice(0, 8)) {
    try { const page = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT) }); if (page.ok) days.push(...parseUntis(await decode(page))); } catch { /* one page failing is fine */ }
  }
  // merge pages of the same day
  const merged = [];
  for (const d of days) { const same = merged.find((x) => x.title === d.title); if (same) same.entries.push(...d.entries); else merged.push({ ...d, entries: [...d.entries] }); }
  return { days: merged, images, pages: urls.length };
}

export function forClass(plan, klasse) {
  return plan.days.map((d) => ({ ...d, entries: d.entries.filter((e) => matchesClass(e.klasse, klasse)) }));
}

export function describeEntry(e) {
  const what = [e.art, e.fach && `${e.fach}`].filter(Boolean).join(' ');
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(String(e.stunde || '').trim());
  return `${range ? `${range[1]}. bis ${range[2]}. Stunde` : e.stunde ? `${e.stunde}. Stunde` : 'Stunde ?'}: ${what || 'Änderung'}${e.vertreter && e.vertreter !== '---' ? `, Vertretung ${e.vertreter}` : ''}${e.raum && e.raum !== '---' ? `, Raum ${e.raum}` : ''}${e.text ? ` (${e.text})` : ''}`;
}

export function signature(days) { return days.map((d) => `${d.date}|${d.entries.map((e) => JSON.stringify(e)).join('§')}`).join('#'); }

// Watches the plan of one class; the first check only remembers the state,
// afterwards every change is sent (e.g. via Telegram).
export function createPlanWatcher({ load = loadPlan, send, enabled = () => true, klasse = () => dsbClass() }) {
  let last = null;
  return async function check() {
    if (!enabled() || !klasse()) return null;
    const days = forClass(await load(), klasse()).filter((d) => d.entries.length);
    const sig = signature(days);
    if (last === null) { last = sig; return 'gemerkt'; }
    if (sig === last) return 'unverändert';
    last = sig;
    if (!days.length) return 'leer';
    await send(`📚 Vertretungsplan ${klasse()} hat sich geändert:\n${days.map((d) => `\n${d.title}\n${d.entries.map((e) => `• ${describeEntry(e)}`).join('\n')}`).join('\n')}`.slice(0, 3500));
    return 'gesendet';
  };
}
