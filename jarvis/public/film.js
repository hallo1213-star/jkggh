// "Film" look (like the videos): red reactor start screen, big headline that
// follows Jarvis' real state, tabs Normal / Business / Websites and the
// right column with Aufträge (steps of the current request) and Vorgänge (log).
const $ = (id) => document.getElementById(id);
const isFilm = () => document.body.classList.contains('theme-film');

const HEADLINES = {
  offline: ['Tipp auf den Reaktor.', 'Ich bin bereit.'],
  connecting: ['Einen Moment.', 'Ich fahre hoch.'],
  listening: ['Ich höre zu.', 'Erzähl mir den Plan.'],
  thinking: ['Verstanden.', 'Ich fang an.'],
  speaking: ['Hier ist,', 'was ich habe.'],
  error: ['Störung.', 'Ich zeig dir, was los ist.']
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
}

function renderHead() {
  const mode = document.body.dataset.mode || 'offline';
  const muted = $('mic-toggle')?.getAttribute('aria-pressed') === 'true';
  const [a, b] = muted && mode === 'listening' ? ['Mikro ist stumm.', 'Tipp mir einfach.'] : HEADLINES[mode] || HEADLINES.listening;
  const line = $('film-headline');
  if (line && line.dataset.mode !== `${mode}${muted}`) {
    line.dataset.mode = `${mode}${muted}`;
    line.replaceChildren(document.createTextNode(a), document.createElement('br'), document.createTextNode(b));
    line.classList.remove('swap');
    void line.offsetWidth;
    line.classList.add('swap');
  }
  const greet = $('film-greet');
  if (greet) greet.textContent = `${greeting()}.`;
  const hint = $('film-hint');
  if (hint) hint.textContent = mode === 'offline' ? 'Tipp auf den Reaktor, um Jarvis zu starten.' : mode === 'error' ? 'Verbindung prüfen – unten „Neu verbinden“.' : `Sag einfach, was du brauchst … oder tipp ${innerWidth < 760 ? 'unten' : 'links'}.`;
}

// --- start screen ------------------------------------------------------------------
let introState = 'idle'; // idle → starting → done
function intro() {
  const box = $('film-intro');
  const caption = $('film-intro-caption');
  if (!box) return;
  const mode = document.body.dataset.mode || 'offline';
  if (!isFilm() || introState === 'done') { box.hidden = true; return; }
  box.hidden = false;
  if (introState === 'starting') {
    if (mode === 'listening' || mode === 'speaking' || mode === 'thinking') {
      caption.textContent = 'Ich höre zu …';
      introState = 'done';
      setTimeout(() => { box.classList.add('out'); setTimeout(() => { box.hidden = true; box.classList.remove('out'); }, 700); }, 1100);
    } else if (mode === 'error' || (mode === 'offline' && !$('activate')?.hidden && !$('activate')?.disabled)) {
      caption.textContent = 'Das hat nicht geklappt – tippen zum erneut Versuchen';
      box.classList.remove('starting');
      introState = 'idle';
    }
  }
}
function startFromIntro() {
  if (introState !== 'idle') return;
  const activate = $('activate');
  if (!activate || activate.hidden) { introState = 'done'; intro(); return; }
  introState = 'starting';
  $('film-intro').classList.add('starting');
  $('film-intro-caption').textContent = 'Ja, Boss?';
  activate.click();
}

// --- tabs --------------------------------------------------------------------------
function setTab(name) {
  for (const b of document.querySelectorAll('#film-tabs button')) b.setAttribute('aria-pressed', String(b.dataset.tab === name));
}

function sideTabs() {
  const side = document.querySelector('.hud-side');
  if (!side || side.querySelector('.film-side-tabs')) return;
  const bar = document.createElement('div');
  bar.className = 'film-side-tabs';
  for (const [key, label] of [['auftraege', 'Aufträge'], ['vorgaenge', 'Vorgänge']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.side = key;
    b.textContent = label;
    b.addEventListener('click', () => { document.body.dataset.side = key; for (const x of bar.children) x.setAttribute('aria-pressed', String(x === b)); });
    bar.append(b);
  }
  side.prepend(bar);
  document.body.dataset.side = 'auftraege';
  bar.firstChild.setAttribute('aria-pressed', 'true');
}

export function filmTab(name) { setTab(name); }

export function initFilm({ openBusiness, openFactory, openSuit, onNormal }) {
  renderHead();
  sideTabs();
  new MutationObserver(() => { renderHead(); intro(); }).observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'class'] });
  const mic = $('mic-toggle');
  if (mic) new MutationObserver(renderHead).observe(mic, { attributes: true, attributeFilter: ['aria-pressed'] });
  setInterval(renderHead, 60_000);
  $('film-intro')?.addEventListener('click', startFromIntro);
  for (const b of document.querySelectorAll('#film-tabs button')) {
    b.addEventListener('click', () => {
      setTab(b.dataset.tab);
      if (b.dataset.tab === 'business') openBusiness();
      else if (b.dataset.tab === 'apps') openFactory?.();
      else if (b.dataset.tab === 'anzug') openSuit?.();
      else if (b.dataset.tab === 'websites') { $('studio-button')?.click(); setTimeout(() => setTab('normal'), 400); }
      else onNormal?.();
    });
  }
  intro();
}
