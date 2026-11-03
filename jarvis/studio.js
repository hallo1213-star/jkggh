// Jarvis Studio: professional multi-page websites written by Jarvis' AI in
// several steps (concept & design system → CSS → JavaScript with pages, cart
// and animations → HTML), so bigger sites fit into free AI limits. Edits
// change only the affected files. Images are generated per site (Pollinations,
// prompts written by Jarvis) – no invented stock URLs.
import { generateJson, generateText, llmProvider } from './llm.js';
import { readFileSync } from 'node:fs';
import { parseProject, sanitizeProject } from './projects.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Free tiers allow limited tokens per minute: wait and retry instead of failing.
async function withRetry(fn, onWait) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!/Limit erreicht/.test(error.message) || attempt === 2) throw error;
      onWait?.('KI-Kontingent kurz ausgelastet – ich warte eine Minute …');
      await wait(62_000);
    }
  }
  return null;
}

export const IMAGE_RULE = 'Bilder: nutze ausschließlich generierte Bilder über https://image.pollinations.ai/prompt/<englische, sehr genaue Bildbeschreibung URL-kodiert>?width=<B>&height=<H>&nologo=true&seed=<Zahl> – passend zum Projekt (z. B. "editorial luxury fashion photography, model in black wool coat, soft studio light, beige background"). Jedes Bild mit eigenem seed, alt-Text auf Deutsch, loading="lazy", object-fit: cover. Keine anderen Bild-URLs.';

export const JARVIS_STYLE = 'Jarvis-Stil: fast schwarzer Hintergrund (#05060a), Flächen #0d0f17 mit feinen 1px-Linien, Akzente Pink-Violett (#ff3ea5 → #a855f7) und Cyan (#38e1ff), leuchtender Reaktor/Orb als Blickfang (radiale Verläufe, sanftes Pulsieren), HUD-Elemente (feine Eckwinkel, Skalen, Monospace-Zahlen), Schriften „Orbitron“ für Titel und „Rajdhani“ oder „Inter“ für Text, Glas-Panels, dezente Glow-Schatten, flüssige Übergänge.';
const STYLE_RULE = `Stilwahl: Nennt der Auftrag einen Stil (z. B. luxuriös, minimalistisch, verspielt, Retro), setze GENAU diesen um. Ohne Stilangabe wähle den Stil, der zur Branche passt (Luxusmode: edel, viel Weißraum, Serifen; Bäckerei: warm; Shop: klar und verkaufsstark). Nur bei Technik-, KI-, Gaming-, Dashboard-, Krypto- oder persönlichen Jarvis-Projekten ohne Stilangabe nutze den ${JARVIS_STYLE}`;
// The functional building blocks every site gets (router, cart, filter,
// search, forms, animations). The AI only writes markup + design and uses
// these data attributes, so buttons and the cart reliably work.
export const KIT_JS = readFileSync(new URL('./site-kit/kit.js', import.meta.url), 'utf8');
export const KIT_CONTRACT = `JARVIS SITE-KIT (wird automatisch eingebunden – NICHT selbst programmieren, nur diese Attribute nutzen):
- Seiten: jede Seite ist <section data-page="#/route" data-title="Titel"> innerhalb <main id="app">. Startseite = data-page="#/". Produktdetail = data-page="#/produkt" (Route #/produkt/<id>). Links zu Seiten: href="#/route". Links zu Abschnitten derselben Seite: href="#abschnitt-id" (id muss existieren). Aktiver Navigationslink bekommt automatisch .is-active.
- Mobilmenü: <button data-menu-toggle aria-label="Menü">, Menü-Element mit data-menu (bekommt .is-open, body bekommt .menu-open).
- Produkte (aus data.js): Liste = <div data-product-grid [data-limit="4"] [data-category="Kategorie"] [data-static]> mit <template data-product-template><article class="…">…</article></template> darin; Felder im Template: data-field="name|price|category|description", <img data-field="image" alt="">, <a data-product-link>, <button data-add-to-cart>. Filterleiste: <div data-filter-bar></div> (Kategorie-Knöpfe .filter-btn entstehen automatisch). Suche: <input data-search type="search">. Sortierung: <select data-sort><option value="">Empfohlen</option><option value="price-asc">Preis aufsteigend</option><option value="price-desc">Preis absteigend</option><option value="name">Name</option></select>. Anzahl: <span data-result-count>.
- Produktdetail: in data-page="#/produkt" ein Element data-product-detail mit denselben data-field-Feldern, <input data-qty type="number" value="1" min="1"> und <button data-add-to-cart>. Ähnliche Produkte: <div data-related-grid data-limit="3">.
- Warenkorb: Zähler <span data-cart-count>0</span>; Öffnen <button data-cart-open>; Schublade <aside data-cart-drawer> mit <button data-cart-close>, <div data-cart-items></div>, <p data-cart-empty>, Summe <span data-cart-total>, <button data-checkout>. Positionen (.cart-line, .qty-btn, .cart-line__remove) entstehen automatisch. Kasse: data-page="#/kasse" mit <form data-checkout-form> (Demo, keine echte Zahlung, so kennzeichnen).
- Formulare: <form data-validate data-success="Danke …"> mit <label>Text <input name required type="email|tel|text" minlength></label>; Fehlermeldungen (.field-error) und Erfolgsbox (.form-success) erzeugt das Kit.
- Tabs: <div data-tabs> mit <button data-tab="a">, <div data-tab-panel="a">. Slider: <div data-slider> + <button data-slider-prev>/<button data-slider-next>. Zähler: <span data-count-to="250" data-suffix="+">0</span>. Einblenden: class="reveal" (optional data-delay="150"). Nach oben: <button data-scroll-top>. Jahr: <span data-year></span>. Header bekommt beim Scrollen body.is-scrolled.
- JEDER <button> braucht eines dieser data-Attribute oder type="submit" in einem Formular. Keine href="#", keine leeren Links, kein onclick, keine eigenen <script>-Blöcke.`;

