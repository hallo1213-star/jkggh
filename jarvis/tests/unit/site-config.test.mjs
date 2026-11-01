import { sanitizeSite, encodeSite, decodeSite, safeLink } from '../../public/site-config.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'http://unsicher.de', 'vbscript:x', '#section-999', '//evil.com']) assert(safeLink(bad) === '', `blocks link ${bad}`);
for (const good of ['https://example.de/x', 'mailto:info@verein.de', 'tel:+49 30 123456', '#section-3']) assert(safeLink(good) !== '', `allows link ${good}`);
const site = sanitizeSite({
  title: 'FC Blau-Weiß <script>alert(1)</script>', logo: '⚽️', font: 'comic-sans', mode: 'dunkel', colors: { primary: 'red', accent: '#ff9900' },
  sections: [
    { type: 'hero', heading: 'Willkommen', text: 'Fußball für alle', button_text: 'Mitmachen', button_link: 'javascript:steal()' },
    { type: 'list', heading: 'Training', items: ['Mo 18 Uhr', { text: 'Mi 18 Uhr' }, '', null] },
    { type: 'contact', heading: 'Kontakt', email: 'kein-email', phone: '030 1234567', address: 'Sportplatz 1' },
    { type: 'iframe', heading: 'böse' },
    { type: 'faq', heading: 'Leer', items: [{ q: 'nur Frage' }] }
  ]
});
assert(site.font === 'modern' && site.mode === 'dunkel' && site.colors.primary === '#4f46e5' && site.colors.accent === '#ff9900', 'invalid font/color replaced');
assert(site.sections[0].button_link === '', 'javascript: button link removed');
assert(JSON.stringify(site.sections[1].items) === JSON.stringify(['Mo 18 Uhr', 'Mi 18 Uhr']), 'list items cleaned');
assert(site.sections[2].email === '' && site.sections[2].phone === '030 1234567', 'invalid email dropped, phone kept');
assert(site.sections.length === 4 && !site.sections.some(s => s.type === 'iframe'), 'unknown section type dropped');
assert(site.sections[3].heading === 'Leer' && site.sections[3].items.length === 0, 'faq without answers keeps only heading');
assert(site.title.includes('<script>'), 'markup kept as plain text (rendered via textContent, never as HTML)');
assert(JSON.stringify(decodeSite('#' + encodeSite(site))) === JSON.stringify(site), 'encode/decode round trip');
assert(decodeSite('#müll') === null, 'broken link → null');
const big = sanitizeSite({ title: 'Restaurant', sections: Array.from({ length: 8 }, (_, i) => ({ type: 'features', heading: `Abschnitt ${i}`, items: Array.from({ length: 6 }, () => ({ icon: '🍝', title: 'Hausgemachte Pasta', text: 'Frisch jeden Tag mit Zutaten aus der Region zubereitet.' })) })) });
console.log('     Link-Länge große Website (8 Abschnitte × 6 Karten):', encodeSite(big).length, 'Zeichen');
