// Dashboard of the autonomous money mode. Talks to /api/money over HTTP, so it
// works without starting a voice conversation. The device keeps a copy of all
// data, because the free server forgets everything when it restarts.
const STORE_KEY = 'jarvis.money';
const POLL_MS = 5000;
const $ = (id) => document.getElementById(id);

const els = {
  modal: $('money-modal'),
  close: $('money-close'),
  body: $('money-body'),
  enabled: $('money-enabled'),
  enabledText: $('money-enabled-text'),
  goal: $('money-goal'),
  restart: $('money-new')
};

let overview = null;
let shownVersion = -1;
let pollTimer = null;
let viewing = null; // product id whose text is shown
let notify = () => {};

function loadLocal() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return value && typeof value.version === 'number' && value.state ? value : null;
  } catch {
    return null;
  }
}

function saveLocal(version, state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version, state }));
  } catch {
    // storage full or blocked: the server copy still works
  }
}

async function api(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Fehler ${response.status}`);
  return data;
}

// Brings device and server to the newest copy.
export async function syncMoney() {
  let data = await api('/api/money');
  const local = loadLocal();
  if (local && local.version > data.version) {
    await api('/api/money/restore', { state: local.state, version: local.version });
    data = await api('/api/money');
  } else if (data.version > 0 && (!local || data.version > local.version)) {
    const full = await api('/api/money/full');
    saveLocal(full.version, full.state);
  }
  overview = data;
  return data;
}

async function command(action, args = {}) {
  try {
    const result = await api('/api/money/command', { action, ...args });
    if (result.message) notify(result.message);
    await refresh(true);
    return result;
  } catch (error) {
    notify(error.message, 'error');
    return null;
  }
}

// --- Rendering helpers ---------------------------------------------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node[key] = value;
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

const button = (label, onclick, kind = '') => el('button', { type: 'button', class: `money-btn ${kind}`, textContent: label, onclick });
const section = (label) => el('h4', { class: 'planner-section', textContent: label });
const euro = (value) => `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
const when = (iso) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS_ICON = { offen: '○', laeuft: '⏳', erledigt: '✅', wartet: '🙋', fehler: '⚠️' };
const STATUS_TEXT = { offen: 'geplant', laeuft: 'läuft gerade', erledigt: 'erledigt', wartet: 'wartet auf dich', fehler: 'Problem' };

function stat(label, value, sub, real = false) {
  return el('div', { class: `money-stat${real ? ' real' : ''}` }, el('small', { textContent: label }), el('b', { textContent: value }), sub ? el('em', { textContent: sub }) : null);
}

function download(product) {
  const type = { markdown: 'text/markdown', csv: 'text/csv', txt: 'text/plain', html: 'text/html' }[product.format] || 'text/plain';
  const url = URL.createObjectURL(new Blob([product.content], { type: `${type};charset=utf-8` }));
  const link = el('a', { href: url, download: product.filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function fullProduct(id) {
  return loadLocal()?.state.products.find((product) => product.id === id) || null;
}

function taskRow(task) {
  const actions = [];
  let input = null;
  if (task.status === 'wartet') {
    input = el('input', { type: 'url', placeholder: 'Shop-Link (optional), z. B. https://…gumroad.com/l/…' });
    actions.push(button('Erledigt', () => command('task_done', { id: task.id, link: input.value.trim() }), 'primary'));
    actions.push(button('Überspringen', () => command('task_skip', { id: task.id })));
  }
  if (task.status === 'fehler') actions.push(button('Nochmal', () => command('task_retry', { id: task.id })));
  return el('div', { class: 'money-task', dataset: { status: task.status } },
    el('span', { class: 'st', textContent: STATUS_ICON[task.status] || '○', title: STATUS_TEXT[task.status] }),
    el('div', {},
      el('b', { textContent: task.title }),
      el('small', { textContent: [STATUS_TEXT[task.status], task.status === 'wartet' ? task.detail : task.result].filter(Boolean).join(' · ') }),
      input),
    el('div', { class: 'row-actions' }, actions));
}

function render() {
  if (!overview) return;
  const { state, totals, tools, gumroad, gumroadError, waitingForDevice, origin } = overview;
  shownVersion = overview.version;
  els.enabled.checked = state.enabled;
  els.enabledText.textContent = state.enabled ? 'EIN – arbeitet selbstständig' : 'AUS';
  if (document.activeElement !== els.goal && !els.goal.value) els.goal.placeholder = state.goal ? `Auftrag: ${state.goal}` : 'Auftrag (optional), z. B. „digitale Vorlagen für Studenten“';

  const project = state.projects.find((p) => p.id === state.activeProjectId) || null;
  const tasks = project?.tasks || [];
  const done = tasks.filter((t) => t.status === 'erledigt').length;
  const body = [];

  if (waitingForDevice) body.push(el('p', { class: 'money-note', textContent: 'Der Server wurde neu gestartet. Die Daten werden von diesem Gerät zurückgeholt …' }));
  if (!tools.find((t) => t.name.startsWith('KI'))?.ok) body.push(el('p', { class: 'money-note', textContent: 'Damit Jarvis selbstständig arbeiten kann, fehlt noch ein KI-Schlüssel: GROQ_API_KEY (kostenlos bei console.groq.com) bei Render eintragen. Anleitung im README.' }));

  body.push(el('div', { class: 'money-stats' },
    stat('Echte Einnahmen', euro(totals.manualEur), `diesen Monat ${euro(totals.monthEur)} · von dir eingetragen`, true),
    stat('Gumroad', totals.gumroadUsd === null ? '–' : `${totals.gumroadUsd.toFixed(2)} $`, totals.gumroadUsd === null ? (gumroadError || 'nicht verbunden') : `${totals.gumroadSales} Verkäufe · echte Daten`, true),
    stat('Geschätzt', project?.estimate.high ? `${project.estimate.low}–${project.estimate.high} €` : '–', 'pro Monat · Schätzung der KI, kein echtes Geld'),
    stat('Aufgaben', tasks.length ? `${done}/${tasks.length}` : '–', project ? project.title : 'kein Projekt'),
    stat('Produkte', String(state.products.filter((p) => p.kind === 'produkt').length), `${state.products.length} Dateien insgesamt`),
    stat('Verkaufsseiten', String(state.pages.length), project?.buyLink ? 'mit Shop-Link' : 'Shop-Link fehlt noch')));
  if (tasks.length) body.push(el('div', { class: 'money-progress', title: 'Fortschritt' }, el('span', { style: `width:${Math.round((done / tasks.length) * 100)}%` })));

  const waiting = state.projects.flatMap((p) => p.tasks.filter((t) => t.status === 'wartet'));
  if (waiting.length) {
    body.push(section(`Wartet auf dich (${waiting.length})`));
    body.push(...waiting.map(taskRow));
  }

  body.push(section('Laufendes Projekt'));
  if (!project) {
    body.push(el('p', { class: 'empty', textContent: 'Noch kein Projekt. Schalte den Modus ein oder sag „Jarvis, verdien Geld für mich“.' }));
  } else {
    body.push(el('div', { class: 'planner-row' }, el('div', {},
      el('b', { textContent: project.title }),
      el('small', { textContent: project.summary || 'Wird gerade analysiert …' }),
      project.why ? el('small', { textContent: `Warum: ${project.why}` }) : null,
      project.estimate.basis ? el('small', { textContent: `Schätzung: ${project.estimate.basis}` }) : null,
      project.options.length ? el('small', { textContent: `Geprüfte Möglichkeiten: ${project.options.map((o) => `${o.title} (${o.score}/10)`).join(' · ')}` }) : null,
      project.lessons.length ? el('small', { textContent: `Gelernt: ${project.lessons.slice(-3).join(' · ')}` }) : null),
    el('div', { class: 'row-actions' }, state.enabled ? button('Nächster Schritt jetzt', () => command('run_now')) : null)));
    body.push(...tasks.filter((t) => t.status !== 'wartet').map(taskRow));
  }

  body.push(section('Erstellte Produkte & Texte'));
  if (!state.products.length) body.push(el('p', { class: 'empty', textContent: 'Noch nichts erstellt.' }));
  for (const product of [...state.products].reverse()) {
    const row = el('div', { class: 'planner-row' },
      el('div', {}, el('b', { textContent: `${{ produkt: '📦', marketing: '📣', recherche: '🔎' }[product.kind] || '📄'} ${product.title}` }),
        el('small', { textContent: [product.price && `Preisvorschlag ${product.price}`, product.filename, `${Math.round(product.size / 100) / 10} k Zeichen`, when(product.createdAt)].filter(Boolean).join(' · ') })),
      el('div', { class: 'row-actions' },
        button(viewing === product.id ? 'Zu' : 'Ansehen', () => { viewing = viewing === product.id ? null : product.id; render(); }),
        button('Download', () => { const full = fullProduct(product.id); if (full) download(full); else notify('Datei noch nicht auf diesem Gerät – kurz warten.', 'error'); }),
        button('✕', () => confirm(`„${product.title}“ löschen?`) && command('product_delete', { id: product.id }), 'danger')));
    body.push(row);
    if (viewing === product.id) body.push(el('pre', { class: 'money-viewer', textContent: fullProduct(product.id)?.content || 'Lädt …' }));
  }

  body.push(section('Verkaufsseiten'));
  if (!state.pages.length) body.push(el('p', { class: 'empty', textContent: 'Noch keine Verkaufsseite.' }));
  for (const page of [...state.pages].reverse()) {
    const url = `${origin || location.origin}${page.path}`;
    body.push(el('div', { class: 'planner-row' },
      el('div', {}, el('b', { textContent: `🌐 ${page.title}` }), el('small', { textContent: `öffentlich teilbar · ${when(page.createdAt)}` })),
      el('div', { class: 'row-actions' },
        el('a', { class: 'money-btn', href: url, target: '_blank', rel: 'noopener', textContent: 'Öffnen' }),
        button('Link kopieren', () => navigator.clipboard?.writeText(url).then(() => notify('Link kopiert.'), () => notify('Kopieren nicht möglich.', 'error'))),
        button('✕', () => confirm(`Seite „${page.title}“ löschen?`) && command('page_delete', { id: page.id }), 'danger'))));
  }

  if (gumroad?.products.length) {
    body.push(section('Gumroad-Produkte (echte Daten)'));
    for (const product of gumroad.products) {
      body.push(el('div', { class: 'planner-row' },
        el('div', {}, el('b', { textContent: product.name }), el('small', { textContent: `${product.published ? 'veröffentlicht' : 'nicht veröffentlicht'} · ${product.price} · ${product.sales} Verkäufe · ${product.revenueUsd.toFixed(2)} $` })),
        el('div', { class: 'row-actions' }, product.url ? el('a', { class: 'money-btn', href: product.url, target: '_blank', rel: 'noopener', textContent: 'Öffnen' }) : null)));
    }
  }

  body.push(section('Einnahmen eintragen'));
  const amount = el('input', { type: 'text', inputMode: 'decimal', placeholder: 'Betrag in €' });
  const source = el('input', { type: 'text', placeholder: 'Woher? (z. B. Etsy)' });
  body.push(el('div', { class: 'money-income' }, amount, source, button('Eintragen', () => command('income_add', { amount: Number(amount.value.replace(',', '.')), source: source.value }), 'primary')));
  for (const entry of [...state.income].reverse().slice(0, 15)) {
    body.push(el('div', { class: 'planner-row' }, el('div', {}, el('b', { textContent: `${euro(entry.amount)} · ${entry.source}` }), el('small', { textContent: `${entry.date}${entry.note ? ` · ${entry.note}` : ''}` })),
      el('div', { class: 'row-actions' }, button('✕', () => confirm('Einnahme löschen?') && command('income_remove', { id: entry.id }), 'danger'))));
  }

  const others = state.projects.filter((p) => p.id !== state.activeProjectId);
  if (others.length) {
    body.push(section('Weitere Projekte'));
    for (const other of [...others].reverse()) {
      const doneCount = other.tasks.filter((t) => t.status === 'erledigt').length;
      body.push(el('div', { class: 'planner-row' }, el('div', {}, el('b', { textContent: other.title }), el('small', { textContent: `${other.status} · ${doneCount}/${other.tasks.length} Aufgaben` })),
        el('div', { class: 'row-actions' }, button('Fortsetzen', () => command('project_activate', { id: other.id })), button('✕', () => confirm(`Projekt „${other.title}“ mit allen Dateien löschen?`) && command('project_delete', { id: other.id }), 'danger'))));
    }
  }

  body.push(section('API- & Tool-Status'));
  body.push(el('div', { class: 'money-tools' }, tools.map((tool) => el('div', { class: 'money-tool', dataset: { ok: String(tool.ok) }, textContent: `${tool.name}: ${tool.detail}` }))));

  body.push(section('Aufgabenprotokoll'));
  body.push(state.log.length ? el('ul', { class: 'money-log' }, [...state.log].reverse().slice(0, 40).map((entry) => el('li', { textContent: `${when(entry.at)} – ${entry.text}` }))) : el('p', { class: 'empty', textContent: 'Noch keine Einträge.' }));

  const scroll = els.body.scrollTop;
  els.body.replaceChildren(...body);
  els.body.scrollTop = scroll;
}

async function refresh(force = false) {
  try {
    await syncMoney();
    // Do not re-render while the user is typing in the dashboard.
    const typing = els.body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (force || (overview.version !== shownVersion && !typing)) render();
  } catch (error) {
    if (force) els.body.replaceChildren(el('p', { class: 'money-note', textContent: `Dashboard nicht erreichbar: ${error.message}` }));
  }
}

export function showMoney() {
  els.modal.hidden = false;
  refresh(true);
  clearInterval(pollTimer);
  pollTimer = setInterval(() => refresh(), POLL_MS);
}

function hideMoney() {
  els.modal.hidden = true;
  clearInterval(pollTimer);
}

export function initMoney({ toast }) {
  notify = toast;
  $('money-button').addEventListener('click', showMoney);
  els.close.addEventListener('click', hideMoney);
  els.modal.addEventListener('click', (event) => {
    if (event.target === els.modal) hideMoney();
  });
  els.enabled.addEventListener('change', () => {
    command(els.enabled.checked ? 'start' : 'stop', els.enabled.checked ? { goal: els.goal.value.trim() } : {});
  });
  els.restart.addEventListener('click', () => {
    const goal = els.goal.value.trim();
    if (!goal) {
      notify('Schreib zuerst einen Auftrag ins Feld, z. B. „Etsy-Planer für Eltern“.', 'error');
      return;
    }
    command('start', { goal }).then(() => { els.goal.value = ''; });
  });
  // Give the server its data back after a restart, and keep a fresh copy here.
  syncMoney().catch(() => {});
  setInterval(() => {
    if (els.modal.hidden && document.visibilityState === 'visible') syncMoney().catch(() => {});
  }, 60_000);
}