// Art directions: concrete starting points so every site gets its own look.
export const DIRECTIONS = [
  'Editorial Luxus – Mode, Schmuck, Interior, Hotels: Fonts "Cormorant Garamond" + "Inter"; Elfenbein #f6f1ea, Tinte #151311, Champagner #b08d57; riesige Serifen-Headlines, viel Weißraum, feine 1px-Linien, kleine Versal-Labels mit Laufweite, randlose Fotografie, asymmetrisches Raster',
  'Warmes Handwerk – Bäckerei, Café, Restaurant, Manufaktur: Fonts "Fraunces" + "Manrope"; Creme #fbf5ec, Espresso #2b1d14, Terrakotta #c8553d, Salbei #7d8f69; runde 18px-Ecken, leichte Papier-Körnung (SVG-Noise), handgezeichnete SVG-Unterstreichung, warme Food-Fotos',
  'Klare Tech / SaaS – Software, Start-up, App, Agentur digital: Fonts "Space Grotesk" + "Inter"; Weiß #ffffff mit dunklen Sektionen #0b0d12, Elektroblau #3b5bfd, Mint #2ee6a6; Bento-Grid, Glas-Karten, weicher Verlaufs-Glow hinter dem Hero, Produkt-Mockup aus CSS',
  'Mutig & Brutal – Streetwear, Musik, Kreativagentur, Events: Fonts "Archivo Black" + "Space Mono"; Off-White #f2f0e9, Schwarz #0a0a0a, Neon #d4ff3a; übergroße Typo, dicke Konturen, Laufband (CSS-Marquee), harte Schatten, schräge Sticker',
  'Natur & Wellness – Yoga, Spa, Bio, Physio, Kosmetik: Fonts "DM Serif Display" + "DM Sans"; Sand #f3eee6, Wald #24382c, Ton #c2875d; organische Blob-Formen (SVG), weiche Schatten, ruhige Animationen, viel Luft',
  'Verspielt & Bunt – Kinder, Süßwaren, Party, Tiere: Fonts "Fredoka" + "Nunito"; Koralle #ff6b6b, Sonne #ffd23f, Türkis #2ec4b6, Creme #fff8ee; runde Formen, Sticker-Badges, federnde Hover-Effekte',
  'Dunkel & Filmisch – Barbier, Bar, Fitness, Fotografie, Tattoo, Gaming: Fonts "Bebas Neue" + "Inter"; Fast-Schwarz #0c0c0e, Gold #e8b04b oder Rot #e63946, Grau #a3a3a3; dramatische Bild-Overlays, Spotlight-Verläufe, große Zahlen',
  'Swiss Minimal – Architektur, Kanzlei, Beratung, Immobilien: Fonts "Manrope" + "IBM Plex Mono"; Weiß, Schwarz #111, ein Akzent #ff4d00; strenges 12-Spalten-Raster, große Ziffern, sehr klare Hierarchie',
  'Retro / Vintage – Plattenladen, Diner, Barber-Retro, Second-Hand: Fonts "Playfair Display" + "Rubik"; Senf #e0a526, Petrol #1f6f78, Creme #f4ead5, Rot #c0392b; Abzeichen, Streifen, Körnung',
  `Jarvis / Futuristisch – KI, Tech-Projekte, Krypto, Gaming-Dashboards: ${JARVIS_STYLE}`
];

