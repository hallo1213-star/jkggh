// Live HUD for the main screen. Everything shown here comes from real events:
// actions Jarvis runs (with their result), what you said, the connection
// (round-trip time), the session, configured services and your own data
// (planner, shopping list, memories). No invented numbers.
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };

const hud = {
  mission: null, // { text, at, steps: Map(id → step) }
  working: 0, // actions currently running
  flash: null, // { color: [r,g,b], at } – for the reactor
  connectedAt: 0,
  rtt: null,
  model: '',
  send: () => false,
  pingTimer: null,
  bootTimer: null
};

const DAY_KEY = () => `jarvis.hud.${new Date().toISOString().slice(0, 10)}`;
function dayStats() {
  try { return JSON.parse(localStorage.getItem(DAY_KEY()) || '{"ok":0,"fail":0}'); } catch { return { ok: 0, fail: 0 }; }
}
function bumpDay(field) {
  const s = dayStats();
  s[field] += 1;
  try { localStorage.setItem(DAY_KEY(), JSON.stringify(s)); } catch { /* ignore */ }
  renderTelemetry();
}

export function reactorFx() {
  return { working: hud.working, flash: hud.flash };
}

// --- mission: the last request and every step Jarvis takes for it ----------------------
export function hudUser(text) {
  hud.mission = { text: String(text).slice(0, 160), at: Date.now(), steps: new Map() };
  renderMission();
}

const STATE_LABEL = { running: 'läuft', done: 'erledigt', error: 'Fehler', denied: 'abgelehnt', cancelled: 'abgebrochen' };
export function hudAction({ id, label, state: rawState, detail }) {
  const state = rawState === 'failed' ? 'error' : rawState;
  if (!hud.mission) hud.mission = { text: 'Auftrag', at: Date.now(), steps: new Map() };
  const step = hud.mission.steps.get(id) || { label, started: Date.now() };
  const before = step.state;
  step.label = label;
  step.state = state;
  step.detail = detail || '';
  if (state !== 'running' && !step.ended) step.ended = Date.now();
  hud.mission.steps.set(id, step);
  hud.working = [...hud.mission.steps.values()].filter((s) => s.state === 'running').length;
  if (before === 'running' || (!before && state !== 'running')) {
    if (state === 'done') { bumpDay('ok'); hud.flash = { color: [56, 225, 255], at: performance.now() }; toastHud('ok', label); }
    if (state === 'error') { bumpDay('fail'); hud.flash = { color: [255, 77, 106], at: performance.now() }; toastHud('error', `${label}${detail ? ` – ${detail}` : ''}`); }
  }
  renderMission();
}

function renderMission() {
  const box = $('hud-mission');
  if (!box) return;
  const m = hud.mission;
  if (!m) { box.replaceChildren(el('p', 'hud-empty', 'Sag Jarvis etwas – hier siehst du jeden Schritt, den er dafür ausführt.')); return; }
  const steps = [...m.steps.values()];
  const ok = steps.filter((s) => s.state === 'done').length;
  const fail = steps.filter((s) => s.state === 'error').length;
  const running = steps.filter((s) => s.state === 'running').length;
  const head = el('div', 'hud-mission-head');
  head.append(el('span', 'hud-quote', `„${m.text}“`));
  const list = el('ol', 'hud-steps');
  steps.forEach((s, i) => {
    const li = el('li', `hud-step s-${s.state}`);
    const secs = ((s.ended || Date.now()) - s.started) / 1000;
    li.append(el('span', 'hud-step-no', String(i + 1).padStart(2, '0')), el('span', 'hud-step-label', s.label), el('span', 'hud-step-state', `${STATE_LABEL[s.state] || s.state} · ${secs.toFixed(1).replace('.', ',')} s`));
    if (s.detail && s.state !== 'done') li.append(el('small', 'hud-step-detail', s.detail));
    list.append(li);
  });
  const summary = el('p', `hud-summary${fail ? ' bad' : running ? ' busy' : ok ? ' good' : ''}`,
    !steps.length ? 'Antwort ohne Werkzeug' : running ? `${running} Schritt(e) laufen …` : `${steps.length} Schritt(e) · ${ok} erfolgreich${fail ? ` · ${fail} Fehler` : ''}`);
  box.replaceChildren(head, ...(steps.length ? [list] : []), summary);
}
setInterval(() => { if (hud.working) renderMission(); }, 500);

// --- toasts for real results --------------------------------------------------------------
function toastHud(kind, text) {
  const host = $('hud-toasts');
  if (!host) return;
  const t = el('div', `hud-toast ${kind}`);
  t.append(el('b', '', kind === 'ok' ? '✓ ERLEDIGT' : '✖ FEHLER'), el('span', '', text));
  host.prepend(t);
  while (host.children.length > 3) host.lastChild.remove();
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4800);
}

