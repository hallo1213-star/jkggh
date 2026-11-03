// Invitation card (link for a friend) and guest mode on the friend's device.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let card = null;
export function closeInvite() { card?.remove(); card = null; }
export function showInvite({ url, name, label }, toast = () => {}) {
  closeInvite();
  card = el('div', 'iph inv');
  const box = el('div', 'iph-card');
  const head = el('div', 'iph-head');
  const x = el('button', 'iph-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Schließen'); x.addEventListener('click', closeInvite);
  head.append(el('p', 'iph-kicker', 'JARVIS · EINLADUNG'), x);
  const link = el('input', 'inv-link'); link.readOnly = true; link.value = url; link.setAttribute('aria-label', 'Einladungslink');
  link.addEventListener('focus', () => link.select());
  const copy = el('button', 'iph-go', '📋 Link kopieren'); copy.type = 'button';
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); copy.textContent = '✓ Kopiert'; } catch { link.select(); copy.textContent = 'Markiert – jetzt kopieren'; } });
  box.append(head, el('h3', 'iph-title', `Jarvis für ${name || 'deinen Freund'}`), el('p', 'iph-sub', `${label} · gilt 30 Tage zum Öffnen. Dein Freund bekommt eine eigene Unterhaltung – ohne Zugriff auf deine Daten, Mails, Laptop oder Handy.`), link, copy);
  if (navigator.share) {
    const share = el('a', 'iph-alt', 'Teilen (WhatsApp, Nachrichten …)'); share.href = '#';
    share.addEventListener('click', (e) => { e.preventDefault(); navigator.share({ title: 'Jarvis', text: `Hey${name ? ` ${name}` : ''}, hier ist dein eigener Jarvis 🤖:`, url }).catch(() => {}); });
    box.append(share);
  }
  card.append(box); document.body.append(card);
  toast('Einladungslink erstellt.');
}
export function enterGuestMode(name) {
  document.body.classList.add('guest-mode');
  document.body.dataset.guest = name || 'Gast';
}