const DESIGN_SYSTEM = `Du bist Art Director und Senior-Frontend-Entwickler einer preisgekrönten Designagentur (Awwwards-Niveau). Du baust individuelle, verkaufsfähige Websites für echte Kunden – nie generische KI-Vorlagen, nie schwarze Schrift auf weißem Standard-Layout.
Qualitätsregeln: eigenes Designsystem (CSS-Variablen für Farben, 8px-Abstandsskala, Radius, Schatten, Schriftgrößen mit clamp()), Google-Fonts-Paar, max. Inhaltsbreite ~1200px, Fließtext max. 65 Zeichen pro Zeile, starke Hierarchie, großzügige Sektionsabstände (min. 96px Desktop / 64px Handy), eindrucksvoller Hero (große Headline, klare Unterzeile, 2 Buttons, großes Bild oder Gestaltungselement), abwechslungsreiche Sektionen (Bild/Text-Wechsel, Bento-Grid, Zahlen, Stimmen, FAQ, CTA-Band), schlichte Inline-SVG-Icons statt Emojis, echte konkrete deutsche Texte (keine Floskeln, kein Lorem ipsum), Hover-/Fokus-Zustände, Animationen dezent und sinnvoll (Einblenden beim Scrollen, Hover-Übergänge, Seitenwechsel), prefers-reduced-motion, mobile first und voll responsiv (Handy, Tablet, Desktop), Kontrast Text mindestens 4.5:1.
${STYLE_RULE}
Login/Konto nur als Demo (keine echten Passwörter). Keine echten Zahlungen – Kasse als Demo kennzeichnen.`;

const PLAN_PROMPT = (wish) => `Auftrag: ${wish}
Wähle die passendste Art Direction und passe sie an die Marke an:
${DIRECTIONS.map((d, i) => `${i + 1}. ${d}`).join('\n')}
Antworte als JSON:
{"name":"Markenname","tagline":"","richtung":"Name der Art Direction","stil":"2 Sätze Designrichtung, was sie besonders macht","farben":{"hintergrund":"#","flaeche":"#","text":"#","gedimmt":"#","akzent":"#","akzent2":"#"},"schriften":{"titel":"Google-Font","text":"Google-Font"},"radius":"z. B. 0px oder 18px","hero":{"muster":"split | vollbild-foto | typo-marquee | bento | mockup","headline":"","unterzeile":"","cta1":{"text":"","ziel":"#/route"},"cta2":{"text":"","ziel":"#/route oder #abschnitt"},"bild":"englische, sehr genaue Fotobeschreibung"},"seiten":[{"route":"#/","titel":"Start","sektionen":["kurze Beschreibung jeder Sektion"]}],"produkte":[{"id":"kurz-ohne-leerzeichen","name":"","preis":0,"kategorie":"","beschreibung":"1–2 Sätze","bild":"englische Fotobeschreibung"}],"kontakt":{"adresse":"","telefon":"","email":"","zeiten":""},"ton":"Tonalität der Texte"}
Seiten: alle, die das Projekt braucht (4–7). Shop: Start, Shop/Produkte (#/shop), Produktdetail (#/produkt), Kasse (#/kasse), Über uns, Kontakt. Restaurant/Café: Start, Speisekarte, Über uns, Reservierung/Kontakt. Dienstleister: Start, Leistungen, Referenzen, Über uns, Kontakt. Produkte (6–12) nur bei Shops oder Speisekarten, sonst leeres Array.`;

const FILE_FORMAT = 'Antworte NUR im Format:\n=== DATEI: <name> ===\n<vollständiger Inhalt>\n=== ENDE ===';
const PATCH_FORMAT = `Antworte NUR mit Änderungen in einem dieser Formate:
(a) gezielte Ersetzung (bevorzugt):
=== ÄNDERUNG: <dateiname> ===
<<<<<<< SUCHEN
exakt vorhandener Originaltext (mehrere Zeilen möglich)
=======
neuer Text
>>>>>>> ERSETZEN
=== ENDE ===
(b) ganze Datei: === DATEI: <name> === … === ENDE ===
Mehrere Blöcke sind erlaubt. kit.js niemals ändern.`;

