// Everyday cards: translator, recipe, trains & buses, holidays, calculator,
// currency, QR code, quiz, countdown, article summary and Bundesliga.
let ctx = { cardMessage: () => {}, toast: () => {}, addToShopping: () => 0 };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick, className = 'ev-btn') {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const safeLink = (href, text) => (/^https:\/\//.test(href || '') ? Object.assign(el('a', 'ev-link', text), { href, target: '_blank', rel: 'noopener noreferrer' }) : el('span', '', text));
const head = (icon, title, sub) => {
  const h = el('div', 'ev-head');
  const t = el('div');
  t.append(el('b', '', title));
  if (sub) t.append(el('small', '', sub));
  h.append(el('span', 'ev-icon', icon), t);
  return h;
};
const card = (kind) => el('div', `info-card ev-card ev-${kind}`);
const num = (value) => Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 });

function speak(text, lang) {
  if (!('speechSynthesis' in window)) { ctx.toast('Vorlesen geht in diesem Browser nicht.', 'error'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (lang) u.lang = lang;
  u.rate = 0.92;
  speechSynthesis.speak(u);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    ctx.toast('Kopiert');
  } catch {
    ctx.toast('Kopieren ging nicht', 'error');
  }
}

// --- 1. Translator ---
function translateCard({ result }) {
  const c = card('translate');
  c.append(head('🌍', `${result.from || 'Text'} → ${result.language}`));
  c.append(el('p', 'ev-original', result.original));
  const big = el('p', 'ev-translation', result.translation);
  big.dir = 'auto';
  c.append(big);
  if (result.pronunciation) c.append(el('p', 'ev-muted', `🗣️ ${result.pronunciation}`));
  if (result.notes) c.append(el('p', 'ev-muted', `💡 ${result.notes}`));
  const actions = el('div', 'ev-actions');
  actions.append(button('🔊 Vorlesen', () => speak(result.translation, result.lang)), button('📋 Kopieren', () => copy(result.translation)));
  c.append(actions);
  ctx.cardMessage('Übersetzer', c);
}

// --- 2. Recipe ---
function recipeCard({ recipe }) {
  const c = card('recipe');
  let servings = recipe.servings;
  const meta = [recipe.minutes ? `⏱ ${recipe.minutes} min` : '', recipe.difficulty ? `📊 ${recipe.difficulty}` : '', recipe.kcal ? `🔥 ca. ${recipe.kcal} kcal/Portion` : ''].filter(Boolean).join(' · ');
  c.append(head('🍳', recipe.title, meta));
  const portions = el('div', 'ev-stepper');
  const label = el('span');
  const list = el('ul', 'ev-ingredients');
  const render = () => {
    label.textContent = `${servings} ${servings === 1 ? 'Portion' : 'Portionen'}`;
    list.replaceChildren(...recipe.ingredients.map((i) => {
      const li = el('li');
      const amount = i.amount ? num((i.amount * servings) / recipe.servings) : '';
      li.append(el('b', '', [amount, i.unit].filter(Boolean).join(' ')), el('span', '', i.item));
      return li;
    }));
  };
  portions.append(button('−', () => { if (servings > 1) { servings -= 1; render(); } }, 'ev-round'), label, button('+', () => { if (servings < 24) { servings += 1; render(); } }, 'ev-round'));
  render();
  c.append(portions, list);
  const steps = el('ol', 'ev-steps');
  recipe.steps.forEach((s) => {
    const li = el('li', '', s);
    li.addEventListener('click', () => li.classList.toggle('done'));
    steps.append(li);
  });
  c.append(el('p', 'ev-label', 'Zubereitung (antippen = erledigt)'), steps);
  if (recipe.tips) c.append(el('p', 'ev-muted', `👨‍🍳 ${recipe.tips}`));
  const actions = el('div', 'ev-actions');
  const add = button('🛒 Zutaten auf Einkaufsliste', () => {
    const added = ctx.addToShopping(recipe.ingredients.map((i) => i.item));
    add.textContent = added ? `✓ ${added} Zutaten hinzugefügt` : '✓ Schon auf der Liste';
    add.disabled = true;
  });
  actions.append(add);
  c.append(actions);
  ctx.cardMessage('Rezept', c);
}

// --- 3. Trains & buses ---
function journeysCard({ trip }) {
  const c = card('transit');
  c.append(head('🚆', `${trip.from} → ${trip.to}`, 'Live-Daten der Deutschen Bahn'));
  if (!trip.journeys.length) c.append(el('p', 'ev-muted', 'Keine Verbindungen gefunden.'));
  for (const j of trip.journeys) {
    const row = el('div', `ev-journey${j.cancelled ? ' cancelled' : ''}`);
    const times = el('div', 'ev-times');
    times.append(el('b', '', j.departure), el('span', 'ev-line-bar'), el('b', '', j.arrival));
    const info = el('div', 'ev-jinfo');
    info.append(el('span', '', `${j.minutes ?? '?'} min · ${j.changes === 0 ? 'direkt' : `${j.changes}× umsteigen`}${j.platform ? ` · Gl. ${j.platform}` : ''}`));
    if (j.delay) info.append(el('span', 'ev-delay', `+${j.delay} min`));
    if (j.cancelled) info.append(el('span', 'ev-delay', 'Ausfall'));
    const lines = el('div', 'ev-lines');
    j.legs.forEach((l) => lines.append(el('span', 'ev-pill', l.line || '–')));
    row.append(times, info, lines);
    row.title = j.legs.map((l) => `${l.departure} ${l.from} → ${l.arrival} ${l.to} (${l.line})`).join('\n');
    c.append(row);
  }
  const actions = el('div', 'ev-actions');
  actions.append(safeLink(trip.link, '🎫 Bei bahn.de ansehen / buchen'));
  c.append(actions);
  ctx.cardMessage('Bahn & Bus', c);
}

function departuresCard({ board }) {
  const c = card('transit');
  c.append(head('🚏', board.stop, 'Abfahrten · nächste 60 Minuten'));
  const table = el('div', 'ev-board');
  if (!board.departures.length) table.append(el('p', 'ev-muted', 'Keine Abfahrten gefunden.'));
  for (const d of board.departures) {
    const row = el('div', `ev-dep${d.cancelled ? ' cancelled' : ''}`);
    row.append(el('b', 'ev-dtime', d.time), el('span', 'ev-pill', d.line), el('span', 'ev-dir', d.direction), el('span', d.delay || d.cancelled ? 'ev-delay' : 'ev-muted', d.cancelled ? 'fällt aus' : d.delay ? `+${d.delay}` : d.platform ? `Gl. ${d.platform}` : ''));
    table.append(row);
  }
  c.append(table);
  ctx.cardMessage('Abfahrten', c);
}

// --- 4. Holidays ---
const dayFmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });

