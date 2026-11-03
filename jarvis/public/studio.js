// Jarvis Studio: live preview (desktop/tablet/mobile/fullscreen), automatic
// quality check with self-repair, versions, project dashboard and ZIP export.
// Projects are kept in the browser's IndexedDB (durable on this device) and
// can always be exported.
import { buildPreview, makeZip } from './projects.js';
import { runQualityAgent } from './studio-qa.js';

const $ = (id) => document.getElementById(id);
const els = {
  overlay: $('studio-overlay'), frame: $('studio-frame'), stage: $('studio-stage'), title: $('studio-title'), meta: $('studio-meta'),
  close: $('studio-close'), prompt: $('studio-prompt'), devices: document.querySelectorAll('[data-device]'), full: $('studio-full'),
  reload: $('studio-reload'), zip: $('studio-zip'), versions: $('studio-versions'), dash: $('studio-dash'), dashPanel: $('studio-dashboard'),
  dashList: $('studio-dash-list'), dashClose: $('studio-dash-close'), progress: $('studio-progress'), qa: $('studio-qa'), newBtn: $('studio-new'),
  upgrade: $('studio-upgrade'), code: $('studio-code'), review: $('studio-review'), codeview: $('studio-codeview'), codeTabs: $('studio-code-tabs'), codePre: $('studio-code-pre')
};

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src https://image.pollinations.ai data: blob:; media-src data: blob:; connect-src 'none'";
let notify = () => {};
let send = () => false;
let current = null; // { id, title, versions: [{ at, note, files, plan }], active }
let qaRound = 0;
let autoFix = false; // only right after Jarvis built or changed something

// --- Storage (IndexedDB) ----------------------------------------------------------
function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jarvis-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function store(mode, fn) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('projects', mode);
    const result = fn(tx.objectStore('projects'));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
  });
}
const listProjects = async () => (await store('readonly', (s) => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt);
const saveProject = (project) => store('readwrite', (s) => s.put({ ...project, updatedAt: Date.now() }));
const deleteProject = (id) => store('readwrite', (s) => s.delete(id));

const version = () => current?.versions[current.active];
const asProject = () => current && { title: current.title, kind: 'website', description: '', files: version().files, plan: version().plan };

// --- Preview & quality agent ---------------------------------------------------------
const MAX_ROUNDS = 3;
let qaToken = 0;
let qaHistory = [];
let lastReport = null;
function render(fixAllowed = false) {
  if (!current) return;
  autoFix = fixAllowed;
  const v = version();
  els.title.textContent = current.title;
  els.meta.textContent = `Version ${current.active + 1} von ${current.versions.length} · ${new Date(v.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${v.note ? ` · ${v.note}` : ''}`;
  els.frame.srcdoc = buildPreview(asProject(), { csp: CSP });
  runQA(fixAllowed);
  els.versions.replaceChildren(...current.versions.map((ver, i) => new Option(`V${i + 1} · ${ver.note || 'Version'}`, String(i))).reverse());
  els.versions.value = String(current.active);
  send({ type: 'studio_current', project: asProject() });
  showReview(v.review);
  if (!els.codeview.hidden) renderCode();
}

function showReview(review) {
  if (!review) { els.review.hidden = true; return; }
  els.review.hidden = false;
  els.review.dataset.state = review.ok ? (review.issues.length ? 'warn' : 'ok') : 'bad';
  els.review.textContent = review.issues.length ? `Design-Prüfung: ${review.issues.map((i) => `${i.level === 'fehler' ? '✖' : '•'} ${i.text}`).join('  ')}` : `✓ Design-Prüfung bestanden${review.contrast ? ` (Textkontrast ${String(review.contrast).replace('.', ',')}:1)` : ''}`;
}

// Read-only code view of the current version.
let codeFile = 'index.html';
function renderCode() {
  const files = version()?.files || [];
  if (!files.some((f) => f.path === codeFile)) codeFile = files[0]?.path || '';
  els.codeTabs.replaceChildren(...files.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctrl';
    b.textContent = `${f.path} · ${(f.content.length / 1024).toFixed(1).replace('.', ',')} KB`;
    b.setAttribute('aria-pressed', String(f.path === codeFile));
    b.addEventListener('click', () => { codeFile = f.path; renderCode(); });
    return b;
  }), Object.assign(document.createElement('button'), { type: 'button', className: 'ctrl', textContent: 'Kopieren', onclick: () => navigator.clipboard?.writeText(files.find((f) => f.path === codeFile)?.content || '').then(() => notify('Code kopiert')).catch(() => {}) }));
  els.codePre.textContent = files.find((f) => f.path === codeFile)?.content || '';
}

