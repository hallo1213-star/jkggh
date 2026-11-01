// Jarvis' own 3D models: the AI plans a scene from the user's description
// (components such as houses, towers, trees, pools, flying cars, plus free
// primitives), the server validates it, and the app builds real 3D geometry
// with Three.js (viewable, editable, exportable as GLB). No web search, no
// downloaded models – Jarvis designs everything himself.
import { generateJson, llmProvider } from './llm.js';

export const COMPONENTS = {
  house: 'Wohnhaus. params: floors (1-4), width, depth (Meter, 6-30), style ("modern"|"futuristisch"|"klassisch"), roof ("flach"|"sattel"), color (Hex Wände), accent (Hex Fensterrahmen), windows (true), door (true), balcony (bool), glass (0-1 Glasanteil der Fassade)',
  tower: 'Hochhaus/Wolkenkratzer. params: height (10-300), width (5-40), depth, color, glass (0-1), lights (bool, leuchtende Fensterbänder), taper (0-0.5 nach oben schmaler), antenna (bool)',
  pool: 'Swimmingpool. params: width, depth (Meter), deck (bool, Holzdeck), lights (bool)',
  garden: 'Rasenfläche mit Hecke. params: width, depth, hedge (bool), flowers (bool)',
  tree: 'Baum. params: kind ("laub"|"tanne"|"palme"), height (2-15)',
  car: 'Auto. params: color, flying (bool – fliegendes Auto, schwebt und kreist), altitude (Meter, nur fliegend), orbit (Radius der Kreisbahn, nur fliegend)',
  road: 'Straße. params: length, width (Meter), markings (bool). Mit rotation 90 quer.',
  path: 'Gehweg/Pfad aus Platten. params: length, width',
  lamp: 'Straßenlaterne. params: height, color (Lichtfarbe)',
  fence: 'Zaun. params: length, height, color',
  rock: 'Felsen. params: size',
  bench: 'Parkbank. params: color',
  fountain: 'Brunnen. params: size',
  city: 'Generator für ein ganzes Stadtviertel (erzeugt automatisch viele Hochhäuser, Straßen, Lichter). params: blocks (2-6 Blöcke pro Seite), maxHeight (30-250), style ("futuristisch"|"modern"), flyingCars (0-30), trees (bool), seed (Zahl)',
  box: 'Quader. params: width, height, depth, color, material',
  cylinder: 'Zylinder. params: radius, height, color, material',
  sphere: 'Kugel. params: radius, color, material',
  cone: 'Kegel. params: radius, height, color, material',
  torus: 'Ring. params: radius, tube, color, material',
  text: 'Schwebender 3D-Schriftzug als Schild (kurz). params: text (max 24 Zeichen), color, size'
};

const MATERIALS = ['matt', 'glanz', 'metall', 'glas', 'leuchtend', 'holz', 'stein', 'wasser'];
const GROUNDS = ['gras', 'sand', 'beton', 'wasser', 'schnee', 'weltraum', 'erde'];
const SKIES = ['tag', 'sonnenuntergang', 'nacht', 'weltraum', 'bewoelkt'];
const MAX_ITEMS = 300;

const num = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const hex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value).toLowerCase() : fallback);
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function cleanParams(type, params = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const out = {};
  for (const [key, value] of Object.entries(p).slice(0, 20)) {
    if (!/^[a-zA-Z]{1,20}$/.test(key)) continue;
    if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = num(value, -1000, 1000, 0);
    else if (typeof value === 'string') out[key] = /color|accent/i.test(key) ? hex(value, undefined) : text(value, key === 'text' ? 24 : 30);
    if (out[key] === undefined) delete out[key];
  }
  if (out.material && !MATERIALS.includes(out.material)) delete out.material;
  if (type === 'city') {
    out.blocks = num(out.blocks, 2, 6, 4);
    out.maxHeight = num(out.maxHeight, 30, 250, 120);
    out.flyingCars = num(out.flyingCars, 0, 30, 8);
  }
  return out;
}

export function sanitizeScene(input) {
  const scene = input && typeof input === 'object' ? input : {};
  const vec = (v, fallback = [0, 0, 0]) => (Array.isArray(v) && v.length === 3 ? v.map((n, i) => num(n, i === 1 ? -50 : -600, i === 1 ? 400 : 600, fallback[i])) : fallback);
  const items = (Array.isArray(scene.items) ? scene.items : [])
    .filter((item) => item && COMPONENTS[item.type])
    .slice(0, MAX_ITEMS)
    .map((item) => ({
      type: item.type,
      name: text(item.name, 40),
      position: vec(item.position),
      rotation: num(item.rotation, -360, 360, 0),
      scale: num(item.scale, 0.1, 20, 1),
      params: cleanParams(item.type, item.params)
    }));
  return {
    title: text(scene.title, 60) || '3D-Modell',
    description: text(scene.description, 400),
    ground: GROUNDS.includes(scene.ground) ? scene.ground : 'gras',
    sky: SKIES.includes(scene.sky) ? scene.sky : 'tag',
    items
  };
}