// --- telemetry (connection, session, results today, model) ---------------------------------
function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}
function renderTelemetry() {
  const box = $('hud-telemetry');
  if (!box) return;
  const d = dayStats();
  const cells = [
    ['VERBINDUNG', hud.connectedAt ? (hud.rtt !== null ? `${hud.rtt} ms` : 'online') : 'offline'],
    ['SITZUNG', hud.connectedAt ? fmtDur(Date.now() - hud.connectedAt) : '–'],
    ['HEUTE ✓', String(d.ok)],
    ['HEUTE ✖', String(d.fail)]
  ];
  box.replaceChildren(...cells.map(([k, v]) => { const c = el('div', 'hud-cell'); c.append(el('small', '', k), el('b', '', v)); return c; }));
}
setInterval(renderTelemetry, 5000);

export function hudPong(t) {
  hud.rtt = Math.max(1, Math.round(performance.now() - Number(t)));
  renderTelemetry();
}

export function hudConnected(on) {
  hud.connectedAt = on ? Date.now() : 0;
  hud.rtt = null;
  clearInterval(hud.pingTimer);
  if (on) {
    const ping = () => hud.send({ type: 'ping', t: performance.now() });
    setTimeout(ping, 800);
    hud.pingTimer = setInterval(ping, 15_000);
  }
  renderTelemetry();
}

// --- boot sequence: the real steps of starting a session -------------------------------------
const BOOT_STEPS = [['mic', 'MIKROFON'], ['link', 'VERBINDUNG ZUM SERVER'], ['voice', 'SPRACHKERN (DEEPGRAM)']];
export function hudBoot(step, ok = true, detail = '') {
  const box = $('hud-boot');
  if (!box) return;
  if (step === 'start') {
    box.hidden = false;
    box.classList.remove('done');
    box.replaceChildren(...BOOT_STEPS.map(([id, label]) => { const r = el('div', 'hud-boot-row'); r.dataset.step = id; r.append(el('span', '', label), el('b', '', '…')); return r; }));
    return;
  }
  const row = box.querySelector(`[data-step="${step}"]`);
  if (!row) return;
  row.dataset.state = ok ? 'ok' : 'fail';
  row.querySelector('b').textContent = ok ? 'ONLINE' : (detail || 'FEHLER').toUpperCase().slice(0, 28);
  if (!ok || step === 'voice') {
    clearTimeout(hud.bootTimer);
    hud.bootTimer = setTimeout(() => { box.classList.add('done'); setTimeout(() => { box.hidden = true; }, 600); }, ok ? 1600 : 5000);
  }
}

// --- system: which services are really set up -----------------------------------------------------
export async function refreshSystem() {
  const box = $('hud-system');
  if (!box) return;
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    const data = await r.json();
    const services = Object.entries(data.services || {});
    const ai = services.find(([name]) => /KI|Modell/i.test(name));
    hud.model = ai?.[1]?.detail || '';
    box.replaceChildren(...services.slice(0, 8).map(([name, s]) => { const row = el('div', `hud-svc ${s.ok ? 'on' : 'off'}`); row.title = s.detail || ''; row.append(el('span', 'hud-dot'), el('span', '', name), el('small', '', s.ok ? 'bereit' : 'nicht eingerichtet')); return row; }));
  } catch {
    box.replaceChildren(el('p', 'hud-empty', 'Status nicht abrufbar.'));
  }
}

// --- today: from your own planner, shopping list and memories ------------------------------------------
export function hudToday({ planner, shopping, memories }) {
  const box = $('hud-today');
  if (!box) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const items = [];
  const appts = (planner?.appointments || []).filter((a) => (a.date || '') >= today).sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  if (appts[0]) items.push(['📅', 'Nächster Termin', `${appts[0].title}${appts[0].date === today ? ' · heute' : ` · ${new Date(`${appts[0].date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}`}${appts[0].time ? ` · ${appts[0].time}` : ''}`]);
  const rem = (planner?.reminders || [])[0];
  if (rem) items.push(['⏰', 'Erinnerung', `${rem.text}${rem.time ? ` · ${rem.time}` : ''}`]);
  const open = (shopping || []).filter((i) => !i.done);
  items.push(['🛒', 'Einkaufsliste', open.length ? `${open.length} offen: ${open.slice(0, 3).map((i) => i.text).join(', ')}` : 'leer']);
  items.push(['🧠', 'Gedächtnis', `${(memories || []).length} Erinnerungen`]);
  box.replaceChildren(...items.map(([icon, k, v]) => { const r = el('div', 'hud-today-row'); r.append(el('span', 'hud-today-icon', icon), el('small', '', k), el('b', '', v)); return r; }));
}

export function initHud({ send }) {
  hud.send = send;
  renderMission();
  renderTelemetry();
  refreshSystem();
}