// Quality agent: tests the site in real browser frames, shows the report and
// lets Jarvis repair it – up to MAX_ROUNDS rounds, stops when nothing improves.
async function runQA(fixAllowed) {
  const token = ++qaToken;
  const project = asProject();
  if (!project) return;
  if (!fixAllowed) { qaRound = 0; qaHistory = []; }
  els.qa.dataset.state = 'running';
  els.qa.textContent = qaRound ? `Teste erneut (Runde ${qaRound + 1}) …` : 'Qualitäts-Agent testet die Website …';
  let report;
  try {
    report = await runQualityAgent(project, { buildPreview, csp: CSP, onStatus: (t) => { if (token === qaToken) els.qa.textContent = `${qaRound ? `Runde ${qaRound + 1}: ` : ''}${t}`; } });
  } catch (error) {
    if (token !== qaToken) return;
    els.qa.dataset.state = 'warn'; els.qa.textContent = `Qualitäts-Test nicht möglich: ${error.message}`; return;
  }
  if (token !== qaToken) return;
  lastReport = report;
  const v = version(); if (v) { v.qa = { passed: report.passed, score: report.score, errors: report.errors, hints: report.hints, problems: report.problems.slice(0, 30), vision: report.vision?.available ? { score: report.vision.score, good: report.vision.good } : null, at: report.testedAt }; saveProject(current).catch(() => {}); }
  showReport(report);
  qaHistory.push(report.errors);
  const errors = report.problems.filter((p) => p.level === 'fehler');
  if (report.passed) {
    els.qa.dataset.state = 'ok';
    els.qa.textContent = `✓ Qualitäts-Agent: bestanden · Note ${String(report.score).replace('.', ',')}/10${report.vision?.available ? ` · Design ${report.vision.score}/10` : ''}${qaRound ? ` · nach ${qaRound} Reparatur${qaRound > 1 ? 'en' : ''}` : ''}`;
    qaRound = 0; autoFix = false;
    return;
  }
  const improving = qaHistory.length < 2 || qaHistory[qaHistory.length - 1] < qaHistory[qaHistory.length - 2];
  if (autoFix && qaRound < MAX_ROUNDS && improving && (errors.length || report.vision?.available)) {
    qaRound += 1;
    els.qa.dataset.state = 'warn';
    els.qa.textContent = `⚠ ${report.errors} Fehler, Note ${String(report.score).replace('.', ',')}/10 – Jarvis repariert (Runde ${qaRound} von ${MAX_ROUNDS}) …`;
    const list = [...errors, ...report.problems.filter((p) => p.level !== 'fehler')].slice(0, 20).map((p) => p.text);
    runJob('fix', { project, problems: list }, `Automatische Reparatur ${qaRound}`);
    return;
  }
  els.qa.dataset.state = 'warn';
  const why = !improving ? 'nicht automatisch behebbar (keine Verbesserung mehr)' : qaRound >= MAX_ROUNDS ? `nach ${MAX_ROUNDS} Reparatur-Runden noch offen` : 'offen';
  els.qa.textContent = `⚠ Qualitäts-Agent: ${report.errors} Fehler, ${report.hints} Hinweis(e) ${why} · Note ${String(report.score).replace('.', ',')}/10`;
  qaRound = 0; autoFix = false;
}

