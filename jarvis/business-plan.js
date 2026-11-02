// Business-Modus („Business Creation Protocol“): Jarvis entwirft in einem Durchgang
// ein komplettes Geschäftskonzept – Marktanalyse, Produkt, Marke, Produktlinie,
// Website-Texte, Werbung und Startplan. Alles kommt von der KI; Zahlen sind
// ausdrücklich Schätzungen und werden in der App so gekennzeichnet.
import { generateJson } from './llm.js';
import { imageUrl } from './images.js';

const SYSTEM = `Du bist JARVIS im Business-Modus: ein erfahrener Gründungsberater und Markenstratege.
Du entwirfst realistische, kleine Online-Geschäfte, die eine Person ohne Firma mit wenig Startkapital testen kann.
Regeln: ehrlich und realistisch, keine Gewinnversprechen, keine illegalen oder gefährlichen Produkte, keine Markenrechtsverletzungen (eigener Markenname), deutsche Texte.
Zahlen (Marktgröße, Preise, Kosten) sind grobe Schätzungen – markiere sie nicht als Fakten.
Antworte NUR mit JSON.`;

const SHAPE = `{
 "idee": "kurzer Titel des Geschäfts (z. B. Personalisierte LED-Neonschilder)",
 "name": "eigener, kurzer Markenname (1 Wort, gut aussprechbar)",
 "slogan": "Slogan, max. 6 Wörter",
 "zielgruppe": "wer kauft, 1 Satz",
 "markt": {
   "zusammenfassung": "2 Sätze Marktanalyse",
   "trends": ["3 kurze Trends"],
   "wettbewerb": ["3 Arten von Konkurrenten, keine echten Firmennamen"],
   "chance": 0-100 (deine Einschätzung der Erfolgschance für einen Test),
   "nachfrage": [6 Zahlen 0-100: geschätzter Interesse-Verlauf der letzten 6 Monate]
 },
 "marke": { "farben": ["#hex", "#hex", "#hex"], "ton": "Tonalität in 3 Wörtern", "logoIdee": "1 Satz" },
 "produkte": [5 x { "name": "...", "preis": Zahl in Euro, "beschreibung": "1 Satz", "bild": "ENGLISCHE, sehr genaue Beschreibung für ein Produktfoto (Studio-Licht, Hintergrund, Stil)" }],
 "webseite": { "headline": "...", "unterzeile": "...", "button": "...", "abschnitte": ["3 Abschnittstitel"], "heroBild": "ENGLISCHE Beschreibung für ein großes, stimmungsvolles Titelbild der Marke" },
 "werbung": [3 x { "kanal": "TikTok|Instagram|Google|...", "hook": "erster Satz", "text": "1–2 Sätze", "bild": "ENGLISCHE Beschreibung für das Werbemotiv (Hochformat, Social Media)" }],
 "kosten": [4 x { "posten": "...", "betrag": Zahl in Euro }],
 "schritte": ["5 konkrete erste Schritte, der erste heute machbar"],
 "risiken": ["2 ehrliche Risiken"]
}`;

const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v, min, max, fallback = 0) => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
};
const list = (v, n, map) => (Array.isArray(v) ? v : []).slice(0, n).map(map).filter(Boolean);
const HEX = /^#[0-9a-f]{6}$/i;

