// Business-Modus ("Business Creation Protocol", like video 1): red mission intro
// with countdown, then a pink HUD that reveals the business Jarvis designed –
// market, product, brand, product line, website, ads and start plan.
// Everything shown comes from the real AI answer; numbers are marked as
// estimates. The timer is the real elapsed time against a 60-second limit.
import { buildPreview } from './projects.js';

const LIMIT = 60;
const MISSION_KEY = 'jarvis.business.missions';
const LAST_KEY = 'jarvis.business.last';
const AUTO_KEY = 'jarvis.business.autoSite';
const SITE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src https://image.pollinations.ai data: blob:; media-src data: blob:; connect-src 'none'";

// --- sound effects (generated live, no files) --------------------------------------------
let audioCtx = null;
function sfx(kind) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.18;
    out.connect(ctx.destination);
    const tone = (freq, start, dur, type = 'sine', to = freq) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now + start);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + start + dur);
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(1, now + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      o.connect(g).connect(out);
      o.start(now + start);
      o.stop(now + start + dur + 0.05);
    };
    if (kind === 'count') tone(880, 0, 0.18, 'square', 870);
    else if (kind === 'go') { tone(220, 0, 0.6, 'sawtooth', 880); tone(1320, 0.1, 0.4); }
    else if (kind === 'panel') { tone(1800, 0, 0.12, 'triangle', 600); tone(300, 0, 0.18, 'sine', 120); }
    else if (kind === 'done') { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle')); }
    else if (kind === 'error') tone(200, 0, 0.5, 'sawtooth', 90);
  } catch { /* no audio – fine */ }
}
const autoSite = () => { try { return localStorage.getItem(AUTO_KEY) !== 'false'; } catch { return true; } };

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const euro = (n) => `${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const safeColor = (c, f) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : f);

let ui = null;
let deps = { toast: () => {}, startStudio: null, openStudioJob: null, onClose: () => {}, result: () => {} };
const site = { id: '', status: '', steps: [], result: null, error: '', poll: null };
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

function closeQuiet() { if (ui && !ui.root.hidden) { ui.root.hidden = true; document.body.classList.remove('biz-open'); } }
function show() {
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'biz' }));
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
  const auto = el('label', 'biz-check');
  const box2 = el('input');
  box2.type = 'checkbox';
  box2.checked = autoSite();
  box2.addEventListener('change', () => { try { localStorage.setItem(AUTO_KEY, String(box2.checked)); } catch { /* ignore */ } });
  auto.append(box2, document.createTextNode(' Website gleich mitbauen (echter Online-Shop, dauert 1–3 Minuten)'));
  box.append(idea, budget, auto, go, el('p', 'biz-note', 'Jarvis entwirft Markt, Produkt, Marke, Produktlinie, Website-Texte, Werbung und Startplan. Zahlen sind KI-Schätzungen – kein Gewinnversprechen. Sag auch einfach: „Starte den Business-Modus“.'));
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
  sfx('count');
  [2, 1].forEach((n, i) => mission.revealTimers.push(setTimeout(() => { sfx('count'); count.textContent = String(n); count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop'); }, (i + 1) * 900)));
  mission.revealTimers.push(setTimeout(() => sfx('go'), 2700));
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
  deps.result({ title: `Business: ${plan.name}`, detail: plan.idee, button: 'Öffnen', onClick: () => openBusiness() });
  site.id = ''; site.status = ''; site.result = null; site.error = ''; site.steps = [];
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
  sfx('error');
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
  const logoNote = el('small', 'biz-label', 'Logo wird gezeichnet …');
  brand.append(logo, logoNote, el('p', 'biz-slogan', p.slogan), el('p', 'biz-text', p.marke.ton ? `Ton: ${p.marke.ton}` : ''), swatches);

  const site = panel('04 · Website', 'VORSCHAU', 'a-site');
  const mock = el('div', 'biz-mock');
  mock.style.setProperty('--c1', c1);
  mock.style.setProperty('--c2', c2);
  const nav = el('div', 'biz-mock-nav');
  nav.append(el('b', '', p.name), el('span', '', p.webseite.abschnitte.join(' · ')));
  if (p.webseite.heroUrl) mock.append(picture(p.webseite.heroUrl, `Titelbild ${p.name}`, 'biz-mock-img'));
  mock.append(nav, el('p', 'biz-mock-h', p.webseite.headline || p.slogan), el('p', 'biz-mock-sub', p.webseite.unterzeile), el('span', 'biz-mock-btn', p.webseite.button));
  site.append(mock);

  const line = panel('05 · Produktlinie', `${p.produkte.length} PRODUKTE`, 'a-line');
  const cards = el('div', 'biz-products');
  p.produkte.forEach((x) => { const c = el('div', 'biz-product'); c.append(picture(x.bildUrl, x.name, 'biz-product-img'), el('b', '', x.name), el('small', '', x.beschreibung), el('em', '', x.preis ? euro(x.preis) : 'Preis offen')); cards.append(c); });
  line.append(cards);

  const ads = panel('06 · Werbung', '', 'a-ads');
  p.werbung.forEach((a) => { const c = el('div', 'biz-ad'); const t = el('div'); t.append(el('small', '', a.kanal.toUpperCase()), el('b', '', a.hook), el('p', '', a.text)); c.append(picture(a.bildUrl, `Werbemotiv ${a.kanal}`, 'biz-ad-img'), t); ads.append(c); });

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
    if (site.status === 'fertig' && deps.openStudioJob) { deps.openStudioJob(site.id, mission.brief); close(); return; }
    if (site.status === 'läuft') { live.scrollIntoView({ behavior: 'smooth' }); return; }
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

  const live = panel('08 · Website live', 'JARVIS STUDIO', 'a-live');
  const liveBody = el('div', 'biz-live');
  live.append(liveBody);
  const order = [market, product, brand, site, line, ads, plan, live];
  grid.append(...order);
  ui.stage.replaceChildren(grid, done);
  const phases = ['MARKTANALYSE', 'PRODUKT', 'MARKE', 'WEBSITE', 'PRODUKTLINIE', 'WERBUNG', 'STARTPLAN', 'WEBSITE LIVE'];
  drawLogo(p, logo, logoNote);
  renderSite(liveBody);
  if (!instant && !site.id && autoSite()) startSite(liveBody);
  if (instant) {
    order.forEach((x) => x.classList.add('in'));
    done.classList.add('in');
    setPhase('KONZEPT', 'FERTIG');
    if (!mission.startedAt) { ui.clock.textContent = '--:--'; ui.bar.style.width = '100%'; }
    return;
  }
  order.forEach((x, i) => mission.revealTimers.push(setTimeout(() => { x.classList.add('in'); sfx('panel'); setPhase(phases[i], 'BAUT'); x.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 300 + i * 650)));
  mission.revealTimers.push(setTimeout(() => { done.classList.add('in'); sfx('done'); setPhase(site.status === 'läuft' ? 'WEBSITE WIRD GEBAUT' : 'MISSION ABGESCHLOSSEN', 'FERTIG'); }, 300 + order.length * 650));
}

function picture(src, alt, cls) {
  const box = el('div', `biz-img ${cls}`);
  if (!src) { box.classList.add('empty'); return box; }
  const img = new Image();
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => box.classList.add('ready'));
  img.addEventListener('error', () => { box.classList.add('failed'); box.title = 'Bild konnte nicht geladen werden'; });
  img.src = src;
  box.append(img);
  return box;
}

// Real logo: drawn as a vector graphic by the Design Studio (same AI).
async function drawLogo(p, logo, note) {
  if (p.logoSvg) { showLogo(logo, note, p.logoSvg); return; }
  try {
    const r = await fetch('/api/graphics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'neu', type: 'logo', style: 'auto', brief: `Logo für die Marke „${p.name}“ (${p.idee}). Slogan: ${p.slogan}. Farben: ${p.marke.farben.join(', ')}. Idee: ${p.marke.logoIdee || 'modern, einprägsam'}. Dunkler Hintergrund.` }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
    const svg = data.set?.assets?.find((a) => a.svg)?.svg;
    if (!svg) throw new Error('Kein Logo geliefert');
    p.logoSvg = svg;
    try { const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); if (last?.plan?.name === p.name) { last.plan.logoSvg = svg; localStorage.setItem(LAST_KEY, JSON.stringify(last)); } } catch { /* ignore */ }
    showLogo(logo, note, svg);
  } catch (error) {
    note.textContent = `Logo nicht gezeichnet: ${error.message}`;
  }
}
function showLogo(logo, note, svg) {
  const img = new Image();
  img.alt = 'Logo';
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const box = el('div', 'biz-logo-real');
  box.append(img);
  logo.replaceWith(box);
  note.textContent = 'Logo: echte Vektorgrafik von Jarvis';
  sfx('panel');
}

// The real website for the brand, built by Jarvis Studio while you watch.
async function startSite(body) {
  site.status = 'läuft';
  site.steps = ['Auftrag an Jarvis Studio'];
  site.error = '';
  renderSite(body);
  try {
    const r = await fetch('/api/studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'build', prompt: mission.brief || `Online-Shop für ${mission.plan.name}` }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
    site.id = data.id;
    clearInterval(site.poll);
    site.poll = setInterval(() => pollSite(body), 2000);
  } catch (error) {
    site.status = 'fehler';
    site.error = error.message;
    renderSite(body);
  }
}
async function pollSite(body) {
  try {
    const r = await fetch(`/api/studio?id=${encodeURIComponent(site.id)}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
    site.steps = ['Auftrag an Jarvis Studio', ...(data.steps || [])];
    if (data.status === 'fertig') { site.status = 'fertig'; site.result = data.result; clearInterval(site.poll); sfx('done'); deps.result({ title: `Website: ${mission.plan?.name || ''}`, detail: data.result?.title || 'fertig gebaut', button: 'Ansehen', onClick: () => deps.openStudioJob?.(site.id, mission.brief) }); if (!ui.root.hidden) setPhase('MISSION ABGESCHLOSSEN', 'FERTIG'); }
    else if (data.status === 'fehler') { site.status = 'fehler'; site.error = data.error || 'Unbekannter Fehler'; clearInterval(site.poll); sfx('error'); }
  } catch (error) {
    site.status = 'fehler';
    site.error = error.message;
    clearInterval(site.poll);
  }
  const live = ui?.stage.querySelector('.biz-live');
  renderSite(live || body);
}
function renderSite(body) {
  const btn = ui?.stage.querySelector('.biz-done .biz-go');
  if (btn && !btn.disabled) btn.textContent = site.status === 'fertig' ? 'Website im Studio öffnen' : site.status === 'läuft' ? 'Website wird gebaut …' : 'Website bauen';
  if (!body) return;
  if (!site.status) {
    const go = el('button', 'biz-go', 'Website jetzt bauen');
    go.type = 'button';
    go.addEventListener('click', () => startSite(body));
    body.replaceChildren(el('p', 'biz-text', 'Jarvis Studio baut den echten Online-Shop zur Marke – mit Produktseiten, Bildern und Warenkorb.'), go);
    return;
  }
  if (site.status === 'fertig' && site.result?.files) {
    const frame = el('iframe', 'biz-frame');
    frame.title = 'Website-Vorschau';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = buildPreview(site.result, { csp: SITE_CSP });
    const open = el('button', 'biz-go', 'Im Studio öffnen');
    open.type = 'button';
    open.addEventListener('click', () => { deps.openStudioJob?.(site.id, mission.brief); close(); });
    const bar = el('div', 'biz-actions');
    bar.append(open);
    body.replaceChildren(frame, bar);
    return;
  }
  const list = el('ol', 'biz-site-steps');
  site.steps.forEach((step, i) => list.append(el('li', i === site.steps.length - 1 && site.status === 'läuft' ? 'now' : 'ok', step)));
  body.replaceChildren(list);
  if (site.status === 'läuft') body.append(el('p', 'biz-note', 'Läuft … meist 1–3 Minuten. Du kannst den Business-Modus schließen, Jarvis baut weiter.'));
  if (site.status === 'fehler') {
    const again = el('button', 'biz-go', 'Nochmal versuchen');
    again.type = 'button';
    again.addEventListener('click', () => startSite(body));
    body.append(el('p', 'biz-error-text', `Website nicht gebaut: ${site.error}`), again);
  }
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

// Only one big mode at a time: close when another one opens.
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'biz') closeQuiet(); });