function showReport(r) {
  let box = document.getElementById('studio-qareport');
  if (!box) { box = document.createElement('details'); box.id = 'studio-qareport'; box.className = 'studio-qareport'; els.qa.after(box); }
  const d = r.desktop || {}; const m = r.mobile || {};
  const row = (ok, label, detail = '') => `<li class="${ok === null ? 'na' : ok ? 'ok' : 'bad'}"><b>${ok === null ? '–' : ok ? '✓' : '✖'}</b> ${label}${detail ? ` <small>${detail}</small>` : ''}</li>`;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cart = d.cart;
  const checks = [
    row(!(d.errors?.length || m.errors?.length), 'Konsole ohne Fehler', d.errors?.length ? esc(d.errors[0]) : ''),
    row((d.pages || []).every((p) => p.text >= 40 && p.visible), `Seiten (${(d.pages || []).length}) laden und haben Inhalt`),
    row(!(d.dead || []).length, `Alle Knöpfe funktionieren`, (d.dead || []).length ? `${d.dead.length} ohne Wirkung` : ''),
    row(!(d.deadLinks || []).length, 'Keine toten Links', (d.deadLinks || []).length ? `${d.deadLinks.length} tot` : ''),
    row((d.forms || []).length ? d.forms.every((f) => f.validates && f.succeeds) : null, `Formulare prüfen Eingaben${(d.forms || []).length ? ` (${d.forms.length})` : ''}`),
    row(cart ? cart.add && cart.open && cart.plus && cart.remove && cart.detail !== false : null, 'Warenkorb & Produktseite'),
    row(d.search === null || d.search === undefined ? null : d.search, 'Suche'),
    row(d.filter === null || d.filter === undefined ? null : d.filter, 'Kategorie-Filter'),
    row(m.menu ? m.menu.ok : null, 'Handy-Menü', m.menu ? esc(m.menu.note) : ''),
    row(!(d.layout || []).concat(m.layout || []).some((t) => /breiter|ragt/.test(t)), 'Layout Desktop + Handy ohne Überlauf'),
    row(!((d.images?.broken || []).length), `Bilder laden (${d.images?.total || 0})`),
    row(r.vision?.available ? r.vision.score >= 7 : null, `Design-Bewertung per Screenshot${r.vision?.available ? ` · ${r.vision.score}/10` : ''}`, r.vision?.available ? esc(r.vision.good || '') : esc(r.vision?.note || ''))
  ];
  box.innerHTML = `<summary>Prüfbericht · Note ${String(r.score).replace('.', ',')}/10 · ${r.errors} Fehler · ${r.hints} Hinweis(e)</summary>${r.image ? `<img class="studio-qashot" src="${r.image}" alt="Screenshots Desktop und Handy">` : ''}<ul class="studio-qachecks">${checks.join('')}</ul>${r.problems.length ? `<ol class="studio-qaproblems">${r.problems.slice(0, 20).map((p) => `<li class="${p.level}">${esc(p.text)}</li>`).join('')}</ol>` : ''}`;
}

// --- Jobs --------------------------------------------------------------------------------
function showProgress(lines, active = true) {
  els.progress.hidden = !active;
  els.progress.replaceChildren(...lines.map((line, i) => {
    const p = document.createElement('p');
    p.textContent = `${i === lines.length - 1 && active ? '⏳' : '✓'} ${line}`;
    return p;
  }));
}