function holidaysCard({ data }) {
  const c = card('holidays');
  c.append(head('🏖️', `Ferien & Feiertage – ${data.state}`));
  const next = data.ferien[0];
  if (next) {
    const hero = el('div', 'ev-hero');
    hero.append(el('b', '', next.now ? '🎉' : String(next.inDays)), el('span', '', next.now ? `Gerade: ${next.name}!` : `${next.inDays === 1 ? 'Tag' : 'Tage'} bis: ${next.name}`));
    c.append(hero);
  }
  c.append(el('p', 'ev-label', 'Schulferien'));
  const fl = el('ul', 'ev-rows');
  data.ferien.forEach((f) => {
    const li = el('li', f.now ? 'now' : '');
    li.append(el('b', '', f.name), el('span', '', f.start === f.end ? dayFmt(f.start) : `${dayFmt(f.start)} – ${dayFmt(f.end)}`), el('em', '', f.days === 1 ? '1 Tag' : `${f.days} Tage`));
    fl.append(li);
  });
  c.append(fl, el('p', 'ev-label', 'Feiertage'));
  const hl = el('ul', 'ev-rows');
  data.feiertage.forEach((f) => {
    const li = el('li');
    li.append(el('b', '', f.name), el('span', '', dayFmt(f.start)), el('em', '', f.inDays === 0 ? 'heute' : `in ${f.inDays} T.`));
    hl.append(li);
  });
  c.append(hl, el('p', 'card-source', 'Quelle: OpenHolidays API'));
  ctx.cardMessage('Ferien', c);
}

