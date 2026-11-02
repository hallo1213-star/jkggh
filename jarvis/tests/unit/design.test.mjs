import assert from 'node:assert/strict';
import { FONTS, TYPES, checkSet, classifyDesign, designGraphics, editGraphics, parseGraphics, sanitizeSvg, wellFormed } from '../../graphics.js';
import { UPGRADE_WISH, contrast, designReview } from '../../studio.js';

let n = 0;
const logo = (fill = '#ff3ea5') => `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#05060a"/><circle cx="512" cy="430" r="200" fill="${fill}"/><text x="512" y="820" text-anchor="middle" font-family="Orbitron" font-size="96" fill="#ffffff">NOVA</text></svg>`;
const reply = (assets) => `NAME: NOVA\nKONZEPT: Ein leuchtender Kern als Zeichen für Energie.\nFARBEN: #05060a, #ff3ea5, #38e1ff\nSCHRIFTEN: Orbitron, Inter\nFOTO:\n${assets.map(([n, svg]) => `=== SVG: ${n} (1024x1024) ===\n${svg}\n=== ENDE ===`).join('\n')}`;

// sanitizer removes everything active or external
const dirty = sanitizeSvg('<svg viewBox="0 0 10 10" onclick="x()"><script>alert(1)</script><image href="https://evil.example/a.png"/><use href="#ok"/><rect fill="url(#g)" style="fill:url(https://x/y)"/><foreignObject><b/></foreignObject></svg>', 512, 512);
assert.doesNotMatch(dirty.svg, /script|onclick|evil|foreignObject|https:\/\/x/); assert.match(dirty.svg, /href="#ok"/); assert.match(dirty.svg, /url\(#g\)/); assert.match(dirty.svg, /width="512" height="512"/); n++;
assert.equal(sanitizeSvg('kein svg', 10, 10).svg, ''); n++;
assert.ok(wellFormed(logo()).ok); assert.equal(wellFormed('<svg><g></svg>').ok, false); n++;
const parsed = parseGraphics(reply([['logo', logo()]]));
assert.equal(parsed.name, 'NOVA'); assert.deepEqual(parsed.palette, ['#05060a', '#ff3ea5', '#38e1ff']); assert.equal(parsed.fonts.title, 'Orbitron'); assert.equal(parsed.assets.length, 1); n++;
// a full brand identity from (fake) AI output
const brandNames = TYPES.brand.assets.map((a) => a[0]);
let prompt = '';
const set = await designGraphics('Moderne Gaming-Marke NOVA', { type: 'brand', write: async (o) => { prompt = o.prompt; return reply(brandNames.map((name) => [name, logo()])); } });
assert.match(prompt, /logo-quer: Logo quer, 1600x600/); assert.equal(set.assets.length, 5); assert.ok(set.assets.every((a) => a.svg.includes('<svg'))); assert.equal(set.qa.ok, true); n++;
// checks: low contrast text and unknown fonts are reported, missing assets are errors
const bad = await designGraphics('Logo', { type: 'logo', write: async () => reply([['logo', logo().replace('fill="#ffffff"', 'fill="#06070b"').replace('Orbitron', 'Comic Sans')]]) });
assert.equal(bad.qa.ok, false); // logo-quer and logo-mono missing
assert.ok(bad.qa.issues.some((i) => /schwer lesbar/.test(i.text))); assert.ok(bad.qa.issues.some((i) => /unbekannte Schrift/.test(i.text))); n++;
// edit returns only changed assets, keeps the rest
const edited = await editGraphics(set, 'Mach das Zeichen cyan', { write: async () => reply([['logo', logo('#38e1ff')]]) });
assert.deepEqual(edited.changed, ['logo']); assert.match(edited.assets[0].svg, /#38e1ff/); assert.equal(edited.assets[1].svg, set.assets[1].svg); n++;
await assert.rejects(designGraphics('', { write: async () => '' }), /Was soll ich gestalten/); n++;
// routing of design wishes
assert.equal(classifyDesign('Erstelle mir eine Website für meinen Friseursalon').studio, 'website');
assert.equal(classifyDesign('Designe ein futuristisches Dashboard').studio, 'website');
assert.deepEqual(classifyDesign('Erstelle eine moderne Modemarke'), { studio: 'graphics', label: 'Grafik & Marke', type: 'brand' });
assert.equal(classifyDesign('Baue mir ein 3D-Haus').studio, 'model3d');
assert.equal(classifyDesign('Programmier ein Snake-Spiel').studio, 'workshop');
assert.equal(classifyDesign('Mach ein Poster für meine Party').type, 'poster'); n++;
assert.ok(FONTS.includes('Orbitron') && FONTS.includes('Playfair Display')); n++;
// website design review
assert.equal(contrast('#ffffff', '#000000'), 21);
const site = (css, colors) => ({ plan: { farben: colors }, files: [{ path: 'index.html', content: '<html><head><meta name="viewport" content="width=device-width"></head><body><img src="a.jpg" alt="x"></body></html>' }, { path: 'styles.css', content: css }] });
const good = designReview(site('h1{font-size:clamp(2rem,5vw,4rem)} a:focus-visible{outline:2px solid} @media (max-width:700px){} @media (prefers-reduced-motion:reduce){*{transition:none}} .b{transition:all .2s}', { text: '#111111', hintergrund: '#ffffff', gedimmt: '#555555' }));
assert.equal(good.ok, true); assert.equal(good.issues.length, 0); n++;
const poor = designReview(site('.b{transition:all .2s}', { text: '#777777', hintergrund: '#888888' }));
assert.equal(poor.ok, false); assert.ok(poor.issues.some((i) => /Textkontrast/.test(i.text))); assert.ok(poor.issues.some((i) => /Media Queries/.test(i.text))); n++;
assert.ok(UPGRADE_WISH.test('Mach das Design hochwertiger')); assert.ok(!UPGRADE_WISH.test('Füg eine FAQ-Seite hinzu')); n++;
console.log(`design: ${n} bestanden`);
