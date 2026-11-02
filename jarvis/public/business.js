// Business-Modus ("Business Creation Protocol", like video 1): red mission intro
// with countdown, then a pink HUD that reveals the business Jarvis designed –
// market, product, brand, product line, website, ads and start plan.
// Everything shown comes from the real AI answer; numbers are marked as
// estimates. The timer is the real elapsed time against a 60-second limit.
const LIMIT = 60;
const MISSION_KEY = 'jarvis.business.missions';
const LAST_KEY = 'jarvis.business.last';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const euro = (n) => `${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const safeColor = (c, f) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : f);

let ui = null;
let deps = { toast: () => {}, startStudio: null, onClose: () => {} };
const mission = { running: false, startedAt: 0, finishedAt: 0, timer: null, idea: '', budget: 0, plan: null, brief: '', number: 0, revealTimers: [] };

function build() {
  if (ui) return ui;
  const root = el('div', 'biz-overlay');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Business-Modus');
  root.innerHTML = `
    <header class="biz-top">
      <p class="biz-brand"><b>JARVIS</b> · BUSINESS EMPIRE <span>VOICE SYSTEM</span></p>
      <div class="biz-top-right">
        <span class="biz-pill" data-k="mission">MISSION –</span>
        <span class="biz-pill" data-k="budget">STARTKAPITAL –</span>
        <span class="biz-pill hot" data-k="status">BEREIT</span>
        <button class="biz-x" type="button" aria-label="Business-Modus schließen">✕</button>
      </div>
    </header>
    <div class="biz-orb" aria-hidden="true"><span></span></div>
    <main class="biz-stage"></main>
    <footer class="biz-foot">
      <span class="biz-phase">BEREIT</span>
      <div class="biz-bar"><span></span></div>
      <span class="biz-clock">00:${LIMIT}</span>
    </footer>`;
  document.body.append(root);
  ui = {
    root,
    stage: root.querySelector('.biz-stage'),
    phase: root.querySelector('.biz-phase'),
    bar: root.querySelector('.biz-bar span'),
    clock: root.querySelector('.biz-clock'),
    pill: (k) => root.querySelector(`[data-k="${k}"]`)
  };
  root.querySelector('.biz-x').addEventListener('click', close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return ui;
}

function close() {
  if (!ui) return;
  ui.root.hidden = true;
  document.body.classList.remove('biz-open');
  deps.onClose();
}

function show() {
  build();
  ui.root.hidden = false;
  document.body.classList.add('biz-open');
}

function setPhase(text, status) {
  ui.phase.textContent = text;
  if (status) ui.pill('status').textContent = status;
}

// --- timer: real elapsed time against the limit -----------------------------------
function tick() {
  const end = mission.finishedAt || Date.now();
  const secs = (end - mission.startedAt) / 1000;
  const left = LIMIT - secs;
  ui.clock.textContent = left >= 0 ? `00:${String(Math.ceil(left)).padStart(2, '0')}` : `+00:${String(Math.floor(-left)).padStart(2, '0')}`;
  ui.clock.classList.toggle('over', left < 0);
  ui.bar.style.width = `${Math.min(100, (secs / LIMIT) * 100)}%`;
}
function startClock() {
  clearInterval(mission.timer);
  mission.startedAt = Date.now();
  mission.finishedAt = 0;
  mission.timer = setInterval(tick, 250);
  tick();
}
function stopClock() {
  mission.finishedAt = Date.now();
  clearInterval(mission.timer);
  tick();
}

// --- setup (when opened by tab instead of voice) ------------------------------------
function renderSetup() {
  const box = el('section', 'biz-setup');
  box.append(el('p', 'biz-kicker', 'BUSINESS CREATION PROTOCOL'), el('h2', 'biz-title', 'Welches Business soll ich bauen?'));
  const idea = el('input');
  idea.placeholder = 'Deine Idee, z. B. „personalisierte LED-Neonschilder“ – oder leer lassen';
  idea.maxLength = 200;
  const budget = el('input');
  budget.type = 'number';
  budget.min = '0';
  budget.placeholder = 'Startkapital in € (optional)';
  const go = el('button', 'biz-go', 'Mission starten');
  go.type = 'button';
  const run = () => startMission({ idea: idea.value.trim(), budget: Number(budget.value) || 0, fetchPlan: true });
  go.addEventListener('click', run);
  idea.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  box.append(idea, budget, go, el('p', 'biz-note', 'Jarvis entwirft Markt, Produkt, Marke, Produktlinie, Website-Texte, Werbung und Startplan. Zahlen sind KI-Schätzungen – kein Gewinnversprechen. Sag auch einfach: „Starte den Business-Modus“.'));
  const last = loadLast();
  if (last) {
    const again = el('button', 'biz-ghost', `Letztes Konzept ansehen: ${last.plan.name}`);
    again.type = 'button';
    again.addEventListener('click', () => { mission.plan = last.plan; mission.brief = last.brief; mission.number = last.number; mission.startedAt = 0; reveal(true); });
    box.append(again);
  }
  ui.stage.replaceChildren(box);
  ui.pill('mission').textContent = `MISSION ${missionCount() + 1}`;
  ui.pill('budget').textContent = 'STARTKAPITAL –';
  ui.clock.textContent = `00:${LIMIT}`;
  ui.bar.style.width = '0%';
  setPhase('BEREIT', 'BEREIT');
  setTimeout(() => idea.focus(), 50);
}

function missionCount() {
  try { return Number(localStorage.getItem(MISSION_KEY)) || 0; } catch { return 0; }
}
function loadLast() {
  try { const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); return v?.plan?.name ? v : null; } catch { return null; }
}

// --- mission intro (red) + waiting -------------------------------------------------------
function startMission({ idea, budget, fetchPlan }) {
  show();
  mission.revealTimers.forEach(clearTimeout);
  mission.revealTimers = [];
  mission.running = true;
  mission.plan = null;
  mission.idea = idea || '';
  mission.budget = budget || 0;
  mission.number = missionCount() + 1;
  try { localStorage.setItem(MISSION_KEY, String(mission.number)); } catch { /* ignore */ }
  ui.pill('mission').textContent = `MISSION ${mission.number}`;
  ui.pill('budget').textContent = mission.budget ? `STARTKAPITAL ${euro(mission.budget)}` : 'STARTKAPITAL KLEIN';
  ui.root.classList.add('red');
  const intro = el('section', 'biz-intro');
  intro.innerHTML = `<div class="biz-intro-rings"><span></span><span></span><span></span></div>
    <p class="biz-kicker">BUSINESS CREATION PROTOCOL</p>
    <p class="biz-accepted">MISSION ${mission.number} · ANGENOMMEN</p>
    <b class="biz-count">3</b>
    <dl class="biz-intro-facts"><dt>STARTKAPITAL</dt><dd></dd><dt>ZEITLIMIT</dt><dd>${LIMIT} SEKUNDEN</dd><dt>ZIEL</dt><dd>KOMPLETTES BUSINESS-KONZEPT</dd><dt>IDEE</dt><dd></dd></dl>`;
  const dd = intro.querySelectorAll('dd');
  dd[0].textContent = mission.budget ? euro(mission.budget) : 'klein (unter 300 €)';
  dd[3].textContent = mission.idea || 'Jarvis wählt selbst';
  ui.stage.replaceChildren(intro);
  setPhase('MISSION ANGENOMMEN', 'START');
  startClock();
  const count = intro.querySelector('.biz-count');
  [2, 1].forEach((n, i) => mission.revealTimers.push(setTimeout(() => { count.textContent = String(n); count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop'); }, (i + 1) * 900)));
  mission.revealTimers.push(setTimeout(() => { ui.root.classList.remove('red'); if (!mission.plan) renderWorking(); }, 2700));
  if (fetchPlan) {
    fetch('/api/business/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: mission.idea, budget: mission.budget }) })
      .then(async (r) => { const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`); return data; })
      .then((data) => receive(data.plan, data.brief))
      .catch((error) => fail(error.message));
  }
}

