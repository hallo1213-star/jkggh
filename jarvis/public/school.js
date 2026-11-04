// Vertretungsplan card: the days with the changes for his class (from DSBmobile).
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let box = null;
export function closeSchool() { box?.remove(); box = null; }
if (typeof document !== 'undefined') document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'school') closeSchool(); });
export function showSchool({ klasse, days = [], images = [] }) {
  closeSchool();
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'school' }));
  box = el('div', 'sp');
  const card = el('div', 'sp-card');
  const head = el('header'); const x = el('button', 'sp-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Schließen'); x.addEventListener('click', closeSchool);
  head.append(el('p', 'sp-kicker', 'JARVIS · VERTRETUNGSPLAN'), x);
  card.append(head, el('h3', 'sp-title', `Klasse ${klasse}`));
  if (!days.length && !images.length) card.append(el('p', 'sp-empty', 'Für diesen Tag steht noch kein Plan in DSBmobile.'));
  for (const d of days) {
    const sec = el('section', 'sp-day'); sec.append(el('h4', '', d.title || 'Plan'));
    if (!d.entries.length) sec.append(el('p', 'sp-ok', '✓ Keine Änderungen für deine Klasse'));
    else {
      const list = el('ul', 'sp-list');
      for (const e of d.entries) {
        const li = el('li', /entfall|fällt|frei|ausfall/i.test(`${e.art} ${e.text}`) ? 'cancel' : '');
        li.append(el('b', 'sp-hour', e.stunde || '?'));
        const info = el('div'); info.append(el('span', 'sp-what', [e.art, e.fach].filter(Boolean).join(' · ') || 'Änderung'));
        const more = [e.vertreter && e.vertreter !== '---' ? `Vertretung: ${e.vertreter}` : '', e.raum && e.raum !== '---' ? `Raum: ${e.raum}` : '', e.statt ? `statt ${e.statt}` : '', e.text || ''].filter(Boolean).join(' · ');
        if (more) info.append(el('small', '', more));
        li.append(info); list.append(li);
      }
      sec.append(list);
    }
    card.append(sec);
  }
  if (images.length && !days.length) {
    card.append(el('p', 'sp-empty', 'Deine Schule stellt den Plan als Bild/PDF ein:'));
    for (const im of images) { const a = el('a', 'sp-img'); a.href = im.url; a.target = '_blank'; a.rel = 'noopener'; if (/\.pdf/i.test(im.url)) a.textContent = `📄 ${im.title}`; else { const img = el('img'); img.src = im.url; img.alt = im.title; a.append(img); } card.append(a); }
  }
  card.append(el('p', 'sp-note', 'Quelle: DSBmobile (inoffizielle Schnittstelle) – im Zweifel gilt der Aushang der Schule.'));
  box.append(card); document.body.append(box);
}
