// Neutral animation for every function without its own module: a small
// holographic task chip above the core – spinning while it runs, check mark
// only when it really finished, red when it failed.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let dock = null;
function getDock() {
  if (dock?.isConnected) return dock;
  dock = el('div', 'cae-dock'); dock.setAttribute('aria-live', 'polite');
  document.body.append(dock);
  return dock;
}
export const neutralModule = {
  create({ action }) {
    const chip = el('div', 'cae-chip run');
    chip.append(el('span', 'cae-ring'), el('span', 'cae-label', action.label || 'Aktion'));
    getDock().append(chip);
    const remove = (ms) => setTimeout(() => { chip.classList.add('out'); setTimeout(() => chip.remove(), 400); }, ms);
    return {
      progress() {},
      complete() { chip.className = 'cae-chip ok'; remove(1400); },
      fail(info) { chip.className = 'cae-chip bad'; chip.querySelector('.cae-label').textContent = `${action.label || 'Aktion'} – ${String(info?.reason || 'Fehler').slice(0, 60)}`; remove(4500); }
    };
  }
};