const pollinations = (prompt, w, h, seed) => `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt || 'product photo').slice(0, 300))}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
const slug = (s, i) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || `p${i + 1}`;

// data.js is written by Jarvis himself from the concept (no AI needed).
export function dataJs(plan) {
  const seen = new Set();
  const products = (Array.isArray(plan?.produkte) ? plan.produkte : []).slice(0, 16).map((p, i) => {
    let id = slug(p.id || p.name, i); while (seen.has(id)) id += '-2'; seen.add(id);
    return { id, name: String(p.name || `Produkt ${i + 1}`).slice(0, 60), price: Math.max(0, Math.round((Number(p.preis) || 0) * 100) / 100), category: String(p.kategorie || 'Sortiment').slice(0, 30), description: String(p.beschreibung || '').slice(0, 240), image: pollinations(`${p.bild || p.name}, professional product photography, soft studio light, high detail`, 800, 1000, 101 + i * 7) };
  });
  const site = { name: String(plan?.name || 'Website').slice(0, 60), currency: 'EUR', products, contact: plan?.kontakt || {} };
  return `/* Inhalte der Website – von Jarvis erzeugt. Produkte hier ändern. */\nwindow.SITE = ${JSON.stringify(site, null, 2)};\n`;
}

export async function buildSite(wish, { onProgress = () => {}, generate = generateJson, write = generateText } = {}) {
  const prompt = String(wish ?? '').trim().slice(0, 800);
  if (!prompt) throw new Error('Was für eine Website soll ich bauen?');
  if (!llmProvider() && generate === generateJson) throw new Error('Jarvis Studio braucht den KI-Schlüssel GROQ_API_KEY (kostenlos).');
  onProgress('Konzept & Art Direction');
  const plan = await withRetry(() => generate({ system: DESIGN_SYSTEM, prompt: PLAN_PROMPT(prompt), maxTokens: 3500 }), onProgress);
  const data = dataJs(plan);
  const heroImg = pollinations(`${plan?.hero?.bild || prompt}, editorial photography, cinematic light, high detail`, 1600, 1100, 7);
  const brief = JSON.stringify({ ...plan, produkte: (plan?.produkte || []).map((p) => ({ name: p.name, kategorie: p.kategorie })) }).slice(0, 6000);
  const shop = /"produkte":\[\{/.test(JSON.stringify(plan || {}));

  onProgress('Designsystem & Gestaltung (CSS)');
  const css = await withRetry(() => write({ system: DESIGN_SYSTEM, maxTokens: 8000, prompt: `Konzept:\n${brief}\n\nSchreibe styles.css (komplettes, hochwertiges Design):
1. @import der Google Fonts; :root mit allen Design-Tokens (Farben, Abstände 4/8/16/24/32/48/64/96/128px, Radius, Schatten, Typo-Skala mit clamp(), Übergänge).
2. Basis: box-sizing, body (Hintergrund, Textfarbe, Schrift, Zeilenhöhe 1.6), Links, Bilder (max-width 100%, display block), :focus-visible, ::selection, Container (.container max-width 1200px, padding-inline 24px).
3. Header fixiert/sticky mit Glas- oder Flächen-Effekt (wird bei body.is-scrolled kompakter), Logo, Navigation mit Hover-Linie und .is-active, Warenkorb-Knopf mit Zähler-Badge, Mobilmenü (unter 900px: [data-menu] als Overlay, sichtbar bei .is-open, [data-menu-toggle] als Burger).
4. Hero im Muster "${plan?.hero?.muster || 'split'}" – eindrucksvoll, große Headline, Buttons, Bildkomposition oder Gestaltungselement; dazu Klassen für alle weiteren Sektionstypen (Feature-Grid, Bild/Text, Zahlen, Stimmen, Preise, Prozess, Galerie, FAQ mit <details>, CTA-Band, Kontakt mit Formular).
5. Buttons (.btn, .btn--primary, .btn--ghost) mit Hover/Active/Fokus-Mikroanimation; Karten mit Hover-Lift.
6. Kit-Komponenten gestalten: .product-card (Bild 4:5 object-fit cover, Hover-Zoom), .filter-btn und .filter-btn.is-active, [data-search], [data-sort], Produktdetail-Layout, [data-cart-drawer] (Hintergrund, Innenabstand, Kopf), .cart-line (Bild 64px, Name, Preis, .qty-btn, .cart-line__remove), Formulare (Labels, Inputs, Fokus, .field-error, .form-success), .kit-toast passend zur Marke, .kit-empty.
7. Footer mehrspaltig; Sektionsabstände; Animationen (.reveal wird vom Kit gesteuert, nur Feinschliff), @keyframes für Hero/Marquee; @media für 1100px, 900px und 600px; prefers-reduced-motion.
Kein Tailwind, keine Frameworks. Hochwertig, nicht generisch.\n${FILE_FORMAT}` }), onProgress);
  const classes = [...new Set((css.match(/\.[a-z][\w-]*/g) || []))].slice(0, 160).join(' ');

  onProgress('Startseite & Grundgerüst (HTML)');
  const html1 = await withRetry(() => write({ system: DESIGN_SYSTEM, maxTokens: 8000, prompt: `Konzept:\n${brief}\n\n${KIT_CONTRACT}\n\nVorhandene CSS-Klassen: ${classes}\n\nSchreibe index.html, Teil 1:
