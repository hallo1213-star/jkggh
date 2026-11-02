// Anzug-Labor: Jarvis entwirft seinen eigenen Hightech-Anzug. Die KI liefert
// Name, Farben, Form, Bauteile und Werte; daraus zeichnet die App den Anzug
// als Vektorgrafik (Bauplan-Animation, Anzieh-Animation) und ein KI-Bild.
import { generateJson } from './llm.js';
import { imageUrl } from './images.js';

const SYSTEM = `Du bist JARVIS und entwirfst deinen eigenen futuristischen Hightech-Rüstungsanzug (eigenes Design, keine Kopie bekannter Filmfiguren).
Antworte NUR mit JSON, deutsche Texte, Bildbeschreibung auf Englisch.`;

const SHAPE = `{
 "name": "Name des Anzugs, z. B. MARK ROT-1 (max. 18 Zeichen)",
 "motto": "kurzer cooler Satz",
 "farben": { "haupt": "#hex Hauptfarbe", "akzent": "#hex zweite Farbe", "leuchten": "#hex Farbe von Reaktor und Augen" },
 "helm": "klassisch | kantig | rund",
 "schulter": "schmal | breit",
 "teile": [5 x { "teil": "Helm | Brustpanzer | Arme | Beine | Antrieb", "beschreibung": "1 kurzer Satz" }],
 "werte": { "schutz": 0-100, "tempo": 0-100, "energie": 0-100, "flug": 0-100, "technik": 0-100 },
 "faehigkeiten": ["3 kurze Fähigkeiten"],
 "bild": "ENGLISH, precise description of the suit for a cinematic render: colors, materials, shapes, glow"
}`;

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v, max = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const pct = (v, f = 60) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : f; };
const pick = (v, options) => (options.includes(String(v).trim().toLowerCase()) ? String(v).trim().toLowerCase() : options[0]);
const STATS = [['schutz', 'Schutz'], ['tempo', 'Tempo'], ['energie', 'Energie'], ['flug', 'Flug'], ['technik', 'Technik']];
const PARTS = ['Helm', 'Brustpanzer', 'Arme', 'Beine', 'Antrieb'];

export function normalizeSuit(raw, { wish = '' } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const color = (v, f) => (HEX.test(String(v).trim()) ? String(v).trim() : f);
  const parts = Array.isArray(r.teile) ? r.teile : [];
  const suit = {
    name: str(r.name, 18).replace(/[^\p{L}\p{N} .-]/gu, '').toUpperCase() || 'MARK I',
    motto: str(r.motto, 90),
    farben: { haupt: color(r.farben?.haupt, '#b3121f'), akzent: color(r.farben?.akzent, '#d4a64a'), leuchten: color(r.farben?.leuchten, '#7ff3ff') },
    helm: pick(r.helm, ['klassisch', 'kantig', 'rund']),
    schulter: pick(r.schulter, ['breit', 'schmal']),
    teile: PARTS.map((teil, i) => ({ teil, beschreibung: str(parts.find((p) => str(p?.teil).toLowerCase().startsWith(teil.slice(0, 4).toLowerCase()))?.beschreibung || parts[i]?.beschreibung, 120) })),
    werte: STATS.map(([key, label]) => ({ key, label, wert: pct(r.werte?.[key]) })),
    faehigkeiten: (Array.isArray(r.faehigkeiten) ? r.faehigkeiten : []).slice(0, 3).map((f) => str(f, 60)).filter(Boolean),
    wunsch: str(wish, 200),
    bild: str(r.bild, 500),
    erstellt: Date.now()
  };
  const seed = [...suit.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 900000, 11);
  suit.bildUrl = imageUrl(`${suit.bild || 'futuristic high-tech armored exosuit'}, full body front view, standing heroic pose, colors ${suit.farben.haupt} and ${suit.farben.akzent}, glowing ${suit.farben.leuchten} chest reactor and eyes, cinematic dark studio, rim light, highly detailed, no text`, { format: 'hoch', seed });
  // Photo-realistic picture for the main screen and the suit-up animation
  // (front view, centered, black background so it blends into the app).
  suit.foto = { seed, prompt: `photorealistic full body photo of a futuristic high-tech armored exosuit, ${suit.bild || 'sleek metallic armor plates'}, main color ${suit.farben.haupt}, accents ${suit.farben.akzent}, glowing ${suit.farben.leuchten} round reactor in the center of the chest and glowing eyes, standing straight facing the camera, symmetrical front view, arms at the sides, whole body visible from head to feet, centered, pure black background, dramatic cinematic studio lighting, rim light, polished metal reflections, ultra detailed, 8k, no text` };
  return suit;
}

export async function designSuit(wish, { generate = generateJson } = {}) {
  const prompt = `${str(wish, 300) ? `Wunsch des Nutzers: „${str(wish, 300)}“.` : 'Kein besonderer Wunsch – entwirf etwas Eindrucksvolles.'}\nLiefere genau dieses JSON:\n${SHAPE}`;
  return normalizeSuit(await generate({ system: SYSTEM, prompt, maxTokens: 1400 }), { wish });
}