// --- 5. Calculator & currency ---
function calcCard({ expression, result }) {
  const c = card('calc');
  c.append(el('p', 'ev-expr', expression), el('p', 'ev-result', `= ${result}`));
  const actions = el('div', 'ev-actions');
  actions.append(button('📋 Ergebnis kopieren', () => copy(result)));
  c.append(actions);
  ctx.cardMessage('Rechner', c);
}

function currencyCard({ fx }) {
  const c = card('currency');
  c.append(head('💱', 'Währungsrechner', `EZB-Kurs vom ${fx.date ? dayFmt(fx.date) : 'heute'}`));
  const row = el('div', 'ev-fx');
  const input = Object.assign(el('input', 'ev-input'), { type: 'number', min: '0', step: 'any', value: String(fx.amount), inputMode: 'decimal' });
  input.setAttribute('aria-label', `Betrag in ${fx.from}`);
  const out = el('b', 'ev-result');
  const update = () => { out.textContent = `${num((Number(input.value) || 0) * fx.rate)} ${fx.to}`; };
  input.addEventListener('input', update);
  update();
  row.append(input, el('span', 'ev-muted', `${fx.from} =`), out);
  c.append(row, el('p', 'ev-muted', `1 ${fx.from} = ${fx.rate.toLocaleString('de-DE', { maximumFractionDigits: 5 })} ${fx.to} · Banken nehmen meist etwas Aufschlag`));
  ctx.cardMessage('Währung', c);
}

// --- 6. QR code ---
function qrCard({ kind, dataUrl, caption }) {
  if (!/^data:image\/png;base64,/.test(dataUrl || '')) return;
  const c = card('qr');
  c.append(head('🔳', kind === 'wlan' ? 'WLAN-QR-Code' : 'QR-Code', caption));
  const img = Object.assign(el('img', 'ev-qr'), { src: dataUrl, alt: 'QR-Code' });
  const actions = el('div', 'ev-actions');
  const save = Object.assign(el('a', 'ev-btn', '⬇️ Speichern'), { href: dataUrl, download: kind === 'wlan' ? 'wlan-qr.png' : 'qr-code.png' });
  actions.append(save);
  if (navigator.share) {
    actions.append(button('📤 Teilen', async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.share({ files: [new File([blob], 'qr-code.png', { type: 'image/png' })] });
      } catch { /* cancelled */ }
    }));
  }
  c.append(img, actions);
  if (kind === 'wlan') c.append(el('p', 'ev-muted', 'Kamera aufs Bild halten → Gäste sind sofort im WLAN. Das Passwort wird nirgends gespeichert.'));
  ctx.cardMessage('QR-Code', c);
}

// --- 7. Quiz ---
function quizCard({ quiz }) {
  const c = card('quiz');
  let index = 0;
  let score = 0;
  const top = head('🧠', quiz.title);
  const progress = el('div', 'ev-progress');
  const bar = el('span');
  progress.append(bar);
  const body = el('div', 'ev-quiz-body');
  c.append(top, progress, body);
  const show = () => {
    bar.style.width = `${(index / quiz.questions.length) * 100}%`;
    if (index >= quiz.questions.length) {
      const pct = Math.round((score / quiz.questions.length) * 100);
      const medal = pct === 100 ? '🏆' : pct >= 70 ? '🥇' : pct >= 40 ? '👍' : '📚';
      const done = el('div', 'ev-hero');
      done.append(el('b', '', `${medal} ${score}/${quiz.questions.length}`), el('span', '', pct === 100 ? 'Perfekt! Alles richtig.' : pct >= 70 ? 'Stark gemacht!' : pct >= 40 ? 'Gut – da geht noch was.' : 'Übung macht den Meister. Nochmal?'));
      body.replaceChildren(done, button('🔁 Nochmal spielen', () => { index = 0; score = 0; show(); }));
      return;
    }
    const q = quiz.questions[index];
    const box = el('div');
    box.append(el('p', 'ev-label', `Frage ${index + 1} von ${quiz.questions.length} · ${score} Punkte`), el('p', 'ev-question', q.q));
    const options = el('div', 'ev-options');
    const explain = el('p', 'ev-explain');
    explain.hidden = true;
    const nextBtn = button(index + 1 < quiz.questions.length ? 'Weiter →' : 'Ergebnis', () => { index += 1; show(); });
    nextBtn.hidden = true;
    q.options.forEach((option, i) => {
      const b = button(`${'ABCD'[i]}  ${option}`, () => {
        options.querySelectorAll('button').forEach((x, j) => { x.disabled = true; if (j === q.answer) x.classList.add('right'); });
        if (i === q.answer) { score += 1; b.classList.add('right'); explain.textContent = `✅ Richtig! ${q.explain}`; } else { b.classList.add('wrong'); explain.textContent = `❌ Leider falsch. ${q.explain}`; }
        navigator.vibrate?.(i === q.answer ? 30 : [40, 40, 40]);
        explain.hidden = false;
        nextBtn.hidden = false;
      }, 'ev-option');
      options.append(b);
    });
    box.append(options, explain, nextBtn);
    body.replaceChildren(box);
  };
  show();
  ctx.cardMessage('Quiz', c);
}

