// Jarvis Grafik-Studio: logos, app icons, posters, banners, social media
// graphics, packaging and complete brand identities – drawn by Jarvis' AI as
// real vector graphics (SVG), cleaned by a strict sanitizer and checked before
// they are shown. Fonts come from a curated Google Fonts list (embedded in the
// browser for preview/PNG export). Optional AI photo backgrounds use the free
// image generator through Jarvis' own server (placeholder {{FOTO}}).
import { generateText, llmProvider } from './llm.js';
import { JARVIS_STYLE, contrast } from './studio.js';

export const FONTS = ['Inter', 'Montserrat', 'Poppins', 'Outfit', 'Sora', 'Space Grotesk', 'Syne', 'Raleway', 'Bebas Neue', 'Archivo Black', 'Orbitron', 'Rajdhani', 'Righteous', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Pacifico'];

export const TYPES = {
  logo: { label: 'Logo', assets: [['logo', 'Logo', 1024, 1024], ['logo-quer', 'Logo quer (mit Schriftzug)', 1600, 600], ['logo-mono', 'Logo einfarbig', 1024, 1024]] },
  app_icon: { label: 'App-Icon', assets: [['app-icon', 'App-Icon', 1024, 1024]] },
  poster: { label: 'Poster', assets: [['poster', 'Poster (A-Format)', 1240, 1754]], photo: true },
  banner: { label: 'Werbebanner', assets: [['banner', 'Banner', 1920, 640]], photo: true },
  social_post: { label: 'Social-Media-Post', assets: [['post', 'Post (quadratisch)', 1080, 1080]], photo: true },
  story: { label: 'Story / Reel-Cover', assets: [['story', 'Story (9:16)', 1080, 1920]], photo: true },
  packaging: { label: 'Produktverpackung', assets: [['verpackung', 'Verpackung – Vorderseite', 1200, 1600], ['verpackung-seite', 'Verpackung – Seite', 600, 1600]], photo: true },
  brand: { label: 'Markenidentität', assets: [['logo', 'Logo', 1024, 1024], ['logo-quer', 'Logo quer', 1600, 600], ['app-icon', 'App-Icon', 1024, 1024], ['post', 'Social-Media-Post', 1080, 1080], ['banner', 'Banner', 1920, 640]] }
};
export const STYLES = { auto: 'passend zum Auftrag (selbst wählen)', jarvis: JARVIS_STYLE, luxus: 'Luxus: viel Weißraum, edle Serifen, Schwarz/Creme/Gold, sehr reduziert', minimal: 'Minimalistisch: wenige Formen, klare Geometrie, 1–2 Farben, viel Raum', verspielt: 'Verspielt: runde Formen, kräftige fröhliche Farben, freundliche Schrift', retro: 'Retro: 70er/80er-Farben, Körnung, dicke Konturen', tech: 'Tech: dunkel, Neon-Akzente, geometrische Linien, futuristisch' };

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const MAX_SVG = 200_000;

// --- sanitizer ---------------------------------------------------------------------
// Removes everything that could run code or load things from elsewhere.
export function sanitizeSvg(raw, width, height) {
  const removed = [];
  let svg = String(raw ?? '');
  const start = svg.search(/<svg[\s>]/i);
  const end = svg.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < 0) return { svg: '', removed: ['kein <svg> gefunden'] };
  svg = svg.slice(start, end + 6);
  if (svg.length > MAX_SVG) return { svg: '', removed: ['SVG zu groß'] };
  const strip = (re, label) => { if (re.test(svg)) { removed.push(label); svg = svg.replace(re, ''); } };
  strip(/<script[\s\S]*?<\/script\s*>/gi, 'Skripte');
  strip(/<script[^>]*\/>/gi, 'Skripte');
  strip(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, 'foreignObject');
  strip(/<(iframe|object|embed|audio|video|canvas)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, 'eingebettete Inhalte');
  strip(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, 'Event-Handler');
  strip(/@import[^;]+;?/gi, '@import');
  // links: only internal (#id), inline images (data:image/...) and the photo placeholder
  svg = svg.replace(/\s(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, attr, q, a, b) => {
    const value = (a ?? b ?? '').trim();
    if (value.startsWith('#') || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value) || value === '{{FOTO}}') return m;
    removed.push('externe Links');
    return '';
  });
  svg = svg.replace(/url\(\s*(['"]?)(?!#)([^)'"]*)\1\s*\)/gi, (m, q, value) => { removed.push('externe Ressourcen'); return 'none'; });
  // root attributes: namespace, viewBox and size
  svg = svg.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    let a = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
    if (!/xmlns=/.test(a)) a += ' xmlns="http://www.w3.org/2000/svg"';
    if (/\{\{FOTO\}\}/.test(svg) && !/xmlns:xlink=/.test(a)) a += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    if (!/viewBox=/i.test(a)) a += ` viewBox="0 0 ${width} ${height}"`;
    return `<svg${a} width="${width}" height="${height}">`;
  });
  return { svg, removed: [...new Set(removed)] };
}

// --- checks (server side, no browser needed) ------------------------------------------------
export function wellFormed(svg) {
  const stack = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?([a-zA-Z][\w:.-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(svg))) {
    if (!m[1]) continue;
    if (m[0].startsWith('</')) { if (stack.pop() !== m[1]) return { ok: false, error: `</${m[1]}> passt nicht` }; } else if (m[2] !== '/') stack.push(m[1]);
  }
  return stack.length ? { ok: false, error: `<${stack.at(-1)}> nicht geschlossen` } : { ok: true };
}

export function checkSet(set) {
  const issues = [];
  for (const a of set.assets) {
    if (!a.svg) { issues.push({ level: 'fehler', asset: a.name, text: `${a.label}: fehlt oder ungültig` }); continue; }
    const wf = wellFormed(a.svg);
    if (!wf.ok) issues.push({ level: 'fehler', asset: a.name, text: `${a.label}: fehlerhaftes SVG (${wf.error})` });
    if (!/<(text|path|circle|rect|polygon|ellipse|line|polyline)\b/i.test(a.svg)) issues.push({ level: 'fehler', asset: a.name, text: `${a.label}: enthält keine sichtbaren Formen` });
    const fonts = [...a.svg.matchAll(/font-family\s*[:=]\s*["']?([^;"'>,]+)/gi)].map((m) => m[1].trim().replace(/['"]/g, ''));
    const unknown = [...new Set(fonts.filter((f) => !FONTS.includes(f) && !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(f)))];
    if (unknown.length) issues.push({ level: 'warnung', asset: a.name, text: `${a.label}: unbekannte Schrift ${unknown.join(', ')} (wird ersetzt)` });
    // text colour against the shape that is really behind it (last filled rect/circle containing the text position)
    const low = textContrasts(a.svg).filter((c) => c < 3);
    if (low.length) issues.push({ level: 'warnung', asset: a.name, text: `${a.label}: Text schwer lesbar (Kontrast ${Math.min(...low)}:1)` });
    if (a.removed?.length) issues.push({ level: 'hinweis', asset: a.name, text: `${a.label}: aus Sicherheitsgründen entfernt: ${a.removed.join(', ')}` });
  }
  return { ok: !issues.some((i) => i.level === 'fehler'), method: 'Server: Struktur, Sicherheit, Schriften, Kontrast', issues };
}

const num = (tag, name) => Number((tag.match(new RegExp(`\\s${name}\\s*=\\s*["']?(-?[\\d.]+)`)) || [])[1]);
const fillOf = (tag) => (tag.match(/\sfill\s*=\s*["'](#[0-9a-f]{3,6})["']/i) || [])[1];
export function textContrasts(svg) {
  const shapes = [];
  const results = [];
  const re = /<(rect|circle|text)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(svg))) {
    const tag = m[0];
    if (m[1].toLowerCase() === 'text') {
      const x = num(tag, 'x') || 0;
      const y = num(tag, 'y') || 0;
      const fill = fillOf(tag);
      if (!fill) continue;
      const behind = [...shapes].reverse().find((sh) => sh.contains(x, y));
      if (behind) { const c = contrast(fill, behind.fill); if (c !== null) results.push(c); }
    } else {
      const fill = fillOf(tag);
      if (!fill || /opacity\s*=\s*["']0?\.[0-6]/.test(tag)) continue;
      if (m[1].toLowerCase() === 'rect') {
        const w = /width\s*=\s*["']100%/.test(tag) ? 1e9 : num(tag, 'width');
        const h = /height\s*=\s*["']100%/.test(tag) ? 1e9 : num(tag, 'height');
        const x0 = num(tag, 'x') || 0;
        const y0 = num(tag, 'y') || 0;
        if (w && h) shapes.push({ fill, contains: (x, y) => x >= x0 && x <= x0 + w && y - 5 >= y0 - 60 && y <= y0 + h + 5 });
      } else {
        const cx = num(tag, 'cx');
        const cy = num(tag, 'cy');
        const r = num(tag, 'r');
        if (r) shapes.push({ fill, contains: (x, y) => Math.hypot(x - cx, y - cy) <= r });
      }
    }
  }
  return results;
}

// --- AI format ----------------------------------------------------------------------------------
export function parseGraphics(text) {
  const raw = String(text ?? '');
  const field = (name) => (new RegExp(`^${name}:\\s*(.+)$`, 'mi').exec(raw)?.[1] || '').trim();
  const assets = [];
  const re = /=== SVG: ([a-z0-9-]+)[^\n]*===\n([\s\S]*?)\n=== ENDE ===/g;
  let m;
  while ((m = re.exec(raw))) assets.push({ name: m[1], svg: m[2] });
  const palette = (field('FARBEN').match(/#[0-9a-f]{6}\b/gi) || []).slice(0, 8);
  const fontLine = field('SCHRIFTEN');
  const [title, body] = fontLine.split(/[,/|]/).map((s) => s.trim());
  return { name: field('NAME'), concept: field('KONZEPT'), palette, fonts: fontLine ? { title: FONTS.includes(title) ? title : 'Montserrat', text: FONTS.includes(body) ? body : 'Inter' } : null, photoPrompt: field('FOTO'), assets };
}

const SYSTEM = `Du bist ein preisgekrönter Grafikdesigner und Markenexperte. Du zeichnest professionelle, eigenständige Designs als sauberes SVG-Vektorgrafik – nie Clipart, nie Kopien bekannter Marken oder Logos.
Regeln für SVG:
- Gültiges SVG mit xmlns und viewBox, nur Vektorformen (path, rect, circle, ellipse, polygon, line, text, g, linearGradient, radialGradient, filter mit feGaussianBlur/feDropShadow, clipPath, mask).
- KEINE Skripte, kein foreignObject, keine externen Bilder oder Links. Ausnahme: ein Foto-Hintergrund NUR als <image href="{{FOTO}}" … preserveAspectRatio="xMidYMid slice"/>, wenn ausdrücklich erlaubt.
- Schriften nur aus dieser Liste (font-family="Name"): ${FONTS.join(', ')}. Text muss vollständig innerhalb der Fläche bleiben (genug Rand, text-anchor="middle" für zentrierten Text).
- Professionelle Gestaltung: klares Konzept, Raster und Ausrichtung, starke Hierarchie, 2–4 Farben mit gutem Kontrast, optische Balance, einheitliche Strichstärken. Logos: einprägsames Bildzeichen, funktioniert klein und einfarbig.
- Texte auf Deutsch (außer Markennamen), keine Platzhalter wie „Lorem ipsum“.
Antwortformat GENAU so:
NAME: <Marken-/Projektname>
KONZEPT: <2 Sätze Designidee>
FARBEN: <#hex, #hex, …>
SCHRIFTEN: <Titelschrift>, <Textschrift>
FOTO: <englische Bildbeschreibung für den Foto-Hintergrund oder leer>
=== SVG: <name> (<breite>x<höhe>) ===
<svg …>…</svg>
=== ENDE ===`;

function finishSet(parsed, type, brief, style) {
  const spec = TYPES[type] || TYPES.logo;
  const assets = spec.assets.map(([name, label, width, height]) => {
    const found = parsed.assets.find((a) => a.name === name) || null;
    const clean = found ? sanitizeSvg(found.svg, width, height) : { svg: '', removed: [] };
    return { name, label, width, height, svg: clean.svg, removed: clean.removed };
  });
  const set = { type, typeLabel: spec.label, brief: clip(brief, 600), style, name: clip(parsed.name, 60) || 'Design', concept: clip(parsed.concept, 400), palette: parsed.palette, fonts: parsed.fonts || { title: 'Montserrat', text: 'Inter' }, photoPrompt: spec.photo ? clip(parsed.photoPrompt, 400) : '', assets };
  set.qa = checkSet(set);
  return set;
}

export async function designGraphics(brief, { type = 'logo', style = 'auto', photo = false, write = generateText } = {}) {
  const wish = clip(brief, 600);
  if (!wish) throw new Error('Was soll ich gestalten?');
  if (!llmProvider() && write === generateText) throw new Error('Das Grafik-Studio braucht den KI-Schlüssel GROQ_API_KEY (kostenlos).');
  const spec = TYPES[type] || TYPES.logo;
  const kind = TYPES[type] ? type : 'logo';
  const styleText = STYLES[style] || STYLES.auto;
  const list = spec.assets.map(([name, label, w, h]) => `- ${name}: ${label}, ${w}x${h}`).join('\n');
  const text = await write({
    system: SYSTEM,
    maxTokens: 8000,
    prompt: `Auftrag: ${wish}\nArt: ${spec.label}\nStil: ${styleText}\nFoto-Hintergrund: ${spec.photo && photo ? 'erlaubt – nutze <image href="{{FOTO}}"/> als Hintergrund mit Farbverlauf darüber, damit Text lesbar bleibt, und schreibe unter FOTO eine passende englische Bildbeschreibung' : 'nein – nur Vektorformen'}\nErstelle diese SVGs (Namen exakt so, genau diese Maße):\n${list}\n${kind === 'brand' || kind === 'logo' ? 'Alle Teile gehören zu EINER Marke: gleiches Bildzeichen, gleiche Farben und Schriften.' : ''}`
  });
  const parsed = parseGraphics(text);
  if (!parsed.assets.length) throw new Error('Die Grafik kam unvollständig zurück. Bitte noch einmal versuchen.');
  return finishSet(parsed, kind, wish, style);
}

export const GRAPHIC_UPGRADE = 'Werte das Design deutlich auf wie ein Senior-Designer: klarere Hierarchie, besseres Raster und Ausrichtung, großzügigere Ränder, verfeinerte Farbpalette mit Tiefe (dezente Verläufe, Schatten), bessere Schriftkombination und Laufweiten, einheitliche Strichstärken, präziseres Bildzeichen, optische Balance. Inhalt und Marke bleiben gleich.';

export async function editGraphics(set, wish, { write = generateText } = {}) {
  const request = clip(wish, 600);
  if (!request) throw new Error('Was soll ich ändern?');
  const spec = TYPES[set?.type] || TYPES.logo;
  const text = await write({
    system: SYSTEM,
    maxTokens: 8000,
    prompt: `Bestehendes Design „${set.name}“ (${spec.label}). Konzept: ${set.concept}\nFarben: ${(set.palette || []).join(', ')} · Schriften: ${set.fonts?.title}, ${set.fonts?.text}${set.photoPrompt ? `\nFOTO bisher: ${set.photoPrompt}` : ''}\n${set.assets.map((a) => `=== SVG: ${a.name} (${a.width}x${a.height}) ===\n${a.svg}\n=== ENDE ===`).join('\n')}\n\nÄnderungswunsch: ${request}\nGib NAME, KONZEPT, FARBEN, SCHRIFTEN, FOTO und NUR die geänderten SVGs (gleiche Namen und Maße) zurück.`
  });
  const parsed = parseGraphics(text);
  if (!parsed.assets.length) throw new Error('Ich konnte die Änderung nicht umsetzen. Formulier sie bitte etwas genauer.');
  const merged = { ...parsed, name: parsed.name || set.name, concept: parsed.concept || set.concept, palette: parsed.palette.length ? parsed.palette : set.palette, fonts: parsed.fonts || set.fonts, photoPrompt: parsed.photoPrompt || set.photoPrompt, assets: set.assets.map((a) => parsed.assets.find((p) => p.name === a.name) || { name: a.name, svg: a.svg }) };
  const next = finishSet(merged, set.type, set.brief, set.style);
  next.changed = parsed.assets.map((a) => a.name).filter((n) => set.assets.some((a) => a.name === n));
  return next;
}

// Keep a set coming back from the browser within safe limits.
export function sanitizeSet(set) {
  const spec = TYPES[set?.type] || TYPES.logo;
  return finishSet({ name: set?.name, concept: set?.concept, palette: (set?.palette || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8), fonts: { title: FONTS.includes(set?.fonts?.title) ? set.fonts.title : 'Montserrat', text: FONTS.includes(set?.fonts?.text) ? set.fonts.text : 'Inter' }, photoPrompt: set?.photoPrompt, assets: (set?.assets || []).map((a) => ({ name: String(a?.name || ''), svg: String(a?.svg || '') })) }, TYPES[set?.type] ? set.type : 'logo', set?.brief, set?.style);
}

// Which design studio fits a free-text wish (used by the Design Studio hub).
export function classifyDesign(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(3d|drei-?d)\b|haus|villa|zimmer|wohnung|gebäude|stadt in 3d|möbel|raum|skyline|produktmodell/.test(t) && !/website|webseite|logo/.test(t)) return { studio: 'model3d', label: '3D-Studio' };
  if (/logo|poster|plakat|banner|flyer|app-?icon|icon|verpackung|packung|etikett|visitenkarte|instagram|social|story|post\b|marke|branding|corporate|markenidentität|modemarke/.test(t) && !/website|webseite|shop|landingpage/.test(t)) {
    const type = /app-?icon|icon/.test(t) ? 'app_icon' : /poster|plakat|flyer/.test(t) ? 'poster' : /banner/.test(t) ? 'banner' : /story|reel/.test(t) ? 'story' : /instagram|social|post\b/.test(t) ? 'social_post' : /verpackung|packung|etikett/.test(t) ? 'packaging' : /logo/.test(t) && !/marke|branding|identität/.test(t) ? 'logo' : 'brand';
    return { studio: 'graphics', label: 'Grafik & Marke', type };
  }
  if (/spiel|game|app\b|rechner|tool|werkzeug|quiz|timer|to-?do/.test(t) && !/website|webseite|shop/.test(t)) return { studio: 'workshop', label: 'Werkstatt (Apps & Spiele)' };
  if (/bild von|foto von|malen|zeichne ein bild|wallpaper|hintergrundbild/.test(t)) return { studio: 'image', label: 'Bild' };
  return { studio: 'website', label: 'Website (Jarvis Studio)' };
}
