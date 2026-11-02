// JARVIS DESIGN STUDIO: one entry point for all design work. Describe what you
// want → Jarvis picks the right studio (Website, App/Spiel, 3D, Grafik & Marke,
// Bild). The Grafik-Studio lives here: logos, icons, posters, banners, social
// media, packaging and brand identities as real SVG, with live preview, checks,
// "make it premium", code view and SVG/PNG/ZIP export.
import { followJob } from './studio.js';
import { makeZip } from './projects.js';

let ctx = { toast: () => {}, send: () => false };
let ui = null;
let current = null; // { id, name, versions: [set], active, updatedAt }
let busy = false;
let selected = null; // asset name
let repaired = false;
const MODES = [
  { id: 'website', icon: '🌐', title: 'Website', text: 'Shops, Landingpages, Login & Dashboards – mit Live-Vorschau' },
  { id: 'graphics', icon: '🎨', title: 'Grafik & Marke', text: 'Logos, App-Icons, Poster, Banner, Social Media, Verpackung' },
  { id: 'model3d', icon: '🏠', title: '3D-Design', text: 'Häuser, Zimmer, Gebäude, Produkte und kleine Welten' },
  { id: 'workshop', icon: '🎮', title: 'App & Spiel', text: 'Interaktive Web-Apps, Tools und Browsergames' },
  { id: 'image', icon: '🖼️', title: 'Bild', text: 'KI-Bild nach deiner Beschreibung' }
];
const TYPES = [['brand', 'Markenidentität'], ['logo', 'Logo'], ['app_icon', 'App-Icon'], ['poster', 'Poster'], ['banner', 'Werbebanner'], ['social_post', 'Social-Media-Post'], ['story', 'Story / Reel-Cover'], ['packaging', 'Verpackung']];
const PHOTO_TYPES = new Set(['poster', 'banner', 'social_post', 'story', 'packaging']);
const STYLES = [['auto', 'Automatisch passend'], ['jarvis', 'Jarvis-Stil'], ['luxus', 'Luxus'], ['minimal', 'Minimalistisch'], ['verspielt', 'Verspielt'], ['retro', 'Retro'], ['tech', 'Tech / Futuristisch']];

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const btn = (label, fn, className = 'ds-btn') => { const b = el('button', className, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
const slug = (s) => String(s || 'design').toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';

// --- storage ---------------------------------------------------------------------------
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('jarvis-graphics', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function store(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => { const tx = d.transaction('projects', mode); const res = fn(tx.objectStore('projects')); tx.oncomplete = () => resolve(res?.result); tx.onerror = () => reject(tx.error); });
}
const listProjects = async () => ((await store('readonly', (s) => s.getAll()).catch(() => [])) || []).sort((a, b) => b.updatedAt - a.updatedAt);
const saveProject = () => current && store('readwrite', (s) => s.put({ ...current, updatedAt: Date.now() })).catch(() => {});
const set = () => current?.versions[current.active] || null;

// --- fonts & rendering -------------------------------------------------------------------
const fontCache = new Map();
async function fontFace(family) {
  if (fontCache.has(family)) return fontCache.get(family);
  const job = (async () => {
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600;700;800&display=swap`)).text();
      const rules = [];
      for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
        const body = m[1];
        if (/unicode-range:[^;]*U\+(0400|0370|1F00|0590|0600)/i.test(body)) continue; // only latin
        const url = (body.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
        if (!url) continue;
        const buf = await (await fetch(url)).arrayBuffer();
        let bin = ''; const bytes = new Uint8Array(buf); for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        rules.push(`@font-face{${body.replace(/src:[^;]+;/, `src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');`)}}`);
      }
      return rules.join('\n');
    } catch {
      return ''; // offline: system fonts
    }
  })();
  fontCache.set(family, job);
  return job;
}
const photoCache = new Map();
async function photoData(prompt, w, h) {
  if (!prompt) return '';
  const key = `${prompt}|${w}x${h}`;
  if (photoCache.has(key)) return photoCache.get(key);
  const job = (async () => {
    try {
      const format = w > h * 1.3 ? '16:9' : h > w * 1.3 ? '9:16' : '1:1';
      const r = await fetch(`/api/video/image?prompt=${encodeURIComponent(prompt)}&format=${format}&seed=7`);
      if (!r.ok) return '';
      const blob = await r.blob();
      return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(''); fr.readAsDataURL(blob); });
    } catch {
      return '';
    }
  })();
  photoCache.set(key, job);
  return job;
}
// Final, self-contained SVG: fonts embedded, photo placeholder filled (or removed).
async function finalSvg(asset, s) {
  const families = [...new Set([...asset.svg.matchAll(/font-family\s*[:=]\s*["']?([^;"'>,]+)/gi)].map((m) => m[1].trim()))].filter((f) => !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(f));
  const faces = (await Promise.all(families.map(fontFace))).join('\n');
  let svg = asset.svg;
  if (svg.includes('{{FOTO}}')) {
    const photo = await photoData(s.photoPrompt, asset.width, asset.height);
    svg = photo ? svg.replaceAll('{{FOTO}}', photo) : svg.replace(/<image\b[^>]*\{\{FOTO\}\}[^>]*\/?>(<\/image>)?/g, '');
  }
  return faces ? svg.replace(/<svg\b[^>]*>/, (m) => `${m}<defs><style>${faces}</style></defs>`) : svg;
}
function svgUrl(svg) { return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); }
async function toPng(svg, w, h, scale = 1) {
  const url = svgUrl(svg);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG konnte nicht gezeichnet werden')); img.src = url; });
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(w * scale), height: Math.round(h * scale) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Browser checks: text inside the canvas, picture not empty.
async function browserCheck(s) {
  const issues = [];
  const box = el('div');
  box.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;height:1200px;overflow:hidden;visibility:hidden';
  document.body.append(box);
  try {
    for (const a of s.assets) {
      if (!a.svg) continue;
      const doc = new DOMParser().parseFromString(await finalSvg(a, s), 'image/svg+xml');
      if (doc.querySelector('parsererror')) { issues.push(`${a.label}: SVG lässt sich nicht lesen`); continue; }
      const svg = document.importNode(doc.documentElement, true);
      svg.querySelectorAll('script').forEach((n) => n.remove());
      box.replaceChildren(svg);
      const vb = svg.viewBox?.baseVal;
      const W = vb?.width || a.width;
      const H = vb?.height || a.height;
      await new Promise((r) => requestAnimationFrame(r));
      for (const t of svg.querySelectorAll('text')) {
        try {
          const b = t.getBBox();
          if (b.width && (b.x < -W * 0.01 || b.y < -H * 0.01 || b.x + b.width > W * 1.01 || b.y + b.height > H * 1.01)) { issues.push(`${a.label}: Text „${t.textContent.trim().slice(0, 30)}“ ragt über den Rand`); break; }
        } catch { /* ignore */ }
      }
      const png = await toPng(await finalSvg(a, s), 64, Math.round(64 * a.height / a.width)).catch(() => null);
      if (png) {
        const img = await createImageBitmap(png);
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let min = 255; let max = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; if (d[i + 3] > 10) { min = Math.min(min, v); max = Math.max(max, v); } }
        if (max - min < 30) issues.push(`${a.label}: Bild ist leer oder einfarbig`);
      }
    }
  } finally {
    box.remove();
  }
  return issues;
}

// --- UI -------------------------------------------------------------------------------------
function build() {
  if (ui) return ui;
  const overlay = el('div', 'ds-overlay');
  overlay.hidden = true;
  overlay.innerHTML = `
    <header class="ds-top">
      <div class="ds-brand"><span class="ds-reactor"></span><div><b>JARVIS DESIGN STUDIO</b><small class="ds-sub">Beschreib dein Design – Jarvis wählt das passende Studio</small></div></div>
      <nav class="ds-tabs"><button type="button" data-view="hub" class="on">Start</button><button type="button" data-view="graphics">Grafik &amp; Marke</button></nav>
      <button class="ds-icon" type="button" data-act="close" aria-label="Design Studio schließen">✕</button>
    </header>
    <section class="ds-view ds-hub" data-view="hub">
      <form class="ds-ask"><textarea maxlength="600" rows="3" placeholder="z. B. „Erstelle eine moderne Modemarke“, „Designe ein futuristisches Dashboard“, „Baue mir ein 3D-Haus mit Pool“"></textarea>
        <div class="ds-ask-row"><span class="ds-route">→ Jarvis wählt automatisch</span><button class="ds-btn primary" type="submit">✨ Design starten</button></div></form>
      <div class="ds-modes"></div>
      <p class="ds-note">Alles wird von Jarvis selbst erzeugt und programmiert – keine fremden Vorlagen-Websites. Generierter Code läuft nur in einer abgeschotteten Vorschau ohne Zugriff auf deine Daten.</p>
    </section>
    <section class="ds-view ds-gfx" data-view="graphics" hidden>
      <aside class="ds-side">
        <form class="ds-gform">
          <label class="ds-field"><span>Was soll Jarvis gestalten?</span><textarea name="brief" rows="3" maxlength="600" placeholder="z. B. „Logo für mein Gaming-Team NOVA“"></textarea></label>
          <label class="ds-field"><span>Art</span><select name="type"></select></label>
          <label class="ds-field"><span>Stil</span><select name="style"></select></label>
          <label class="ds-check"><input type="checkbox" name="photo"> KI-Foto im Hintergrund</label>
          <button class="ds-btn primary" type="submit">🎨 Gestalten</button>
        </form>
        <div class="ds-info"></div>
        <div class="ds-projects"></div>
      </aside>
      <main class="ds-stage">
        <div class="ds-toolbar"></div>
        <div class="ds-grid"></div>
        <div class="ds-qa"></div>
        <form class="ds-edit"><input maxlength="400" placeholder="Ändern, z. B. „Mach die Farben wärmer und das Zeichen schlichter“"><button class="ds-btn" type="submit">Ändern</button></form>
        <pre class="ds-code" hidden></pre>
        <div class="ds-busy" hidden><span class="ds-spinner"></span><p></p></div>
      </main>
    </section>`;
  document.body.append(overlay);
  const $ = (q) => overlay.querySelector(q);
  ui = { overlay, ask: $('.ds-ask'), route: $('.ds-route'), modes: $('.ds-modes'), gform: $('.ds-gform'), info: $('.ds-info'), projects: $('.ds-projects'), toolbar: $('.ds-toolbar'), grid: $('.ds-grid'), qa: $('.ds-qa'), edit: $('.ds-edit'), code: $('.ds-code'), busy: $('.ds-busy') };
  for (const [v, l] of TYPES) ui.gform.elements.type.append(new Option(l, v));
  for (const [v, l] of STYLES) ui.gform.elements.style.append(new Option(l, v));
  const syncPhoto = () => { ui.gform.querySelector('.ds-check').hidden = !PHOTO_TYPES.has(ui.gform.elements.type.value); };
  ui.gform.elements.type.addEventListener('change', syncPhoto);
  syncPhoto();
  let chosen = null;
  ui.modes.replaceChildren(...MODES.map((m) => {
    const card = el('button', 'ds-mode');
    card.type = 'button';
    card.dataset.mode = m.id;
    card.append(el('span', 'ds-mode-icon', m.icon), el('b', '', m.title), el('small', '', m.text));
    card.addEventListener('click', () => { chosen = chosen === m.id ? null : m.id; ui.modes.querySelectorAll('.ds-mode').forEach((c) => c.classList.toggle('on', c.dataset.mode === chosen)); updateRoute(); });
    return card;
  }));
  let routeTimer = null;
  let routed = { studio: 'website', label: 'Website (Jarvis Studio)' };
  const updateRoute = () => {
    clearTimeout(routeTimer);
    const text = ui.ask.querySelector('textarea').value.trim();
    if (chosen) { ui.route.textContent = `→ ${MODES.find((m) => m.id === chosen).title} (von dir gewählt)`; return; }
    if (!text) { ui.route.textContent = '→ Jarvis wählt automatisch'; return; }
    routeTimer = setTimeout(async () => {
      try { routed = await (await fetch('/api/design/classify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })).json(); ui.route.textContent = `→ ${routed.label}`; } catch { /* ignore */ }
    }, 250);
  };
  ui.ask.querySelector('textarea').addEventListener('input', updateRoute);
  ui.ask.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ui.ask.querySelector('textarea').value.trim();
    if (!text) { ctx.toast('Beschreib zuerst dein Design.', 'error'); return; }
    if (!chosen) routed = await (await fetch('/api/design/classify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })).json().catch(() => routed);
    startDesign(chosen ? { studio: chosen, type: routed.type } : routed, text);
  });
  overlay.querySelectorAll('.ds-tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  overlay.querySelector('[data-act="close"]').addEventListener('click', () => { overlay.hidden = true; });
  ui.gform.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = ui.gform.elements;
    if (!f.brief.value.trim()) { ctx.toast('Beschreib zuerst, was Jarvis gestalten soll.', 'error'); return; }
    createGraphics(f.brief.value.trim(), f.type.value, f.style.value, f.photo.checked && PHOTO_TYPES.has(f.type.value));
  });
  ui.edit.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = ui.edit.querySelector('input');
    if (input.value.trim() && set()) { runEdit('aendern', input.value.trim()); input.value = ''; }
  });
  return ui;
}

function showView(view) {
  ui.overlay.querySelectorAll('.ds-view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  ui.overlay.querySelectorAll('.ds-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'graphics') { renderProjects(); renderSet(); }
}

export function openDesign(view = 'hub') {
  build();
  ui.overlay.hidden = false;
  showView(view);
}

// Hand the wish to the right studio.
async function startDesign(route, text) {
  const studio = route.studio;
  if (studio === 'graphics') {
    showView('graphics');
    ui.gform.elements.brief.value = text;
    if (route.type) ui.gform.elements.type.value = route.type;
    ui.gform.elements.type.dispatchEvent(new Event('change'));
    createGraphics(text, ui.gform.elements.type.value, ui.gform.elements.style.value, false);
    return;
  }
  ui.overlay.hidden = true;
  if (studio === 'website') {
    try {
      const r = await fetch('/api/studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'build', prompt: text }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Fehler');
      followJob(data.id, 'build', text);
    } catch (error) { ctx.toast(error.message, 'error'); }
    return;
  }
  if (studio === 'model3d' || studio === 'workshop') {
    document.getElementById(studio === 'model3d' ? 'model-button' : 'project-button')?.click();
    await new Promise((r) => setTimeout(r, 250));
    const form = document.getElementById(studio === 'model3d' ? 'model-edit' : 'project-edit');
    const input = form?.querySelector('input');
    if (!input) return;
    input.value = /^(erstell|bau|programmier|mach|entwirf|design)/i.test(text) ? text : `Erstelle ${text}`;
    form.requestSubmit();
    return;
  }
  if (studio === 'image') {
    if (!ctx.send({ type: 'text', text: `Erschaffe ein Bild: ${text}` })) ctx.toast('Aktiviere zuerst Jarvis (Mikrofon), dann kann er das Bild malen.', 'error');
  }
}

function setBusy(text) {
  busy = Boolean(text);
  ui.busy.hidden = !text;
  ui.busy.querySelector('p').textContent = text || '';
}

async function call(body) {
  const r = await fetch('/api/graphics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data.set;
}

async function createGraphics(brief, type, style, photo) {
  if (busy) return;
  setBusy('Jarvis entwirft Konzept, Farben, Schriften und Grafiken …');
  try {
    const s = await call({ action: 'neu', brief, type, style, photo });
    current = { id: Math.random().toString(36).slice(2, 10), name: s.name, versions: [{ ...s, note: 'Erstellt', at: Date.now() }], active: 0, updatedAt: Date.now() };
    selected = s.assets[0]?.name;
    repaired = false;
    await saveProject();
    setBusy('');
    await renderSet(true);
  } catch (error) {
    setBusy('');
    ctx.toast(error.message, 'error');
  }
}

async function runEdit(action, wish = '', problems = []) {
  if (busy || !set()) return;
  setBusy(action === 'hochwertiger' ? 'Design wird aufgewertet: Hierarchie, Raster, Farben, Typografie …' : action === 'reparieren' ? 'Jarvis behebt die gefundenen Probleme …' : 'Jarvis ändert das Design …');
  try {
    const s = await call({ action, wish, problems, set: set() });
    current.versions.push({ ...s, note: action === 'hochwertiger' ? 'Hochwertiger gestaltet' : action === 'reparieren' ? 'Automatisch repariert' : wish.slice(0, 40), at: Date.now() });
    current.versions = current.versions.slice(-10);
    current.active = current.versions.length - 1;
    current.name = s.name;
    await saveProject();
    setBusy('');
    await renderSet(action !== 'reparieren');
  } catch (error) {
    setBusy('');
    ctx.toast(error.message, 'error');
  }
}

async function renderProjects() {
  const list = await listProjects();
  ui.projects.replaceChildren(el('b', 'ds-label', 'Meine Designs'), ...(list.length ? list.slice(0, 12).map((p) => {
    const row = el('div', `ds-proj${p.id === current?.id ? ' on' : ''}`);
    row.append(btn(`${p.name} · ${p.versions[p.active]?.typeLabel || ''}`, () => { current = p; selected = set()?.assets[0]?.name; renderSet(); renderProjects(); }, 'ds-proj-open'), btn('🗑', async () => { if (!confirm(`„${p.name}“ löschen?`)) return; await store('readwrite', (s) => s.delete(p.id)); if (current?.id === p.id) current = null; renderProjects(); renderSet(); }, 'ds-icon small'));
    return row;
  }) : [el('p', 'ds-muted', 'Noch keine Designs.')]));
}

async function renderSet(checkAfter = false) {
  const s = set();
  ui.code.hidden = true;
  if (!s) {
    ui.toolbar.replaceChildren(); ui.info.replaceChildren(); ui.qa.replaceChildren();
    ui.grid.replaceChildren(el('p', 'ds-empty', 'Beschreib links, was Jarvis gestalten soll – z. B. ein Logo, ein Poster oder eine komplette Marke.'));
    return;
  }
  // toolbar
  const versions = el('select', 'ds-select');
  current.versions.forEach((v, i) => versions.append(new Option(`V${i + 1} · ${v.note || ''}`, String(i))));
  versions.value = String(current.active);
  versions.addEventListener('change', async () => { current.active = Number(versions.value); await saveProject(); renderSet(); });
  ui.toolbar.replaceChildren(el('b', 'ds-title', `${s.name} · ${s.typeLabel}`), versions, btn('✨ Hochwertiger', () => runEdit('hochwertiger')), btn('</> Code', () => showCode()), btn('⬇️ Alles als ZIP', () => exportZip()));
  // brand info
  ui.info.replaceChildren(el('b', 'ds-label', 'Markenwerte'), el('p', 'ds-muted', s.concept || ''),
    (() => { const row = el('div', 'ds-swatches'); (s.palette || []).forEach((c) => { const sw = el('button', 'ds-swatch'); sw.type = 'button'; sw.style.background = c; sw.title = `${c} kopieren`; sw.append(el('span', '', c)); sw.addEventListener('click', () => navigator.clipboard?.writeText(c).then(() => ctx.toast(`${c} kopiert`)).catch(() => {})); row.append(sw); }); return row; })(),
    el('p', 'ds-muted', `Schriften: ${s.fonts?.title} · ${s.fonts?.text}`));
  // assets
  ui.grid.replaceChildren(...s.assets.map((a) => {
    const card = el('figure', `ds-asset${a.name === selected ? ' on' : ''}`);
    const frame = el('div', 'ds-frame');
    frame.style.aspectRatio = `${a.width} / ${a.height}`;
    const img = el('img');
    img.alt = a.label;
    frame.append(img);
    if (!a.svg) frame.append(el('p', 'ds-muted', 'fehlt'));
    const cap = el('figcaption');
    cap.append(el('b', '', a.label), el('small', '', `${a.width} × ${a.height}`));
    const actions = el('div', 'ds-asset-actions');
    actions.append(btn('SVG', () => download(a, 'svg')), btn('PNG', () => download(a, 'png', 1)), btn('PNG 2×', () => download(a, 'png', 2)));
    card.append(frame, cap, actions);
    card.addEventListener('click', (e) => { if (e.target.closest('button')) return; selected = a.name; ui.grid.querySelectorAll('.ds-asset').forEach((c) => c.classList.remove('on')); card.classList.add('on'); if (!ui.code.hidden) showCode(); });
    if (a.svg) finalSvg(a, s).then((svg) => { img.src = svgUrl(svg); });
    return card;
  }));
  renderQa(s.qa?.issues || [], null);
  if (checkAfter) {
    const found = await browserCheck(s).catch(() => []);
    renderQa(s.qa?.issues || [], found);
    const serious = [...(s.qa?.issues || []).filter((i) => i.level === 'fehler').map((i) => i.text), ...found];
    if (serious.length && !repaired) { repaired = true; runEdit('reparieren', '', serious); } else repaired = false;
  }
}

function renderQa(serverIssues, browserIssues) {
  const lines = [...serverIssues.map((i) => `${i.level === 'fehler' ? '✖' : i.level === 'warnung' ? '•' : 'ℹ'} ${i.text}`), ...(browserIssues || []).map((t) => `✖ ${t}`)];
  ui.qa.replaceChildren(el('b', '', browserIssues === null ? 'Prüfung (Server) …' : lines.length ? `Prüfung: ${lines.length} Hinweis(e)` : '✓ Prüfung bestanden: Struktur, Sicherheit, Schriften, Kontrast, Text im Bild, nicht leer'), ...lines.slice(0, 8).map((l) => el('span', '', l)));
  ui.qa.dataset.state = lines.some((l) => l.startsWith('✖')) ? 'bad' : lines.length ? 'warn' : browserIssues === null ? '' : 'ok';
}

function showCode() {
  const a = set()?.assets.find((x) => x.name === selected) || set()?.assets[0];
  if (!a) return;
  ui.code.hidden = !ui.code.hidden && ui.code.dataset.asset === a.name;
  ui.code.dataset.asset = a.name;
  ui.code.textContent = a.svg;
}

async function download(a, kind, scale = 1) {
  const s = set();
  const svg = await finalSvg(a, s);
  const blob = kind === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await toPng(svg, a.width, a.height, scale);
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `${slug(s.name)}-${a.name}${kind === 'png' && scale > 1 ? `@${scale}x` : ''}.${kind}` });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportZip() {
  const s = set();
  setBusy('ZIP wird gepackt …');
  try {
    const files = [];
    for (const a of s.assets.filter((x) => x.svg)) {
      const svg = await finalSvg(a, s);
      files.push({ path: `svg/${a.name}.svg`, content: svg });
      files.push({ path: `png/${a.name}.png`, content: new Uint8Array(await (await toPng(svg, a.width, a.height, 1)).arrayBuffer()) });
    }
    const guide = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${s.name} – Markenleitfaden</title><style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:#111}.sw{display:inline-block;width:120px;margin:6px;border-radius:12px;overflow:hidden;border:1px solid #ddd}.sw div{height:80px}.sw p{margin:6px;font:600 13px monospace}img{max-width:100%;border:1px solid #eee;border-radius:8px;margin:8px 0}</style></head><body><h1>${s.name}</h1><p>${s.concept || ''}</p><h2>Farben</h2>${(s.palette || []).map((c) => `<span class="sw"><div style="background:${c}"></div><p>${c}</p></span>`).join('')}<h2>Schriften</h2><p>Titel: <b>${s.fonts?.title}</b> · Text: <b>${s.fonts?.text}</b> (Google Fonts, kostenlos)</p><h2>Dateien</h2>${s.assets.filter((a) => a.svg).map((a) => `<h3>${a.label} (${a.width}×${a.height})</h3><img src="png/${a.name}.png" alt="${a.label}">`).join('')}<p><small>Erstellt mit dem Jarvis Design Studio.</small></p></body></html>`;
    files.push({ path: 'markenleitfaden.html', content: guide });
    files.push({ path: 'README.md', content: `# ${s.name}\n\n${s.concept || ''}\n\n- svg/: Vektordateien (beliebig skalierbar, Schriften eingebettet)\n- png/: Bilddateien in Originalgröße\n- markenleitfaden.html: Farben, Schriften und Übersicht\n\nFarben: ${(s.palette || []).join(', ')}\nSchriften: ${s.fonts?.title}, ${s.fonts?.text}\n` });
    const url = URL.createObjectURL(makeZip(files));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${slug(s.name)}-design.zip` });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (error) {
    ctx.toast(error.message, 'error');
  } finally {
    setBusy('');
  }
}

// --- voice assistant ----------------------------------------------------------------------------
export function handleDesignMessage(message) {
  build();
  if (message.type === 'design_open') {
    openDesign(message.set ? 'graphics' : 'hub');
    if (message.set) {
      const s = message.set;
      if (message.replace && current) {
        current.versions.push({ ...s, note: message.note || 'Geändert', at: Date.now() });
        current.versions = current.versions.slice(-10);
        current.active = current.versions.length - 1;
      } else {
        current = { id: Math.random().toString(36).slice(2, 10), name: s.name, versions: [{ ...s, note: 'Erstellt', at: Date.now() }], active: 0, updatedAt: Date.now() };
      }
      selected = s.assets[0]?.name;
      saveProject();
      renderProjects();
      renderSet(true);
    }
  }
}

export function initDesign(options) {
  ctx = { ...ctx, ...options };
  document.getElementById('design-button')?.addEventListener('click', () => openDesign('hub'));
  // keep the server informed about the open design (for voice changes)
  let sent = '';
  setInterval(() => {
    const key = current ? `${current.id}:${current.active}:${current.versions.length}` : '';
    if (key && key !== sent && ctx.send({ type: 'design_current', set: set() })) sent = key;
  }, 3000);
}