// --- 8. Countdown ---
function countdownCard({ countdown }) {
  const target = new Date(countdown.target).getTime();
  if (!Number.isFinite(target)) return;
  const c = card('countdown');
  c.append(head('⏳', countdown.title, new Date(target).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })));
  const grid = el('div', 'ev-count');
  const cells = ['Tage', 'Std', 'Min', 'Sek'].map((name) => {
    const cell = el('div');
    const value = el('b', '', '0');
    cell.append(value, el('small', '', name));
    grid.append(cell);
    return value;
  });
  c.append(grid);
  const tick = () => {
    const left = Math.max(target - Date.now(), 0);
    const parts = [Math.floor(left / 86_400_000), Math.floor(left / 3_600_000) % 24, Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60];
    parts.forEach((v, i) => { cells[i].textContent = i === 0 ? String(v) : String(v).padStart(2, '0'); });
    if (left === 0) { grid.classList.add('ev-done'); c.querySelector('.ev-head b').textContent = `🎉 ${countdown.title} – es ist so weit!`; return false; }
    return true;
  };
  tick();
  ctx.cardMessage('Countdown', c);
  const timer = setInterval(() => { if (!c.isConnected || !tick()) clearInterval(timer); }, 1000);
}

// --- 9. Article summary ---
function summaryCard({ result }) {
  const c = card('summary');
  c.append(head('📰', result.title, `${result.site} · Original ca. ${result.readingMinutes} min Lesezeit`));
  if (result.summary) c.append(el('p', 'ev-lead', result.summary));
  const list = el('ul', 'ev-points');
  result.points.forEach((p) => list.append(el('li', '', p)));
  c.append(list);
  const actions = el('div', 'ev-actions');
  actions.append(safeLink(result.url, '🔗 Original öffnen'), button('📋 Kopieren', () => copy([result.title, result.summary, ...result.points.map((p) => `• ${p}`)].join('\n'))));
  c.append(actions, el('p', 'card-source', 'KI-Zusammenfassung – im Zweifel das Original lesen'));
  ctx.cardMessage('Zusammenfassung', c);
}

