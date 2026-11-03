// Command Animation Engine: turns real Jarvis events into animations.
// The module is chosen by the REAL function Jarvis runs (not by keywords), so
// "Mach mir eine moderne Website" and "Erstelle einen Onlineshop" both land on
// the website animation because Jarvis calls studio_website / create_website.
// Animations never replace the function and never show "done" before the
// function (or its background job) has really finished.
import { EV, emit, on, snapshot, state } from './bus.js';
import { perf } from './perf.js';
import { neutralModule } from './modules/neutral.js';
import { thinkingModule } from './modules/thinking.js';
import { websiteModule } from './modules/website.js';
import { systemsModule } from './modules/systems.js';
import { globeModule } from './modules/globe.js';
import { memoriesModule } from './modules/memories.js';

// real function name → animation module
export const TOOL_MODULES = {
  studio_website: 'website', create_website: 'website', create_sales_website: 'website', create_project: 'website',
  systems_overview: 'systems',
  globe: 'globe',
  memory_list: 'memories'
};
// functions whose real work continues in the background after they answer
const BACKGROUND_JOBS = { studio_website: 'studio' };
const MODULES = { neutral: neutralModule, website: websiteModule, systems: systemsModule, globe: globeModule, memories: memoriesModule };
const STUDIO_STEPS = 5; // Konzept, CSS, JavaScript, HTML, Design-Prüfung

const handles = new Map(); // action id → { module, handle }
let thinking = null;
let studioAction = null;   // action id that waits for the studio job
let enabled = true;

export const moduleFor = (tool) => TOOL_MODULES[tool] || 'neutral';

function safe(fn, label) {
  try { return fn(); } catch (error) { console.warn(`[Animation] ${label}`, error); return undefined; }
}
function start(action) {
  if (!enabled || handles.has(action.id)) return handles.get(action.id);
  const key = moduleFor(action.tool);
  let handle = safe(() => MODULES[key].create({ action, perf }), `Modul ${key} konnte nicht starten`);
  let used = key;
  if (!handle && key !== 'neutral') { handle = safe(() => neutralModule.create({ action, perf }), 'Neutral-Modul'); used = 'neutral'; }
  if (!handle) return null;
  const entry = { module: used, handle };
  handles.set(action.id, entry);
  action.module = used;
  return entry;
}
function finish(id, kind, info) {
  const entry = handles.get(id);
  if (!entry) return;
  handles.delete(id);
  safe(() => (kind === 'ok' ? entry.handle.complete(info) : entry.handle.fail(info)), `Modul ${entry.module} Abschluss`);
}
function byModule(key) { for (const [id, e] of handles) if (e.module === key) return { id, ...e }; return null; }

// --- events → animations ---------------------------------------------------
on(EV.ACTION_STARTED, (e) => start(state.actions.get(e.id)));
on(EV.ACTION_PROGRESS, (e) => { const h = handles.get(e.id); if (h) safe(() => h.handle.progress?.(e.progress, e.step), 'Fortschritt'); });
on(EV.ACTION_COMPLETED, (e) => finish(e.id, 'ok', e));
on(EV.ACTION_FAILED, (e) => finish(e.id, 'fail', e));
on(EV.AGENT_STATE, (e) => {
  if (e.phase === 'thinking') {
    if (!thinking) thinking = safe(() => thinkingModule.create({ perf }), 'Denk-Modul');
  } else if (thinking) {
    const t = thinking; thinking = null;
    safe(() => (e.phase === 'error' || e.phase === 'offline' ? t.fail() : t.complete()), 'Denk-Modul Ende');
  }
});

function setAction(id, patch) {
  const a = { ...(state.actions.get(id) || { id, progress: 0 }), ...patch };
  state.actions.set(id, a);
  if (state.actions.size > 40) state.actions.delete(state.actions.keys().next().value);
  return a;
}