function renderWorking() {
  const box = el('section', 'biz-working');
  box.append(el('p', 'biz-kicker', 'JARVIS ARBEITET'), el('h2', 'biz-title', mission.idea ? `„${mission.idea}“` : 'Ich suche eine passende Idee …'));
  const list = el('ol', 'biz-queue');
  for (const step of ['Marktanalyse', 'Produkt', 'Marke & Name', 'Produktlinie', 'Website', 'Werbung', 'Startplan']) list.append(el('li', '', step));
  box.append(list, el('p', 'biz-note', 'Die KI schreibt gerade das komplette Konzept. Die Panels erscheinen, sobald die echte Antwort da ist.'));
  ui.stage.replaceChildren(box);
  setPhase('KI ANALYSIERT', 'ARBEITET');
}

function receive(plan, brief) {
  if (!plan) return;
  mission.plan = plan;
  mission.brief = brief || '';
  mission.running = false;
  stopClock();
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ plan, brief: mission.brief, number: mission.number })); } catch { /* ignore */ }
  const wait = Math.max(0, 2700 - (Date.now() - mission.startedAt));
  mission.revealTimers.push(setTimeout(() => { ui.root.classList.remove('red'); reveal(false); }, wait));
}

function fail(message) {
  mission.running = false;
  stopClock();
  ui.root.classList.remove('red');
  const box = el('section', 'biz-error');
  box.append(el('p', 'biz-kicker', 'MISSION FEHLGESCHLAGEN'), el('h2', 'biz-title', 'Das Konzept konnte nicht erstellt werden.'), el('p', 'biz-error-text', message));
  const again = el('button', 'biz-go', 'Nochmal versuchen');
  again.type = 'button';
  again.addEventListener('click', () => startMission({ idea: mission.idea, budget: mission.budget, fetchPlan: true }));
  box.append(again);
  ui.stage.replaceChildren(box);
  setPhase('FEHLER', 'FEHLER');
}

