// Globe: the existing 3D globe flies to the real place (globe.js / Cesium);
// this adds a target-lock HUD with the real coordinates on top of it.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const deg = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
export const globeModule = {
  create({ action }) {
    const root = el('div', 'cae-lock');
    root.append(el('div', 'cae-lock-ring'), el('div', 'cae-lock-cross'));
    const txt = el('p', 'cae-lock-text', 'ZIELERFASSUNG …');
    root.append(txt);
    document.body.append(root);
    let place = null;
    const close = (ms) => setTimeout(() => { root.classList.add('out'); setTimeout(() => root.remove(), 500); }, ms);
    return {
      data(p) { place = p; txt.textContent = `ANFLUG · ${String(p.name || '').slice(0, 40)} · ${deg(Number(p.lat), 'N', 'S')} ${deg(Number(p.lon), 'O', 'W')}`; },
      complete() { if (place) { txt.textContent = `ZIEL ERFASST · ${String(place.name || '').slice(0, 40)}`; root.classList.add('locked'); close(4200); } else close(300); },
      fail(info) { txt.textContent = `ORT NICHT GEFUNDEN – ${String(info?.reason || '').slice(0, 60)}`; root.classList.add('bad'); close(3500); },
      label: action.label
    };
  }
};