// Called by app.js for every real message from the server.
export function ingest(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'status':
      state.phase = m.state;
      emit(EV.AGENT_STATE, { phase: m.state });
      break;
    case 'transcript':
      if (m.role === 'user') { state.lastCommand = String(m.content || '').slice(0, 200); emit(EV.COMMAND_RECEIVED, { text: state.lastCommand }); }
      break;
    case 'action': {
      const tool = String(m.tool || '');
      if (m.state === 'running') {
        if (state.actions.get(m.id)?.status === 'running') break;
        const a = setAction(m.id, { tool, label: m.label, status: 'running', progress: 0, startedAt: Date.now() });
        emit(EV.COMMAND_CLASSIFIED, { id: m.id, tool, module: moduleFor(tool), command: state.lastCommand });
        emit(EV.ACTION_STARTED, { id: m.id, tool, label: a.label });
      } else if (m.state === 'done') {
        if (BACKGROUND_JOBS[tool] === 'studio') {
          // the function only STARTED the website build – wait for the real job
          setAction(m.id, { status: 'job' });
          studioAction = m.id;
          emit(EV.ACTION_PROGRESS, { id: m.id, tool, progress: 0.04, step: 'Auftrag angenommen' });
        } else {
          setAction(m.id, { status: 'done', progress: 1 });
          emit(EV.ACTION_COMPLETED, { id: m.id, tool });
        }
      } else if (['failed', 'denied', 'cancelled'].includes(m.state)) {
        setAction(m.id, { status: m.state });
        emit(EV.ACTION_FAILED, { id: m.id, tool, reason: m.state === 'denied' ? 'Nicht bestätigt' : m.state === 'cancelled' ? 'Abgebrochen' : String(m.detail || 'Fehler') });
      }
      break;
    }
    case 'studio_job': {
      // real website-build progress (also when started from the Studio itself)
      let id = studioAction;
      if (!id || !state.actions.has(id)) {
        if (m.status !== 'läuft') break;
        id = `studio-${m.id}`; studioAction = id;
        setAction(id, { tool: 'studio_website', label: 'Website wird gebaut', status: 'job', progress: 0, startedAt: Date.now() });
        emit(EV.ACTION_STARTED, { id, tool: 'studio_website', label: 'Website wird gebaut' });
      }
      const a = state.actions.get(id);
      if (m.status === 'läuft') {
        const steps = (a.steps || 0) + (m.step ? 1 : 0);
        const progress = Math.min(0.92, 0.06 + steps / STUDIO_STEPS * 0.86);
        setAction(id, { steps, progress });
        emit(EV.ACTION_PROGRESS, { id, tool: 'studio_website', progress, step: m.step || 'läuft' });
      } else if (m.status === 'fertig') {
        setAction(id, { status: 'done', progress: 1 }); studioAction = null;
        emit(EV.ACTION_COMPLETED, { id, tool: 'studio_website' });
      } else if (m.status === 'fehler') {
        setAction(id, { status: 'failed' }); studioAction = null;
        emit(EV.ACTION_FAILED, { id, tool: 'studio_website', reason: String(m.error || 'Website-Erstellung fehlgeschlagen') });
      }
      break;
    }
    // data for running modules (only real data from the functions)
    case 'systems': { const h = byModule('systems'); if (h) safe(() => h.handle.data(m), 'Systeme-Daten'); break; }
    case 'globe': { if (m.action === 'fly' && m.place) { const h = byModule('globe'); if (h) safe(() => h.handle.data(m.place), 'Globus-Daten'); } break; }
    case 'memories': { if (m.show) { const h = byModule('memories'); if (h) safe(() => h.handle.data(m.items || []), 'Erinnerungs-Daten'); } break; }
    default: break;
  }
}

export function setEnabled(on) { enabled = Boolean(on); }
export const engineState = snapshot;
if (typeof window !== 'undefined') window.__jarvisAnimation = { state: snapshot, moduleFor };
