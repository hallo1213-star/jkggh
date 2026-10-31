// Data of the autonomous money mode: projects with their tasks, the products
// and sales pages Jarvis created, real income and the work log. Everything is
// validated here because devices send copies back to the server.
import { randomUUID } from 'node:crypto';

export const TASK_TYPES = ['analyse', 'recherche', 'produkt', 'verkaufsseite', 'marketing', 'nutzer', 'auswertung'];
export const TASK_STATUSES = ['offen', 'laeuft', 'erledigt', 'wartet', 'fehler'];
export const PRODUCT_FORMATS = ['markdown', 'csv', 'txt', 'html'];
const LIMITS = { projects: 10, tasks: 40, products: 80, content: 40_000, pages: 40, income: 500, log: 200, lessons: 20 };

export const newId = () => randomUUID().replace(/-/g, '').slice(0, 10);
const validId = (value) => (typeof value === 'string' && /^[a-z0-9]{6,12}$/.test(value) ? value : newId());
export const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const line = (value, max) => clip(value, max).replace(/\s+/g, ' ');
const iso = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString());
const day = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? value : null);
const money = (value) => Math.round(Math.max(Number(value) || 0, 0) * 100) / 100;
const httpsLink = (value) => {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:' ? url.href.slice(0, 500) : '';
  } catch {
    return '';
  }
};

function cleanTask(task) {
  const type = TASK_TYPES.includes(task?.type) ? task.type : null;
  const title = line(task?.title, 140);
  if (!type || !title) return null;
  return {
    id: validId(task.id),
    type,
    title,
    detail: clip(task.detail, 2000),
    status: TASK_STATUSES.includes(task.status) ? task.status : 'offen',
    result: clip(task.result, 600),
    attempts: Math.min(Math.max(Number(task.attempts) || 0, 0), 9),
    ...(task.doneAt ? { doneAt: iso(task.doneAt) } : {})
  };
}

function cleanProject(project) {
  const title = line(project?.title, 120);
  if (!title) return null;
  const estimate = project.estimate && typeof project.estimate === 'object' ? project.estimate : {};
  return {
    id: validId(project.id),
    title,
    summary: clip(project.summary, 1500),
    why: clip(project.why, 1000),
    status: ['aktiv', 'pausiert', 'fertig'].includes(project.status) ? project.status : 'aktiv',
    createdAt: iso(project.createdAt),
    estimate: { low: money(estimate.low), high: money(estimate.high), basis: clip(estimate.basis, 400) },
    buyLink: httpsLink(project.buyLink),
    options: (Array.isArray(project.options) ? project.options : []).slice(0, 6).map((option) => ({ title: line(option?.title, 100), score: Math.min(Math.max(Math.round(Number(option?.score) || 0), 0), 10), reason: clip(option?.reason, 400) })).filter((option) => option.title),
    lessons: (Array.isArray(project.lessons) ? project.lessons : []).map((lesson) => line(lesson, 300)).filter(Boolean).slice(-LIMITS.lessons),
    tasks: (Array.isArray(project.tasks) ? project.tasks : []).map(cleanTask).filter(Boolean).slice(0, LIMITS.tasks),
    ...(project.lastReview ? { lastReview: iso(project.lastReview) } : {})
  };
}

function cleanProduct(product) {
  const title = line(product?.title, 120);
  const content = clip(product?.content, LIMITS.content);
  if (!title || !content) return null;
  const format = PRODUCT_FORMATS.includes(product.format) ? product.format : 'markdown';
  const ext = { markdown: 'md', csv: 'csv', txt: 'txt', html: 'html' }[format];
  const base = line(product.filename, 60).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '-').replace(/^-+|-+$/g, '') || 'jarvis-produkt';
  return {
    id: validId(product.id),
    projectId: typeof product.projectId === 'string' ? product.projectId.slice(0, 12) : '',
    title,
    kind: ['produkt', 'marketing', 'recherche'].includes(product.kind) ? product.kind : 'produkt',
    format,
    filename: `${base}.${ext}`,
    description: clip(product.description, 600),
    price: line(product.price, 30),
    content,
    createdAt: iso(product.createdAt)
  };
}

