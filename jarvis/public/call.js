// Food orders by phone: the order card in the conversation and a floating
// live window while Jarvis is on the phone (status, transcript, result, hang up).
const $ = (id) => document.getElementById(id);
let notify = () => {};
let panel = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key.includes('-') || key === 'role') node.setAttribute(key, value);
    else node[key] = value;
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false && child !== '') node.append(child);
  return node;
}

export function addOrderCard(order) {
  const transcript = $('transcript');
  transcript.querySelector('.empty')?.remove();
  const card = el('div', { class: 'order-card' },
    el('pre', { class: 'order-summary', textContent: order.summary || '' }),
    order.missing?.length ? el('p', { class: 'order-missing', textContent: `Nicht auf der Karte: ${order.missing.join(', ')}` }) : null,
    order.checked === false ? el('p', { class: 'order-note', textContent: 'Die Speisekarte konnte nicht geprüft werden.' }) : null,
    order.phone ? el('div', { class: 'order-actions' },
      el('a', { class: 'ctrl', href: `tel:${order.phone}`, textContent: `📞 Selbst anrufen (${order.phoneLabel || order.phone})` }),
      el('button', { type: 'button', class: 'ctrl', textContent: 'Kopieren', onclick: () => navigator.clipboard?.writeText(order.summary).then(() => notify('Bestellung kopiert.'), () => {}) })) : null,
    order.manual ? el('p', { class: 'order-note', textContent: 'Automatische Anrufe sind noch nicht eingerichtet (Twilio, siehe README). Tipp auf „Selbst anrufen“ und lies den Zettel vor.' }) : null);
  const item = el('div', { class: 'msg assistant' }, el('span', { class: 'msg-role', textContent: 'Bestellung' }), card);
  transcript.append(item);
  transcript.scrollTop = transcript.scrollHeight;
}

function ensurePanel(restaurant) {
  if (panel) return panel;
  const status = el('span', { class: 'call-status', textContent: 'wählt …' });
  const log = el('div', { class: 'call-log' });
  const result = el('div', { class: 'call-result', hidden: true });
  const hang = el('button', {
    type: 'button',
    class: 'ctrl call-hangup',
    textContent: 'Auflegen',
    onclick: async () => {
      hang.disabled = true;
      try {
        await fetch('/api/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      } catch {
        notify('Auflegen hat nicht geklappt.', 'error');
        hang.disabled = false;
      }
    }
  });
  const close = el('button', { type: 'button', class: 'icon-btn call-close', textContent: '✕', 'aria-label': 'Schließen', hidden: true, onclick: () => { panel.root.remove(); panel = null; } });
  const root = el('section', { class: 'call-panel', role: 'status', 'aria-live': 'polite' },
    el('div', { class: 'call-head' }, el('span', { class: 'call-pulse' }), el('div', { class: 'call-title' }, el('b', { textContent: `☎️ ${restaurant}` }), status), close),
    log, result, el('div', { class: 'call-actions' }, hang));
  document.body.append(root);
  panel = { root, status, log, result, hang, close };
  return panel;
}

const RESULT_TEXT = { angenommen: '✅ Bestellung aufgegeben', teilweise: '⚠️ Teilweise bestellt', abgelehnt: '❌ Nicht angenommen', nicht_erreicht: '📵 Nicht erreicht', unklar: '❔ Ergebnis unklar' };

export function handleCallEvent(message) {
  // A new call replaces the window of a finished one.
  if (panel && panel.root.dataset.state === 'beendet' && message.event === 'status' && message.status === 'wählt') {
    panel.root.remove();
    panel = null;
  }
  const p = ensurePanel(message.restaurant || 'Restaurant');
  if (message.event === 'status') {
    p.status.textContent = message.status;
    p.root.dataset.state = message.status;
  } else if (message.event === 'transcript') {
    p.log.append(el('p', { class: `call-line ${message.role}` }, el('small', { textContent: message.role === 'jarvis' ? 'Jarvis' : 'Restaurant' }), message.content));
    p.log.scrollTop = p.log.scrollHeight;
  } else if (message.event === 'result' || message.event === 'ended') {
    const r = message.result;
    if (r) {
      p.result.hidden = false;
      p.result.replaceChildren(...[el('b', { textContent: RESULT_TEXT[r.status] || r.status }), r.preis ? el('span', { textContent: `Preis: ${r.preis}` }) : null, r.fertigUm ? el('span', { textContent: `Fertig: ${r.fertigUm}` }) : null, r.notiz ? el('span', { textContent: r.notiz }) : null].filter(Boolean));
    }
    if (message.event === 'ended') {
      p.status.textContent = message.status === 'beendet' ? 'beendet' : `beendet (${message.status})`;
      p.root.dataset.state = 'beendet';
      p.hang.hidden = true;
      p.close.hidden = false;
      if (!r) {
        p.result.hidden = false;
        p.result.replaceChildren(el('b', { textContent: 'Keine Bestellung bestätigt.' }));
      }
    }
  }
}

export function initCall({ toast }) {
  notify = toast;
}