// --- reveal: panels appear one after another ------------------------------------------
function panel(title, tag, cls = '') {
  const p = el('section', `biz-panel ${cls}`);
  const h = el('h3');
  h.append(el('span', '', title));
  if (tag) h.append(el('small', '', tag));
  p.append(h);
  return p;
}

function sparkline(values) {
  const w = 300, h = 90;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 10) - 4}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'biz-spark');
  svg.innerHTML = `<defs><linearGradient id="bizg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3ea5" stop-opacity=".55"/><stop offset="1" stop-color="#ff3ea5" stop-opacity="0"/></linearGradient></defs><polygon fill="url(#bizg)" points="0,${h} ${pts} ${w},${h}"/><polyline fill="none" stroke="#ff6cc4" stroke-width="2.5" points="${pts}"/>`;
  return svg;
}

function gauge(value) {
  const box = el('div', 'biz-gauge');
  box.style.setProperty('--v', String(value));
  box.append(el('b', '', String(Math.round(value))), el('small', '', 'CHANCE (KI)'));
  return box;
}

function reveal(instant) {
  const p = mission.plan;
  const [c1, c2, c3] = p.marke.farben.map((c, i) => safeColor(c, ['#ff3ea5', '#a855f7', '#0b0612'][i]));
  ui.pill('mission').textContent = `MISSION ${mission.number || ''}`.trim();
  ui.pill('budget').textContent = p.budget ? `STARTKAPITAL ${euro(p.budget)}` : 'STARTKAPITAL KLEIN';
  const grid = el('div', 'biz-grid');

  const market = panel('01 · Marktanalyse', 'KI-SCHÄTZUNG', 'a-market');
  if (p.markt.nachfrage.length > 1) { market.append(el('small', 'biz-label', 'Interesse letzte 6 Monate (Schätzung)'), sparkline(p.markt.nachfrage)); }
  market.append(el('p', 'biz-text', p.markt.zusammenfassung));
  const trends = el('ul', 'biz-list');
  p.markt.trends.forEach((t) => trends.append(el('li', '', t)));
  market.append(el('small', 'biz-label', 'Trends'), trends);

  const product = panel('02 · Produkt', '', 'a-product');
  product.append(el('p', 'biz-neon', p.idee), el('p', 'biz-text', p.zielgruppe ? `Zielgruppe: ${p.zielgruppe}` : ''), gauge(p.markt.chance));
  const comp = el('ul', 'biz-list');
  p.markt.wettbewerb.forEach((t) => comp.append(el('li', '', t)));
  if (p.markt.wettbewerb.length) product.append(el('small', 'biz-label', 'Wettbewerb'), comp);

  const brand = panel('03 · Marke', '', 'a-brand');
  const logo = el('div', 'biz-logo');
  logo.style.setProperty('--c1', c1);
  logo.style.setProperty('--c2', c2);
  logo.append(el('span', 'biz-logo-mark', p.name.slice(0, 1).toUpperCase()), el('b', '', p.name.toUpperCase()));
  const swatches = el('div', 'biz-swatches');
  [c1, c2, c3].forEach((c) => { const s = el('span', '', c); s.style.background = c; swatches.append(s); });
  brand.append(logo, el('p', 'biz-slogan', p.slogan), el('p', 'biz-text', p.marke.ton ? `Ton: ${p.marke.ton}` : ''), swatches);

  const site = panel('04 · Website', 'VORSCHAU', 'a-site');
  const mock = el('div', 'biz-mock');
  mock.style.setProperty('--c1', c1);
  mock.style.setProperty('--c2', c2);
  const nav = el('div', 'biz-mock-nav');
  nav.append(el('b', '', p.name), el('span', '', p.webseite.abschnitte.join(' · ')));
  mock.append(nav, el('p', 'biz-mock-h', p.webseite.headline || p.slogan), el('p', 'biz-mock-sub', p.webseite.unterzeile), el('span', 'biz-mock-btn', p.webseite.button));
  site.append(mock);

  const line = panel('05 · Produktlinie', `${p.produkte.length} PRODUKTE`, 'a-line');
  const cards = el('div', 'biz-products');
  p.produkte.forEach((x) => { const c = el('div', 'biz-product'); c.append(el('span', 'biz-product-glow'), el('b', '', x.name), el('small', '', x.beschreibung), el('em', '', x.preis ? euro(x.preis) : 'Preis offen')); cards.append(c); });
  line.append(cards);

  const ads = panel('06 · Werbung', '', 'a-ads');
  p.werbung.forEach((a) => { const c = el('div', 'biz-ad'); c.append(el('small', '', a.kanal.toUpperCase()), el('b', '', a.hook), el('p', '', a.text)); ads.append(c); });

  const plan = panel('07 · Startplan', p.startkosten ? `START: ~${euro(p.startkosten)}` : '', 'a-plan');
  const steps = el('ol', 'biz-steps');
  p.schritte.forEach((s) => steps.append(el('li', '', s)));
  const costs = el('ul', 'biz-costs');
  p.kosten.forEach((k) => { const li = el('li'); li.append(el('span', '', k.posten), el('b', '', euro(k.betrag))); costs.append(li); });
  plan.append(steps, el('small', 'biz-label', 'Kosten (Schätzung)'), costs);
  if (p.risiken.length) plan.append(el('small', 'biz-label', 'Risiken'), el('p', 'biz-text', p.risiken.join(' · ')));

  const done = el('section', 'biz-done');
  const secs = mission.startedAt && mission.finishedAt ? Math.round((mission.finishedAt - mission.startedAt) / 1000) : null;
  done.append(el('b', '', 'MISSION ABGESCHLOSSEN'), el('span', '', secs === null ? 'Gespeichertes Konzept' : `in ${secs} Sekunden${secs > LIMIT ? ' (über dem Zeitlimit)' : ''} · Zahlen sind KI-Schätzungen`));
  const actions = el('div', 'biz-actions');
  const siteBtn = el('button', 'biz-go', 'Website bauen');
  siteBtn.type = 'button';
  siteBtn.addEventListener('click', async () => {
    if (!deps.startStudio) return;
    siteBtn.disabled = true;
    siteBtn.textContent = 'Startet …';
    try { await deps.startStudio(mission.brief || `Online-Shop für ${p.name}: ${p.idee}`); close(); } catch (error) { deps.toast(error.message, 'error'); siteBtn.disabled = false; siteBtn.textContent = 'Website bauen'; }
  });
  const copy = el('button', 'biz-ghost', 'Konzept kopieren');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    const text = `${p.name} – ${p.idee}\n${p.slogan}\n\nZielgruppe: ${p.zielgruppe}\n\nProdukte:\n${p.produkte.map((x) => `- ${x.name} (${euro(x.preis)}): ${x.beschreibung}`).join('\n')}\n\nWerbung:\n${p.werbung.map((a) => `- ${a.kanal}: ${a.hook} ${a.text}`).join('\n')}\n\nErste Schritte:\n${p.schritte.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nStartkosten (Schätzung): ${euro(p.startkosten)}`;
    navigator.clipboard?.writeText(text).then(() => deps.toast('Konzept kopiert.')).catch(() => deps.toast('Kopieren nicht möglich.', 'error'));
  });
  const again = el('button', 'biz-ghost', 'Neue Mission');
  again.type = 'button';
  again.addEventListener('click', renderSetup);
  actions.append(siteBtn, copy, again);
  done.append(actions);

  const order = [market, product, brand, site, line, ads, plan];
  grid.append(...order);
  ui.stage.replaceChildren(grid, done);
  const phases = ['MARKTANALYSE', 'PRODUKT', 'MARKE', 'WEBSITE', 'PRODUKTLINIE', 'WERBUNG', 'STARTPLAN'];
  if (instant) {
    order.forEach((x) => x.classList.add('in'));
    done.classList.add('in');
    setPhase('KONZEPT', 'FERTIG');
    if (!mission.startedAt) { ui.clock.textContent = '--:--'; ui.bar.style.width = '100%'; }
    return;
  }
  order.forEach((x, i) => mission.revealTimers.push(setTimeout(() => { x.classList.add('in'); setPhase(phases[i], 'BAUT'); x.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 300 + i * 650)));
  mission.revealTimers.push(setTimeout(() => { done.classList.add('in'); setPhase('MISSION ABGESCHLOSSEN', 'FERTIG'); }, 300 + order.length * 650));
}

// --- public API -------------------------------------------------------------------------------
export function initBusiness(options) {
  deps = { ...deps, ...options };
}

export function openBusiness() {
  show();
  if (mission.running) return;
  if (mission.plan && ui.stage.querySelector('.biz-grid')) return;
  renderSetup();
}

// Messages from the voice tool business_mode.
export function handleBusinessMessage(message) {
  if (message.type === 'business_start') startMission({ idea: message.idea, budget: message.budget, fetchPlan: false });
  else if (message.type === 'business_result') { if (!mission.startedAt) startMission({ idea: message.plan?.idee, budget: message.plan?.budget, fetchPlan: false }); receive(message.plan, message.brief); }
  else if (message.type === 'business_error') { show(); fail(message.error || 'Unbekannter Fehler'); }
}