function cleanPage(page) {
  const title = line(page?.title, 120);
  const path = typeof page?.path === 'string' && /^\/site\.html#[A-Za-z0-9_-]{10,60000}$/.test(page.path) ? page.path : null;
  if (!title || !path) return null;
  return { id: validId(page.id), projectId: typeof page.projectId === 'string' ? page.projectId.slice(0, 12) : '', title, path, site: page.site && typeof page.site === 'object' ? page.site : null, createdAt: iso(page.createdAt) };
}

function cleanIncome(entry) {
  const amount = money(String(entry?.amount ?? '').replace(',', '.'));
  if (!(amount > 0) || amount >= 1_000_000) return null;
  return { id: validId(entry.id), amount, source: line(entry.source, 80) || 'Sonstiges', note: line(entry.note, 200), date: day(entry.date) || new Date().toISOString().slice(0, 10) };
}

export function sanitizeMoney(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const projects = (Array.isArray(input.projects) ? input.projects : []).map(cleanProject).filter(Boolean).slice(-LIMITS.projects);
  const activeProjectId = projects.some((project) => project.id === input.activeProjectId) ? input.activeProjectId : null;
  const usage = input.usage && typeof input.usage === 'object' ? input.usage : {};
  return {
    enabled: input.enabled === true,
    goal: clip(input.goal, 600),
    activeProjectId,
    projects,
    products: (Array.isArray(input.products) ? input.products : []).map(cleanProduct).filter(Boolean).slice(-LIMITS.products),
    pages: (Array.isArray(input.pages) ? input.pages : []).map(cleanPage).filter(Boolean).slice(-LIMITS.pages),
    income: (Array.isArray(input.income) ? input.income : []).map(cleanIncome).filter(Boolean).slice(-LIMITS.income),
    log: (Array.isArray(input.log) ? input.log : []).map((entry) => ({ at: iso(entry?.at), text: line(entry?.text, 300) })).filter((entry) => entry.text).slice(-LIMITS.log),
    usage: { date: day(usage.date) || '', count: Math.max(Number(usage.count) || 0, 0) }
  };
}

export function addLog(state, text) {
  return { ...state, log: [...state.log, { at: new Date().toISOString(), text: line(text, 300) }].slice(-LIMITS.log) };
}

