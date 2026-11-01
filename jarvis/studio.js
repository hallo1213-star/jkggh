// Jarvis Studio: professional multi-page websites written by Jarvis' AI in
// several steps (concept & design system → CSS → JavaScript with pages, cart
// and animations → HTML), so bigger sites fit into free AI limits. Edits
// change only the affected files. Images are generated per site (Pollinations,
// prompts written by Jarvis) – no invented stock URLs.
import { generateJson, generateText, llmProvider } from './llm.js';
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

const DESIGN_SYSTEM = `Du bist Art Director und Senior-Frontend-Entwickler einer preisgekrönten Designagentur. Du entwirfst individuelle, hochwertige Websites – nie generische KI-Vorlagen.
Gestaltungsregeln: eigenes Designsystem pro Projekt (Farbpalette, Schriftpaar von Google Fonts, Abstände, Radius, Bildsprache), große Typografie und eindrucksvoller Hero, großzügiger Weißraum, klare Hierarchie, wenige gezielte Akzente statt Farbverläufen überall, keine Emojis als Icons (nutze schlichte Inline-SVG-Icons), keine Rahmen um jedes Element, keine Füllfloskeln – echte, konkrete deutsche Texte passend zur Marke. Mobile first, voll responsiv. Barrierearm (Kontraste, alt-Texte, Fokuszustände).`;

const PLAN_PROMPT = (wish) => `Auftrag: ${wish}
Entwirf das Konzept als JSON:
{"name":"Markenname","tagline":"","stil":"2 Sätze Designrichtung","farben":{"hintergrund":"#","flaeche":"#","text":"#","gedimmt":"#","akzent":"#","akzent2":"#"},"schriften":{"titel":"Google-Font-Name","text":"Google-Font-Name"},"radius":"z. B. 0px oder 18px","seiten":[{"route":"#/","titel":"Start","inhalt":"was auf der Seite ist"}],"produkte":[{"id":"kurz","name":"","preis":0,"kategorie":"","beschreibung":"","bild":"englische Bildbeschreibung"}],"animationen":"welche Effekte passen","funktionen":["z. B. Warenkorb, Filter, Kontaktformular (Demo)"]}
Seiten: alle, die so ein Projekt braucht (Shop z. B. Start, Kollektion/Produkte, Produktdetail #/produkt/:id, Warenkorb, Über uns, Kontakt, FAQ). Produkte nur bei Shops/Speisekarten (6–12 Stück), sonst leeres Array.`;

const FILE_FORMAT = 'Antworte NUR im Format:\n=== DATEI: <name> ===\n<vollständiger Inhalt>\n=== ENDE ===';

