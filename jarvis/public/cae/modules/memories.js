// Memories: the REAL stored memories stream in as data objects, then the
// existing 3D Memory Palace opens (click a node there to read/edit/delete).
// Nothing is invented – with no memories it says so.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
export const memoriesModule = {
  create() {
    const root = el('div', 'cae-mem');
    const head = el('p', 'cae-mem-head', 'GEDÄCHTNIS WIRD GELADEN …');
    const field = el('div', 'cae-mem-field');
    root.append(head, field);
    document.body.append(root);
    const close = (ms) => setTimeout(() => { root.classList.add('out'); setTimeout(() => root.remove(), 600); }, ms);
    let got = false;
    return {
      data(items) {
        got = true;
        const list = Array.isArray(items) ? items.filter((m) => m && m.text) : [];
        head.textContent = list.length ? `GEDÄCHTNIS · ${list.length} ${list.length === 1 ? 'ERINNERUNG' : 'ERINNERUNGEN'}` : 'GEDÄCHTNIS · NOCH KEINE ERINNERUNGEN';
        list.slice(-10).forEach((m, i) => { const chip = el('span', 'cae-mem-chip', String(m.text).slice(0, 48)); chip.style.setProperty('--i', i); chip.style.setProperty('--a', `${(i * 137) % 360}deg`); field.append(chip); });
      },
      complete() { close(got ? 1500 : 200); },
      fail() { head.textContent = 'GEDÄCHTNIS NICHT ERREICHBAR'; root.classList.add('bad'); close(2500); }
    };
  }
};