async function poll(id, note, label) {
  const lines = [label];
  showProgress(lines);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(`/api/studio?id=${id}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler');
    showProgress([label, ...data.steps]);
    if (data.status === 'fehler') throw new Error(data.error);
    if (data.status === 'fertig') {
      showProgress([], false);
      return data.result;
    }
  }
}

async function runJob(kind, body, note) {
  try {
    const response = await fetch('/api/studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, ...body }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler');
    await followJob(data.id, kind, body.prompt, note);
  } catch (error) {
    showProgress([], false);
    notify(error.message, 'error');
  }
}

export async function followJob(id, kind, prompt, note) {
  openStudio();
  try {
    const result = await poll(id, note, kind === 'build' ? `Neue Website: ${prompt || ''}` : kind === 'fix' ? 'Automatische Reparatur' : kind === 'upgrade' ? 'Design hochwertiger machen' : `Änderung: ${prompt || ''}`);
    if (kind === 'build' || !current) {
      current = { id: Math.random().toString(36).slice(2, 10), title: result.title, versions: [], active: 0 };
      qaRound = 0;
    }
    current.versions.push({ at: Date.now(), note: kind === 'build' ? 'Erstellt' : kind === 'fix' ? 'Automatisch repariert' : kind === 'upgrade' || result.upgraded ? 'Hochwertiger gestaltet' : String(prompt || note || 'Änderung').slice(0, 40), files: result.files, plan: result.plan || version()?.plan, review: result.designReview || null });
    current.versions = current.versions.slice(-15);
    current.active = current.versions.length - 1;
    await saveProject(current);
    render(kind !== 'fix' || qaRound > 0);
  } catch (error) {
    showProgress([], false);
    notify(error.message, 'error');
  }
}

// --- UI --------------------------------------------------------------------------------
function openStudio() {
  els.overlay.hidden = false;
}

async function renderDashboard() {
  const projects = await listProjects().catch(() => []);
  els.dashList.replaceChildren(...(projects.length ? projects.map((p) => {
    const row = document.createElement('div');
    row.className = 'studio-proj';
    const info = document.createElement('div');
    info.innerHTML = `<b></b><small></small>`;
    info.querySelector('b').textContent = p.title;
    info.querySelector('small').textContent = `${p.versions.length} Version(en) · zuletzt ${new Date(p.updatedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    const actions = document.createElement('div');
    actions.className = 'studio-proj-actions';
    const button = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ctrl'; b.textContent = label; b.addEventListener('click', fn); return b; };
    actions.append(
      button('Öffnen', () => { current = p; els.dashPanel.hidden = true; render(); }),
      button('Umbenennen', async () => { const name = prompt('Neuer Name:', p.title); if (name?.trim()) { p.title = name.trim().slice(0, 60); await saveProject(p); if (current?.id === p.id) current.title = p.title; renderDashboard(); } }),
      button('Löschen', async () => { if (confirm(`„${p.title}“ löschen?`)) { await deleteProject(p.id); if (current?.id === p.id) current = null; renderDashboard(); } })
    );
    row.append(info, actions);
    return row;
  }) : [Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Noch keine Websites. Sag z. B. „Erstelle mir einen modernen Online-Shop für eine Luxus-Kleidungsmarke“.' })]));
}

export function initStudio({ toast, send: sender }) {
  notify = toast;
  send = sender;
  $('studio-button').addEventListener('click', async () => {
    openStudio();
    if (!current) {
      const [latest] = await listProjects().catch(() => []);
      if (latest) { current = latest; render(); } else { els.dashPanel.hidden = false; renderDashboard(); }
    }
  });
  els.close.addEventListener('click', () => { els.overlay.hidden = true; document.exitFullscreen?.().catch(() => {}); });
  els.devices.forEach((b) => b.addEventListener('click', () => {
    els.stage.dataset.device = b.dataset.device;
    els.devices.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  els.full.addEventListener('click', () => (els.stage.requestFullscreen ? els.stage.requestFullscreen() : els.stage.classList.toggle('studio-fake-full')));
  els.reload.addEventListener('click', render);
  els.upgrade.addEventListener('click', () => {
    if (!current) { notify('Erstelle zuerst eine Website.', 'error'); return; }
    runJob('upgrade', { prompt: 'Design hochwertiger machen', project: asProject() }, 'Hochwertiger gestaltet');
  });
  els.code.addEventListener('click', () => {
    els.codeview.hidden = !els.codeview.hidden;
    els.code.setAttribute('aria-pressed', String(!els.codeview.hidden));
    if (!els.codeview.hidden) renderCode();
  });
  els.zip.addEventListener('click', () => {
    if (!current) return;
    const readme = { path: 'README.md', content: `# ${current.title}\n\nErstellt mit Jarvis Studio.\n\n## Starten\n- Einfach \`index.html\` im Browser öffnen, oder\n- im Ordner \`npx serve\` ausführen und die angezeigte Adresse öffnen.\n\n## Veröffentlichen\nDen Ordner z. B. bei Netlify (Drag & Drop), GitHub Pages oder Cloudflare Pages hochladen.\n\nHinweis: Warenkorb und Kasse sind eine Demo ohne echte Zahlung. Für echte Zahlungen z. B. Stripe oder einen Shop-Dienst anbinden.\n` };
    const url = URL.createObjectURL(makeZip([...version().files, readme]));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${current.title.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^\w-]+/g, '-')}.zip` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  els.versions.addEventListener('change', async () => {
    if (!current) return;
    current.active = Number(els.versions.value);
    await saveProject(current);
    render();
  });
  els.dash.addEventListener('click', () => { els.dashPanel.hidden = false; renderDashboard(); });
  els.dashClose.addEventListener('click', () => { els.dashPanel.hidden = true; });
  els.newBtn.addEventListener('click', () => { current = null; els.dashPanel.hidden = true; els.frame.srcdoc = ''; els.title.textContent = 'Neue Website'; els.meta.textContent = 'Beschreib unten, was Jarvis bauen soll.'; els.qa.textContent = ''; els.prompt.querySelector('input').focus(); });
  els.prompt.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = els.prompt.querySelector('input');
    const wish = input.value.trim();
    if (!wish) return;
    input.value = '';
    if (current) runJob('edit', { prompt: wish, project: asProject() }, wish);
    else runJob('build', { prompt: wish }, wish);
  });
}