export function activeProject(state) {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

export function updateProject(state, id, change) {
  return { ...state, projects: state.projects.map((project) => (project.id === id ? cleanProject(typeof change === 'function' ? change(project) : { ...project, ...change }) || project : project)) };
}

export function updateTask(state, projectId, taskId, change) {
  return updateProject(state, projectId, (project) => ({ ...project, tasks: project.tasks.map((task) => (task.id === taskId ? { ...task, ...change } : task)) }));
}

export function addTasks(state, projectId, tasks) {
  return updateProject(state, projectId, (project) => ({ ...project, tasks: [...project.tasks, ...tasks.map((task) => ({ ...task, id: undefined, status: task.type === 'nutzer' ? 'wartet' : 'offen' }))] }));
}

// Starts the mode. A new goal (or no active project) opens a new project that
// begins with the analysis.
export function startMoney(state, goal) {
  let next = { ...state, enabled: true };
  const wanted = clip(goal, 600);
  const project = activeProject(next);
  if (!project || (wanted && wanted !== next.goal) || project.status === 'fertig') {
    const fresh = cleanProject({ title: 'Neue Einnahmequelle wird gesucht', tasks: [{ type: 'analyse', title: 'Möglichkeiten analysieren und die beste auswählen' }] });
    next = { ...next, goal: wanted || next.goal, projects: [...next.projects.map((p) => (p.id === next.activeProjectId && p.status === 'aktiv' ? { ...p, status: 'pausiert' } : p)), fresh].slice(-LIMITS.projects), activeProjectId: fresh.id };
    next = addLog(next, `Geld-Modus gestartet${wanted ? `: ${wanted}` : ''}`);
  } else {
    next = addLog(updateProject(next, project.id, { status: 'aktiv' }), 'Geld-Modus fortgesetzt');
  }
  return sanitizeMoney(next);
}

export function stopMoney(state) {
  return addLog({ ...state, enabled: false }, 'Geld-Modus ausgeschaltet');
}

export function addIncome(state, entry) {
  const income = cleanIncome(entry);
  if (!income) throw new Error('Bitte einen Betrag in Euro angeben (größer als 0).');
  return { state: addLog({ ...state, income: [...state.income, income].slice(-LIMITS.income) }, `Einnahme eingetragen: ${income.amount.toFixed(2).replace('.', ',')} € (${income.source})`), income };
}

// The user finished a "nutzer" task (e.g. uploaded the product to Gumroad). A
// shop link given here becomes the buy button of the project's sales pages.
export function completeUserTask(state, taskId, { link, note } = {}) {
  for (const project of state.projects) {
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) continue;
    let next = updateTask(state, project.id, taskId, { status: 'erledigt', doneAt: new Date().toISOString(), result: clip(note || (link ? `Link: ${link}` : 'Vom Nutzer erledigt'), 600) });
    const buyLink = httpsLink(link);
    if (buyLink) next = updateProject(next, project.id, { buyLink });
    return { state: addLog(next, `Erledigt (von dir): ${task.title}`), project, task, buyLink };
  }
  throw new Error('Diese Aufgabe gibt es nicht mehr.');
}

export function findTaskByTitle(state, query) {
  const wanted = String(query ?? '').trim().toLowerCase();
  const waiting = state.projects.flatMap((project) => project.tasks.filter((task) => task.status === 'wartet').map((task) => ({ project, task })));
  if (!wanted) return waiting.length === 1 ? waiting[0] : null;
  return waiting.find(({ task }) => task.id === query || task.title.toLowerCase().includes(wanted)) || null;
}

export function incomeTotals(state, gumroad) {
  const manual = state.income.reduce((sum, entry) => sum + entry.amount, 0);
  const month = new Date().toISOString().slice(0, 7);
  return {
    manualEur: Math.round(manual * 100) / 100,
    monthEur: Math.round(state.income.filter((entry) => entry.date.startsWith(month)).reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100,
    gumroadUsd: gumroad?.totalUsd ?? null,
    gumroadSales: gumroad?.totalSales ?? null
  };
}

// Short summary for voice answers and the compact Telegram backup.
export function summarizeMoney(state, gumroad) {
  const project = activeProject(state);
  const totals = incomeTotals(state, gumroad);
  const tasks = project?.tasks || [];
  return {
    modus: state.enabled ? 'an' : 'aus',
    auftrag: state.goal || null,
    projekt: project ? { titel: project.title, status: project.status, schaetzung: project.estimate.high ? `${project.estimate.low}–${project.estimate.high} € pro Monat (Schätzung der KI, keine echten Einnahmen)` : null } : null,
    aufgaben: { erledigt: tasks.filter((t) => t.status === 'erledigt').length, offen: tasks.filter((t) => t.status === 'offen' || t.status === 'laeuft').length, wartenAufDich: tasks.filter((t) => t.status === 'wartet').map((t) => t.title), fehler: tasks.filter((t) => t.status === 'fehler').length },
    produkte: state.products.filter((p) => !project || p.projectId === project.id).map((p) => p.title),
    verkaufsseiten: state.pages.filter((p) => !project || p.projectId === project.id).length,
    echteEinnahmen: { eingetragenEuro: totals.manualEur, gumroadDollar: totals.gumroadUsd, gumroadVerkaeufe: totals.gumroadSales },
    letzteSchritte: state.log.slice(-4).map((entry) => entry.text)
  };
}