// --- 10. Bundesliga ---
function teamIcon(url) {
  if (!/^https:\/\//.test(url || '')) return el('span', 'ev-crest');
  const img = Object.assign(el('img', 'ev-crest'), { src: url, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
  img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
  return img;
}

function footballCard({ data }) {
  const c = card('football');
  c.append(head('⚽', data.league, `Saison ${data.season}${data.matchday ? ` · ${data.matchday}` : ''}`));
  const tabs = el('div', 'ev-tabs');
  const panel = el('div');
  const showMatches = () => {
    const list = el('div', 'ev-matches');
    if (!data.matches.length) list.append(el('p', 'ev-muted', 'Keine Spiele gefunden.'));
    data.matches.forEach((m) => {
      const row = el('div', `ev-match${m.live ? ' live' : ''}`);
      const home = el('span', 'ev-team home');
      home.append(el('span', '', m.home), teamIcon(m.homeIcon));
      const away = el('span', 'ev-team');
      away.append(teamIcon(m.awayIcon), el('span', '', m.away));
      row.append(home, el('b', 'ev-score', m.score || '–:–'), away, el('small', 'ev-muted', m.live ? '● LIVE' : m.finished ? 'Ende' : m.kickoff));
      list.append(row);
    });
    panel.replaceChildren(list);
  };
  const showTable = () => {
    const table = el('table', 'ev-table');
    const thead = el('tr');
    ['#', 'Verein', 'Sp', 'Tore', 'Diff', 'Pkt'].forEach((h) => thead.append(el('th', '', h)));
    table.append(thead);
    data.table.forEach((r) => {
      const tr = el('tr', `${r.team === data.focus ? 'focus' : ''} ${r.rank <= 4 ? 'cl' : r.rank >= data.table.length - 1 ? 'down' : ''}`.trim());
      const team = el('td', 'ev-tteam');
      team.append(teamIcon(r.icon), el('span', '', r.short));
      tr.append(el('td', '', String(r.rank)), team, el('td', '', String(r.played)), el('td', '', r.goals), el('td', '', `${r.diff > 0 ? '+' : ''}${r.diff}`), el('td', 'ev-pts', String(r.points)));
      table.append(tr);
    });
    const wrap = el('div', 'ev-table-wrap');
    wrap.append(table);
    panel.replaceChildren(wrap);
  };
  const t1 = button('Spieltag', () => { t1.classList.add('active'); t2.classList.remove('active'); showMatches(); }, 'ev-tab active');
  const t2 = button('Tabelle', () => { t2.classList.add('active'); t1.classList.remove('active'); showTable(); }, 'ev-tab');
  tabs.append(t1, t2);
  c.append(tabs, panel, el('p', 'card-source', 'Daten: OpenLigaDB'));
  if (data.focus) t2.click(); else showMatches();
  ctx.cardMessage('Fußball', c);
}


// --- Route planner: "be there by 08:00" ---
const MODE_INFO = { oepnv: ['🚌', 'Bus & Bahn'], zu_fuss: ['🚶', 'Zu Fuß'], fahrrad: ['🚲', 'Fahrrad'], auto: ['🚗', 'Auto'] };
const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');

function routeMap(option, route) {
  const paths = option.legs ? option.legs.map((l) => ({ walking: l.walking, pts: l.path || [] })) : [{ walking: option.mode === 'zu_fuss', pts: option.path || [] }];
  const all = paths.flatMap((p) => p.pts);
  const a = [route.fromPoint.lon, route.fromPoint.lat];
  const b = [route.toPoint.lon, route.toPoint.lat];
  if (!all.length) paths.push({ walking: true, pts: [a, b] });
  const pts = [...all, a, b];
  const lat0 = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * kx);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 320;
  const H = 150;
  const scale = Math.min((W - 30) / Math.max(maxX - minX, 1e-6), (H - 30) / Math.max(maxY - minY, 1e-6));
  const proj = (p) => [15 + (p[0] * kx - minX) * scale + ((W - 30) - (maxX - minX) * scale) / 2, H - 15 - (p[1] - minY) * scale - ((H - 30) - (maxY - minY) * scale) / 2];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'ev-routemap');
  svg.setAttribute('aria-label', 'Streckenverlauf');
  for (const p of paths) {
    if (p.pts.length < 2) continue;
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', p.pts.map((q) => proj(q).map((v) => v.toFixed(1)).join(',')).join(' '));
    line.setAttribute('class', p.walking ? 'walk' : 'ride');
    svg.append(line);
  }
  for (const [p, cls] of [[a, 'start'], [b, 'end']]) {
    const dot = document.createElementNS(ns, 'circle');
    const [x, y] = proj(p);
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
    dot.setAttribute('r', '6');
    dot.setAttribute('class', cls);
    svg.append(dot);
  }
  return svg;
}

function routeCard({ route }) {
  const c = card('route');
  let current = route.options.find((o) => o.mode === route.recommended) || route.options[0];
  c.append(head('🧭', `Route zu ${route.to.split(',')[0]}`, `${route.day} · spätestens da um ${hm(route.arriveBy)}`));
  const hero = el('div', 'ev-hero ev-leave');
  const body = el('div');
  const modes = el('div', 'ev-modes');
  const render = () => {
    const [icon, name] = MODE_INFO[current.mode];
    const wait = Math.round((new Date(route.arriveBy) - new Date(current.arrive)) / 60000);
    hero.replaceChildren(el('b', '', hm(current.leave)), (() => { const t = el('span'); t.append(el('strong', '', 'Losgehen'), el('small', '', `${icon} ${name} · ${current.minutes} min · an ${hm(current.arrive)}${wait > 0 ? ` · ${wait} min Puffer` : ''}`)); return t; })());
    const timeline = el('ol', 'ev-timeline');
    const add = (time, title, sub, cls) => { const li = el('li', cls); li.append(el('b', '', time), (() => { const d = el('div'); d.append(el('span', '', title)); if (sub) d.append(el('small', '', sub)); return d; })()); timeline.append(li); };
    add(hm(current.leave), `Start: ${route.from.split(',').slice(0, 2).join(',')}`, '', 'start');
    if (current.legs) {
      current.legs.forEach((l) => {
        if (l.walking) add(hm(l.departure), `🚶 Zu Fuß bis ${l.to || 'Ziel'}`, l.distance ? `${l.distance} m · ca. ${Math.max(1, Math.round((new Date(l.arrival) - new Date(l.departure)) / 60000))} min` : '', 'walk');
        else add(hm(l.departure), `${l.line} ${l.direction ? `→ ${l.direction}` : ''}`, `ab ${l.from}${l.platform ? ` · Gleis ${l.platform}` : ''} · an ${hm(l.arrival)} ${l.to}${l.delay ? ` · +${l.delay} min` : ''}`, 'ride');
      });
    } else {
      add(hm(current.leave), `${MODE_INFO[current.mode][0]} ${MODE_INFO[current.mode][1]}`, `${current.km ? `${String(current.km).replace('.', ',')} km · ` : ''}${current.minutes} min${current.mode === 'auto' ? ' (inkl. Verkehr & Parken)' : ''}`, current.mode === 'zu_fuss' ? 'walk' : 'ride');
    }
    add(hm(current.arrive), `Ankunft: ${route.to.split(',').slice(0, 2).join(',')}`, '', 'end');
    const parts = [timeline, routeMap(current, route)];
    if (current.alternatives?.length) {
      const alt = el('p', 'ev-muted', `Andere Verbindungen: ${current.alternatives.map((j) => `los ${hm(j.leave)} → an ${hm(j.arrive)}`).join(' · ')}`);
      parts.push(alt);
    }
    body.replaceChildren(...parts);
    modes.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === current.mode));
    link.href = link.href.replace(/travelmode=\w+/, `travelmode=${{ oepnv: 'transit', zu_fuss: 'walking', fahrrad: 'bicycling', auto: 'driving' }[current.mode]}`);
  };
  const link = safeLink(route.link, '🗺️ In Google Maps öffnen');
  [...route.options].sort((x, y) => Object.keys(MODE_INFO).indexOf(x.mode) - Object.keys(MODE_INFO).indexOf(y.mode)).forEach((o) => {
    const [icon, name] = MODE_INFO[o.mode];
    const b = button(`${icon} ${o.minutes} min`, () => { current = o; render(); }, 'ev-mode');
    b.dataset.mode = o.mode;
    b.title = `${name}: los um ${hm(o.leave)}`;
    modes.append(b);
  });
  c.append(hero, modes, body);
  if (route.reason) c.append(el('p', 'ev-muted', `💡 ${route.reason}`));
  const actions = el('div', 'ev-actions');
  actions.append(link);
  c.append(actions, el('p', 'card-source', 'Fahrplan: Deutsche Bahn (live) · Wege: OpenStreetMap'));
  render();
  ctx.cardMessage('Route', c);
}

const RENDERERS = {
  route: routeCard,
  translate: translateCard,
  recipe: recipeCard,
  journeys: journeysCard,
  departures: departuresCard,
  holidays: holidaysCard,
  calc: calcCard,
  currency: currencyCard,
  qr: qrCard,
  quiz: quizCard,
  countdown: countdownCard,
  summary: summaryCard,
  football: footballCard
};

export function isEverydayCard(type) {
  return Object.hasOwn(RENDERERS, type);
}

export function showEverydayCard(message) {
  try {
    RENDERERS[message.type]?.(message);
  } catch (error) {
    console.error('card', message.type, error);
    ctx.toast('Diese Karte konnte nicht angezeigt werden.', 'error');
  }
}

export function initCards(options) {
  ctx = { ...ctx, ...options };
}