// Brings whatever the model returned into a safe, predictable shape.
export function normalizePlan(raw, { idea = '', budget = 0 } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const m = r.markt || {};
  const plan = {
    idee: str(r.idee || idea, 80) || 'Geschäftsidee',
    name: str(r.name, 24).replace(/[^\p{L}\p{N} &.-]/gu, '') || 'Marke',
    slogan: str(r.slogan, 60),
    zielgruppe: str(r.zielgruppe, 160),
    markt: {
      zusammenfassung: str(m.zusammenfassung, 320),
      trends: list(m.trends, 3, (t) => str(t, 90)),
      wettbewerb: list(m.wettbewerb, 3, (t) => str(t, 90)),
      chance: num(m.chance, 0, 100, 50),
      nachfrage: list(m.nachfrage, 6, (x) => num(x, 0, 100, 0) || 1)
    },
    marke: {
      farben: list(r.marke?.farben, 3, (c) => (HEX.test(String(c).trim()) ? String(c).trim() : null)),
      ton: str(r.marke?.ton, 60),
      logoIdee: str(r.marke?.logoIdee, 160)
    },
    produkte: list(r.produkte, 5, (p) => (p && str(p.name) ? { name: str(p.name, 50), preis: num(p.preis, 0, 100000, 0), beschreibung: str(p.beschreibung, 140), bild: str(p.bild, 400) } : null)),
    webseite: {
      headline: str(r.webseite?.headline, 70),
      unterzeile: str(r.webseite?.unterzeile, 140),
      button: str(r.webseite?.button, 30) || 'Jetzt entdecken',
      abschnitte: list(r.webseite?.abschnitte, 3, (t) => str(t, 40)),
      heroBild: str(r.webseite?.heroBild, 400)
    },
    werbung: list(r.werbung, 3, (a) => (a && (a.text || a.hook) ? { kanal: str(a.kanal, 20) || 'Social', hook: str(a.hook, 90), text: str(a.text, 200), bild: str(a.bild, 400) } : null)),
    kosten: list(r.kosten, 4, (k) => (k && str(k.posten) ? { posten: str(k.posten, 50), betrag: num(k.betrag, 0, 1000000, 0) } : null)),
    schritte: list(r.schritte, 5, (t) => str(t, 140)),
    risiken: list(r.risiken, 2, (t) => str(t, 140)),
    budget: num(budget, 0, 1000000, 0)
  };
  while (plan.marke.farben.length < 3) plan.marke.farben.push(['#ff3ea5', '#a855f7', '#0b0612'][plan.marke.farben.length]);
  if (plan.markt.nachfrage.length < 2) plan.markt.nachfrage = [];
  attachImages(plan);
  plan.startkosten = Math.round(plan.kosten.reduce((s, k) => s + k.betrag, 0));
  if (!plan.produkte.length || !plan.slogan) throw new Error('Die KI hat kein vollständiges Konzept geliefert. Bitte noch einmal versuchen.');
  return plan;
}

// Real pictures from the free image generator (no key): one per product, a hero
// image for the website and one motif per ad. Seeds are fixed per plan so the
// pictures stay the same when the concept is opened again.
export function attachImages(plan, { url = imageUrl } = {}) {
  const base = [...`${plan.name}${plan.idee}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 900000, 7);
  const look = `brand colors ${plan.marke.farben.join(' ')}`;
  plan.produkte.forEach((p, i) => {
    p.bildUrl = url(`${p.bild || `professional product photo of ${p.name}, ${plan.idee}`}, ${look}, high-end e-commerce product shot, centered, soft studio light, no text`, { format: 'quadrat', seed: base + i });
  });
  plan.webseite.heroUrl = url(`${plan.webseite.heroBild || `cinematic hero image for the brand ${plan.name}, ${plan.idee}`}, ${look}, wide cinematic shot, dramatic light, no text`, { format: 'quer', seed: base + 50 });
  plan.werbung.forEach((a, i) => {
    a.bildUrl = url(`${a.bild || `social media ad motif for ${plan.idee}`}, ${look}, vertical social media ad photo, eye-catching, no text`, { format: 'hoch', seed: base + 100 + i });
  });
  return plan;
}

export async function planBusiness(idea, { budget = 0, generate = generateJson } = {}) {
  const wish = str(idea, 300);
  const money = num(budget, 0, 1000000, 0);
  const prompt = `${wish ? `Geschäftsidee des Nutzers: „${wish}“.` : 'Der Nutzer hat keine Idee vorgegeben – wähle selbst eine originelle, gut testbare Produktidee mit visuellem Wow-Effekt.'}
${money ? `Startkapital: ca. ${money} €. Die Startkosten müssen darunter bleiben.` : 'Startkapital: klein (unter 300 €).'}
Bildbeschreibungen (bild, heroBild) IMMER auf Englisch, konkret und fotografisch, ohne Text im Bild.
Liefere genau dieses JSON:
${SHAPE}`;
  const raw = await generate({ system: SYSTEM, prompt, maxTokens: 3200 });
  return normalizePlan(raw, { idea: wish, budget: money });
}

// Text for the Studio so Jarvis can build the real website for the brand.
export function websiteBrief(plan) {
  return `Online-Shop für die Marke „${plan.name}“ (${plan.idee}). Slogan: ${plan.slogan}. Zielgruppe: ${plan.zielgruppe}. Farben: ${plan.marke.farben.join(', ')}, Tonalität: ${plan.marke.ton}. Startseite mit Headline „${plan.webseite.headline}“, Unterzeile „${plan.webseite.unterzeile}“, Button „${plan.webseite.button}“. Produkte: ${plan.produkte.map((p) => `${p.name} (${p.preis} €) – ${p.beschreibung}`).join('; ')}. Abschnitte: ${plan.webseite.abschnitte.join(', ')}.`;
}