export async function buildSite(wish, { onProgress = () => {}, generate = generateJson, write = generateText } = {}) {
  const prompt = String(wish ?? '').trim().slice(0, 800);
  if (!prompt) throw new Error('Was für eine Website soll ich bauen?');
  if (!llmProvider() && generate === generateJson) throw new Error('Jarvis Studio braucht den KI-Schlüssel GROQ_API_KEY (kostenlos).');
  onProgress('Konzept & Designsystem');
  const plan = await withRetry(() => generate({ system: DESIGN_SYSTEM, prompt: PLAN_PROMPT(prompt), maxTokens: 3000 }), onProgress);
  const brief = JSON.stringify(plan).slice(0, 6000);

  onProgress('Gestaltung (CSS)');
  const css = await withRetry(() => write({ system: DESIGN_SYSTEM, maxTokens: 7000, prompt: `Konzept:\n${brief}\n\nSchreibe styles.css: CSS-Variablen aus dem Designsystem, @import der Google Fonts, Basis-Typografie (fließende Größen mit clamp), Layout-Hilfen, Navigation (fixiert, Mobilmenü), Hero, Sektionen, Produktkarten mit Hover, Produktdetail, Warenkorb, Formulare, Footer, Buttons mit Mikroanimationen, Scroll-Reveal-Klassen (.reveal/.reveal.is-visible), Seitenübergang (.page-enter), prefers-reduced-motion. Kompakt, kein Tailwind.\n${FILE_FORMAT}` }), onProgress);

  onProgress('Seiten & Funktionen (JavaScript)');
  const js = await withRetry(() => write({ system: DESIGN_SYSTEM, maxTokens: 8000, prompt: `Konzept:\n${brief}\n\nVorhandene CSS-Klassen (Auszug):\n${(css.match(/\.[a-z][\w-]*/g) || []).slice(0, 120).join(' ')}\n\nSchreibe app.js (reines JavaScript, kein Framework): Hash-Router für ALLE Seiten aus dem Konzept (rendert in <main id="app">, aktiver Nav-Link, Scroll nach oben, Seitenübergang), alle Seiteninhalte mit echten Texten, Daten (Produkte) als Array, Produktliste mit Filter, Produktdetailseite, Warenkorb (hinzufügen, Menge ändern, entfernen, Summe, localStorage, Zähler in der Navigation), Kasse nur als deutlich markierte Demo ohne echte Zahlung, Kontaktformular als Demo mit Bestätigung, Mobilmenü, IntersectionObserver für .reveal, kleine Hero-Animation. ${IMAGE_RULE} Fehlerfrei, keine fehlenden Funktionen.\n${FILE_FORMAT}` }), onProgress);

  onProgress('Grundgerüst (HTML)');
  const html = await withRetry(() => write({ system: DESIGN_SYSTEM, maxTokens: 3000, prompt: `Konzept:\n${brief}\n\nSchreibe index.html: lang="de", Meta (Viewport, Beschreibung, Theme-Color), Titel, <link rel="stylesheet" href="styles.css">, Kopfbereich mit Logo-Schriftzug, Navigation (Links zu allen Routen mit href="#/..."), Warenkorb-Knopf mit Zähler (falls Shop), Mobilmenü-Knopf, <main id="app"></main>, Footer (Spalten, Links, Impressum-Hinweis), am Ende <script src="app.js"></script>.\n${FILE_FORMAT}` }), onProgress);

  const files = [...parseProject(html).files, ...parseProject(css).files, ...parseProject(js).files];
  const project = sanitizeProject({ title: plan?.name || prompt.slice(0, 40), kind: 'website', description: plan?.tagline || plan?.stil || '', files });
  if (!project.files.some((f) => f.path === 'index.html')) throw new Error('Die Website kam unvollständig zurück. Bitte noch einmal versuchen.');
  project.plan = { name: plan?.name, stil: plan?.stil, seiten: (plan?.seiten || []).map((s) => s.route), farben: plan?.farben, schriften: plan?.schriften };
  return project;
}

// Targeted edits: only the files that need to change come back.
export async function editSite(project, wish, { onProgress = () => {}, write = generateText } = {}) {
  const request = String(wish ?? '').trim().slice(0, 800);
  if (!request) throw new Error('Was soll ich ändern?');
  onProgress('Änderung planen und umsetzen');
  const reply = await withRetry(() => write({
    system: DESIGN_SYSTEM,
    maxTokens: 8000,
    prompt: `Bestehende Website "${project.title}":\n${project.files.map((f) => `=== DATEI: ${f.path} ===\n${f.content}\n=== ENDE ===`).join('\n')}\n\nÄnderungswunsch: ${request}\n\nÄndere gezielt nur, was nötig ist. Alle bestehenden Funktionen (Seiten, Warenkorb, Navigation) bleiben erhalten. ${IMAGE_RULE}\nGib NUR die geänderten Dateien vollständig zurück (unveränderte weglassen).\n${FILE_FORMAT}`
  }), onProgress);
  const changed = parseProject(reply).files;
  if (!changed.length) throw new Error('Ich konnte die Änderung nicht umsetzen. Formulier sie bitte etwas genauer.');
  const files = project.files.map((f) => changed.find((c) => c.path === f.path) || f);
  for (const c of changed) if (!files.some((f) => f.path === c.path)) files.push(c);
  return { ...sanitizeProject({ ...project, files }), plan: project.plan, changed: changed.map((c) => c.path) };
}

// Automatic repair after the quality check found problems.
export async function fixSite(project, problems, { write = generateText } = {}) {
  const list = (Array.isArray(problems) ? problems : []).map((p) => String(p).slice(0, 300)).slice(0, 15);
  if (!list.length) return project;
  return editSite(project, `Behebe diese Fehler, die der automatische Test gefunden hat:\n- ${list.join('\n- ')}`, { write });
}