- <!doctype html>, lang="de", <head> mit Meta (charset, viewport, description, theme-color), <title>, <link rel="stylesheet" href="styles.css">.
- Header mit Logo-Schriftzug (Link #/), Navigation [data-menu] mit Links zu ALLEN Seiten (${(plan?.seiten || []).map((x) => x.route).join(', ')}), ${shop ? 'Warenkorb-Knopf <button data-cart-open> mit <span data-cart-count>0</span>, ' : ''}Burger <button data-menu-toggle>.
- <main id="app"> mit der kompletten Startseite <section data-page="#/" data-title="Start">: Hero (Muster ${plan?.hero?.muster || 'split'}, Bild ${heroImg}), danach 4–6 abwechslungsreiche Sektionen laut Konzept${shop ? ', darunter ein Produkt-Teaser mit data-product-grid data-limit="4" data-static und eigenem <template data-product-template>' : ''}. Elemente mit class="reveal".
- Danach exakt die Zeile <!-- WEITERE-SEITEN --> (die anderen Seiten kommen später), dann </main>.
${shop ? '- <aside data-cart-drawer> mit Titel, <button data-cart-close>, <div data-cart-items>, <p data-cart-empty>Dein Warenkorb ist leer.</p>, Summe <span data-cart-total>, <button data-checkout class="btn btn--primary">Zur Kasse</button>.\n' : ''}- Footer (Spalten: Marke+Satz, Seiten-Links, Kontakt ${JSON.stringify(plan?.kontakt || {})}, Newsletter <form data-validate> mit E-Mail), © <span data-year></span>, Impressum/Datenschutz als Links auf #/kontakt.
- Am Ende: <script src="data.js"></script><script src="kit.js"></script>
${IMAGE_RULE}\n${FILE_FORMAT}` }), onProgress);

  onProgress('Weitere Seiten & Funktionen');
  const others = (plan?.seiten || []).filter((x) => x.route !== '#/');
  const html2 = others.length ? await withRetry(() => write({ system: DESIGN_SYSTEM, maxTokens: 8000, prompt: `Konzept:\n${brief}\n\n${KIT_CONTRACT}\n\nVorhandene CSS-Klassen: ${classes}\n\nSchreibe NUR die weiteren Seiten als <section data-page="…" data-title="…">-Blöcke (ohne <html>, <head>, Header, Footer) für: ${others.map((x) => `${x.route} (${x.titel}: ${(x.sektionen || []).join('; ')})`).join(' | ')}.
${shop ? 'Shop-Seite: Filterleiste data-filter-bar, Suche data-search, Sortierung data-sort, data-result-count, data-product-grid mit eigenem <template data-product-template>. Produktdetail data-page="#/produkt" mit data-product-detail (großes Bild, Name, Preis, Beschreibung, data-qty, data-add-to-cart) und data-related-grid. Kasse data-page="#/kasse" mit <form data-checkout-form data-success="…"> (Name, E-Mail, Adresse, PLZ, Ort – Demo, keine Zahlung), Bestellübersicht mit data-cart-items und data-cart-total.\n' : ''}Kontaktseite mit <form data-validate> (Name, E-Mail, Nachricht required) und Kontaktdaten. Jede Seite mit eigener Kopfzeile (Seitentitel) und hochwertigen Sektionen, class="reveal". ${IMAGE_RULE}
Antworte NUR im Format:\n=== DATEI: seiten.html ===\n<section …>…</section>\n=== ENDE ===` }), onProgress) : '';

  const parsed = [...parseProject(html1).files, ...parseProject(css).files];
  const index = parsed.find((f) => f.path === 'index.html');
  if (!index) throw new Error('Die Website kam unvollständig zurück. Bitte noch einmal versuchen.');
  const pagesHtml = parseProject(html2).files.find((f) => f.path === 'seiten.html')?.content || '';
  index.content = assembleIndex(index.content, pagesHtml);
  const files = [index, ...parsed.filter((f) => f.path === 'styles.css'), { path: 'data.js', content: data }, { path: 'kit.js', content: KIT_JS }];
  let project = sanitizeProject({ title: plan?.name || prompt.slice(0, 40), kind: 'website', description: plan?.tagline || plan?.stil || '', files });
  project.plan = { name: plan?.name, richtung: plan?.richtung, stil: plan?.stil, seiten: (plan?.seiten || []).map((x) => x.route), farben: plan?.farben, schriften: plan?.schriften, shop };

  // automatic code check; serious problems are repaired right away
  let check = siteCheck(project);
  if (!check.ok) {
    onProgress(`Code-Prüfung: ${check.errors.length} Problem(e) – Jarvis repariert`);
    try { const fixed = await fixSite(project, check.errors, { write }); project = { ...fixed, plan: project.plan }; check = siteCheck(project); } catch { /* keep first version, the report shows what is open */ }
  }
  project.check = check;
  return project;
}

// index.html: insert the other pages, make sure data.js and kit.js are loaded
// in the right order and no stray AI scripts break the kit.
export function assembleIndex(html, pagesHtml = '') {
  let out = String(html);
  const pages = String(pagesHtml).replace(/<script[\s\S]*?<\/script>/gi, '');
  if (out.includes('<!-- WEITERE-SEITEN -->')) out = out.replace('<!-- WEITERE-SEITEN -->', pages);
  else if (/<\/main>/i.test(out)) out = out.replace(/<\/main>/i, `${pages}</main>`);
  else out = out.replace(/<\/body>/i, `<main id="app">${pages}</main></body>`);
  out = out.replace(/<script\b[^>]*src=["'](?:\.\/)?(?:data|kit|app)\.js["'][^>]*><\/script>/gi, '');
  out = out.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
  const tags = '<script src="data.js"></script><script src="kit.js"></script>';
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${tags}</body>`) : `${out}${tags}`;
  return out;
}