const SYSTEM = `Du bist der 3D-Designer von Jarvis. Du entwirfst selbst eine 3D-Szene aus Bausteinen und gibst sie als JSON zurück. Keine Erklärungen, nur JSON.
Koordinaten in Metern: x nach rechts, y nach oben (Boden y=0), z nach vorne. rotation = Drehung um die Hochachse in Grad. Platziere Dinge sinnvoll ohne Überschneidungen (Pool neben dem Haus, Bäume im Garten, Autos auf Straßen).
Bausteine (type) und ihre params:
${Object.entries(COMPONENTS).map(([type, info]) => `- ${type}: ${info}`).join('\n')}
material für box/cylinder/sphere/cone/torus: ${MATERIALS.join(', ')}.
Antwortformat: {"title":"","description":"1–2 Sätze, was du gebaut hast","ground":"${GROUNDS.join('|')}","sky":"${SKIES.join('|')}","items":[{"type":"","name":"","position":[x,0,z],"rotation":0,"scale":1,"params":{}}]}
Gestalte detailreich und stimmig (Farben als Hex, z. B. Weiß #f2f4f7, Anthrazit #2b2f36, Holz #a0703c). Für Städte nutze den Baustein city und ergänze Besonderes. Maximal ${MAX_ITEMS} Einträge.`;

export async function designScene(prompt, { base = null, generate = generateJson } = {}) {
  const wish = text(prompt, 600);
  if (!wish) throw new Error('Was soll ich bauen?');
  if (!llmProvider() && generate === generateJson) return fallbackScene(wish);
  try {
    const reply = await generate({
      system: SYSTEM,
      maxTokens: 7000,
      prompt: base
        ? `Bisherige Szene:\n${JSON.stringify(base)}\n\nÄnderungswunsch: ${wish}\n\nGib die komplette geänderte Szene zurück (alles andere bleibt gleich). Verlangt der Wunsch eindeutig etwas völlig anderes (z. B. eine Stadt statt eines Hauses), entwirf stattdessen eine neue Szene.`
        : `Entwirf: ${wish}`
    });
    const scene = sanitizeScene(reply);
    if (!scene.items.length) throw new Error('leere Szene');
    return scene;
  } catch (error) {
    if (base) throw new Error(`Die Änderung hat nicht geklappt (${error.message}). Versuch es anders zu formulieren.`);
    return { ...fallbackScene(wish), hinweis: `KI nicht erreichbar (${error.message}) – mit dem eingebauten Generator gebaut.` };
  }
}

// Built-in generator for when no AI key is set (or the AI fails).
export function fallbackScene(prompt) {
  const p = prompt.toLowerCase();
  const futuristic = /futur|modern|sci|zukunft/.test(p);
  if (/stadt|city|skyline|viertel/.test(p)) {
    return sanitizeScene({
      title: futuristic ? 'Futuristische Stadt' : 'Stadt',
      description: 'Ein Stadtviertel mit Hochhäusern, Straßen und Lichtern.',
      ground: 'beton',
      sky: /nacht|night/.test(p) || futuristic ? 'nacht' : 'sonnenuntergang',
      items: [{ type: 'city', params: { blocks: 4, maxHeight: 160, style: futuristic ? 'futuristisch' : 'modern', flyingCars: /flieg|auto/.test(p) ? 14 : 4, trees: true, seed: 7 } }]
    });
  }
  return sanitizeScene({
    title: futuristic ? 'Futuristisches Haus' : 'Haus mit Garten',
    description: 'Ein Wohnhaus mit Garten, Pool und Bäumen.',
    ground: 'gras',
    sky: 'sonnenuntergang',
    items: [
      { type: 'house', position: [0, 0, 0], params: { floors: 2, width: 16, depth: 11, style: futuristic ? 'futuristisch' : 'modern', roof: 'flach', color: '#f2f4f7', accent: '#2b2f36', balcony: true, glass: 0.55 } },
      { type: 'pool', position: [0, 0, 14], params: { width: 10, depth: 5, deck: true, lights: true } },
      { type: 'garden', position: [0, 0, 6], params: { width: 34, depth: 30, hedge: true, flowers: true } },
      { type: 'tree', position: [-13, 0, 12], params: { kind: futuristic ? 'palme' : 'laub', height: 7 } },
      { type: 'tree', position: [13, 0, 12], params: { kind: futuristic ? 'palme' : 'laub', height: 6 } },
      { type: 'path', position: [-10, 0, 13], rotation: 90, params: { length: 14, width: 1.6 } },
      { type: 'lamp', position: [-6, 0, 18] },
      { type: 'lamp', position: [6, 0, 18] }
    ]
  });
}

export function describeScene(scene) {
  const counts = {};
  for (const item of scene.items) counts[item.type] = (counts[item.type] || 0) + 1;
  return Object.entries(counts).map(([type, n]) => `${n}× ${type}`).join(', ');
}