const KIT_BUTTON = /data-(add-to-cart|qty-plus|qty-minus|remove|cart-open|cart-close|cart-clear|checkout|filter|menu-toggle|tab|slider-prev|slider-next|scroll-top)\b/;
// Deterministic check of the generated code: dead links, buttons without a
// function, missing pages, broken shop parts, unvalidated forms, design basics.
export function siteCheck(project) {
  const files = Object.fromEntries((project?.files || []).map((f) => [f.path, f.content]));
  const html = files['index.html'] || ''; const css = files['styles.css'] || '';
  const errors = []; const warnings = [];
  const pages = new Set([...html.matchAll(/data-page=["']([^"']+)["']/g)].map((m) => m[1]));
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
  let products = [];
  try { products = JSON.parse((files['data.js'] || '').replace(/^[\s\S]*?window\.SITE\s*=\s*/, '').replace(/;\s*$/, '')).products || []; } catch { products = []; }
  if (!files['kit.js']) errors.push('kit.js fehlt');
  if (!pages.has('#/')) errors.push('Es gibt keine Startseite <section data-page="#/">');
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim(); const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Link';
    if (!href || href === '#' || /^javascript:/i.test(href)) errors.push(`Link „${text}“ führt nirgendwohin (href="${href}") – echte Seite (#/…) oder Abschnitt (#id) verlinken`);
    else if (href.startsWith('#/')) { const route = href.split('?')[0]; if (!pages.has(route) && !(route.startsWith('#/produkt/') && pages.has('#/produkt'))) errors.push(`Link „${text}“ zeigt auf ${route}, aber diese Seite fehlt (data-page="${route}")`); }
    else if (href.startsWith('#') && !ids.has(href.slice(1))) errors.push(`Link „${text}“ zeigt auf den Abschnitt ${href}, aber kein Element hat id="${href.slice(1)}"`);
  }
  const formRanges = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m) => [m.index, m.index + m[0].length]);
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = m[1]; const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || (attrs.match(/aria-label=["']([^"']+)/) || [])[1] || 'Knopf';
    const inForm = formRanges.some(([a, b]) => m.index > a && m.index < b);
    const submit = /type=["']submit["']/.test(attrs) || (inForm && !/type=["']button["']/.test(attrs));
    if (!KIT_BUTTON.test(attrs) && !submit) errors.push(`Knopf „${text}“ hat keine Funktion – passendes Kit-Attribut (z. B. data-add-to-cart, data-menu-toggle) ergänzen oder durch einen Link <a href="#/…"> ersetzen`);
  }
  for (const m of html.matchAll(/<form\b([^>]*)>/gi)) if (!/data-validate|data-checkout-form/.test(m[1])) errors.push('Ein Formular hat keine Prüfung (data-validate fehlt)');
  if (/\bonclick=/i.test(html)) errors.push('onclick-Attribute gefunden – stattdessen Kit-Attribute verwenden');
  for (const m of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) if (!/^https:\/\/image\.pollinations\.ai\//.test(m[1]) && !/^data:/.test(m[1])) errors.push(`Bild-Adresse nicht erlaubt: ${m[1].slice(0, 60)} – Pollinations-Bild verwenden`);
  if (products.length) {
    if (!/data-product-grid/.test(html)) errors.push('Shop ohne Produktliste (data-product-grid fehlt)');
    if (!/data-cart-count/.test(html)) errors.push('Warenkorb-Zähler fehlt (data-cart-count)');
    if (!/data-cart-items/.test(html)) errors.push('Warenkorb-Inhalt fehlt (data-cart-items in data-cart-drawer oder Seite #/warenkorb)');
    if (!pages.has('#/produkt') || !/data-product-detail/.test(html)) errors.push('Produktdetailseite fehlt (data-page="#/produkt" mit data-product-detail)');
    if (/data-checkout\b/.test(html) && !pages.has('#/kasse') && !/data-checkout-form/.test(html)) warnings.push('Kasse-Knopf ohne Kassen-Seite (#/kasse)');
  }
  if (!/data-menu-toggle/.test(html)) warnings.push('Kein Mobilmenü-Knopf (data-menu-toggle)');
  if (!/fonts\.googleapis\.com/.test(css + html)) warnings.push('Keine Google Fonts – Typografie wirkt generisch');
  if (!/:root\s*\{[^}]*--/.test(css)) errors.push('Kein Designsystem (CSS-Variablen in :root fehlen)');
  if (!/@media/.test(css)) errors.push('Keine Media Queries – Handy- und Tablet-Ansicht fehlen');
  if (!/hero/i.test(html + css)) warnings.push('Kein erkennbarer Hero-Bereich');
  if ((css.match(/transition|animation/g) || []).length < 3) warnings.push('Kaum Animationen/Übergänge');
  const uniq = (a) => [...new Set(a)];
  return { ok: !errors.length, errors: uniq(errors).slice(0, 25), warnings: uniq(warnings), pages: [...pages], products: products.length };
}

// Applies "=== ÄNDERUNG ===" search/replace blocks (robust for big files) and
// whole-file blocks. Returns changed files and hunks that did not match.
export function applyPatches(files, reply) {
  const out = Object.fromEntries(files.map((f) => [f.path, f.content]));
  const changed = new Set(); const missed = [];
  for (const m of String(reply).matchAll(/=== ÄNDERUNG: ([\w./-]+) ===\s*([\s\S]*?)=== ENDE ===/g)) {
    const path = m[1].trim(); if (path === 'kit.js' || out[path] === undefined) continue;
    for (const h of m[2].matchAll(/<{5,}\s*SUCHEN\s*\n([\s\S]*?)\n={5,}\s*\n([\s\S]*?)\n?>{5,}\s*ERSETZEN/g)) {
      const find = h[1]; const repl = h[2];
      if (out[path].includes(find)) { out[path] = out[path].replace(find, repl); changed.add(path); }
      else { const loose = find.trim(); if (loose && out[path].includes(loose)) { out[path] = out[path].replace(loose, repl.trim()); changed.add(path); } else missed.push(`${path}: ${find.trim().slice(0, 60)}`); }
    }
  }
  for (const f of parseProject(reply.replace(/=== ÄNDERUNG:[\s\S]*?=== ENDE ===/g, '')).files) { if (f.path === 'kit.js') continue; out[f.path] = f.content; changed.add(f.path); }
  return { files: Object.entries(out).map(([path, content]) => ({ path, content })), changed: [...changed], missed };
}

// Targeted edits: search/replace blocks or whole files; kit.js stays untouched.
export async function editSite(project, wish, { onProgress = () => {}, write = generateText } = {}) {
  const request = String(wish ?? '').trim().slice(0, 2500);
  if (!request) throw new Error('Was soll ich ändern?');
  onProgress('Änderung planen und umsetzen');
  const kit = (project.files || []).some((f) => f.path === 'kit.js');
  const reply = await withRetry(() => write({
    system: DESIGN_SYSTEM,
    maxTokens: 8000,
    prompt: `Bestehende Website "${project.title}":\n${project.files.filter((f) => f.path !== 'kit.js').map((f) => `=== DATEI: ${f.path} ===\n${f.content}\n=== ENDE ===`).join('\n')}\n\n${kit ? `${KIT_CONTRACT}\n(kit.js ist eingebunden und darf nicht verändert werden.)\n\n` : ''}Änderungswunsch: ${request}\n\nÄndere gezielt nur, was nötig ist. Alle bestehenden Seiten und Funktionen bleiben erhalten. ${IMAGE_RULE}\n${PATCH_FORMAT}`
  }), onProgress);
  const result = applyPatches(project.files, reply);
  if (!result.changed.length) throw new Error('Ich konnte die Änderung nicht umsetzen. Formulier sie bitte etwas genauer.');
  let files = result.files;
  if (kit) files = files.map((f) => (f.path === 'kit.js' ? { path: 'kit.js', content: KIT_JS } : f.path === 'index.html' ? { ...f, content: assembleIndex(f.content.replace('<!-- WEITERE-SEITEN -->', '')) } : f));
  return { ...sanitizeProject({ ...project, files }), plan: project.plan, changed: result.changed, missed: result.missed };
}

// Automatic repair after the quality check found problems.
export async function fixSite(project, problems, { write = generateText } = {}) {
  const list = (Array.isArray(problems) ? problems : []).map((p) => String(p).slice(0, 300)).slice(0, 20);
  if (!list.length) return project;
  return editSite(project, `Der automatische Qualitätstest (Browser, Desktop und Handy) hat diese Probleme gefunden. Behebe ALLE gezielt, ohne Funktionen oder Inhalte zu entfernen:\n- ${list.join('\n- ')}`, { write });
}

// "Mach das Design hochwertiger": a real design pass, not just new colours.
export const UPGRADE_WISH = /(hochwertig|professionell|premium|edler|luxuri|schöner|moderner|besser aus|aufwerten|upgrade|wie eine agentur)/i;
export const UPGRADE_BRIEF = `Werte das Design deutlich auf, wie ein Senior-Designer bei einem Redesign. Pflicht:
1. Abstände: einheitliche 8-px-Skala als CSS-Variablen, großzügigere Sektionsabstände, klare Raster.
2. Typografie: Typo-Skala mit clamp(), passende Zeilenhöhen/Laufweiten, starke Hierarchie im Hero und in Überschriften.
3. Farben: Palette verfeinern (Kontrast Text/Hintergrund mindestens 4.5:1), Akzente gezielt einsetzen, feine Flächen- und Linienfarben.
4. Komponenten neu gestalten: Navigation, Hero, Karten, Buttons (Hover/Active/Fokus), Formulare, Footer – mit Tiefe (Schatten/Glas), einheitlichem Radius.
5. Animationen: Einblenden beim Scrollen (IntersectionObserver), sanfte Hover-Übergänge, Seitenübergänge; prefers-reduced-motion beachten.
6. Layout: professionellere Kompositionen (asymmetrische Raster, Bild/Text-Wechsel), mobile Ansicht ausdrücklich verbessern.
Alle Seiten, Inhalte und Funktionen (Router, Warenkorb, Formulare) bleiben erhalten.`;

export function upgradeSite(project, extra = '', options = {}) {
  return editSite(project, `${UPGRADE_BRIEF}${extra ? `\nZusätzlicher Wunsch: ${String(extra).slice(0, 300)}` : ''}`, options);
}

// Design review on the generated code (deterministic, no AI): contrast of the
// design system, fluid type, responsive rules, focus states, reduced motion, alt texts.
function luminance(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

export function designReview(project) {
  const files = project?.files || [];
  const css = files.filter((f) => f.path.endsWith('.css')).map((f) => f.content).join('\n') + files.filter((f) => f.path.endsWith('.html')).map((f) => (f.content.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n')).join('\n');
  const html = files.filter((f) => f.path.endsWith('.html')).map((f) => f.content).join('\n');
  const js = files.filter((f) => f.path.endsWith('.js')).map((f) => f.content).join('\n');
  const issues = [];
  const add = (level, text) => issues.push({ level, text });
  const colors = project?.plan?.farben || {};
  const textContrast = contrast(colors.text, colors.hintergrund);
  if (textContrast !== null && textContrast < 4.5) add('fehler', `Textkontrast zu gering (${textContrast}:1, nötig mindestens 4.5:1) – Textfarbe oder Hintergrund anpassen`);
  const mutedContrast = contrast(colors.gedimmt, colors.hintergrund);
  if (mutedContrast !== null && mutedContrast < 3) add('warnung', `Gedimmter Text schwer lesbar (${mutedContrast}:1)`);
  if (!/clamp\(/.test(css)) add('warnung', 'Keine fließende Typografie (clamp) – Schriftgrößen springen zwischen Geräten');
  if (!/@media/.test(css)) add('fehler', 'Keine Media Queries – Handy- und Tablet-Ansicht fehlen');
  if (!/:focus/.test(css)) add('warnung', 'Keine sichtbaren Fokus-Zustände für Tastatur-Bedienung');
  if (/(animation|transition)/.test(css) && !/prefers-reduced-motion/.test(css)) add('warnung', 'Animationen ohne Rücksicht auf „Bewegung reduzieren“ (prefers-reduced-motion)');
  const imgs = [...`${html}\n${js}`.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => !/\balt\s*=/.test(t)).length;
  if (noAlt) add('warnung', `${noAlt} Bild(er) ohne Alternativtext`);
  if (!/<meta[^>]+viewport/i.test(html)) add('fehler', 'Viewport-Angabe fehlt – auf dem Handy wird alles winzig');
  return { ok: !issues.some((i) => i.level === 'fehler'), issues, contrast: textContrast };
}
