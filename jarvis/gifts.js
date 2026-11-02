// Geschenk-Box: 5 passende Geschenkideen mit Preis und KI-Bild.
import { generateJson } from './llm.js';
import { imageUrl } from './images.js';

const str = (v, max = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeGifts(raw, { budget = 0 } = {}) {
  const list = (Array.isArray(raw?.ideen) ? raw.ideen : []).slice(0, 5).map((g, i) => {
    const name = str(g?.name, 60);
    if (!name) return null;
    const price = Number(String(g?.preis ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
    return {
      name,
      preis: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
      warum: str(g?.warum, 160),
      wo: str(g?.wo, 60),
      bildUrl: imageUrl(`${str(g?.bild, 300) || `${name}, gift`}, product photo, gift wrapped nearby, soft warm light, clean background, no text`, { format: 'quadrat', seed: [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 900000, 3 + i) })
    };
  }).filter(Boolean);
  if (!list.length) throw new Error('Mir sind gerade keine Geschenkideen eingefallen. Versuch es noch einmal.');
  return { fuer: str(raw?.fuer, 60), anlass: str(raw?.anlass, 60), budget: Number(budget) || null, ideen: list };
}

export async function giftIdeas({ recipient = '', occasion = '', budget = 0, interests = '' }, { generate = generateJson } = {}) {
  const prompt = `Finde 5 kreative, passende Geschenkideen.
Für: ${str(recipient, 80) || 'unbekannt'} · Anlass: ${str(occasion, 80) || 'keiner genannt'} · Budget: ${Number(budget) > 0 ? `höchstens ${Number(budget)} €` : 'flexibel, eher günstig'} · Interessen: ${str(interests, 160) || 'unbekannt'}.
Realistische Preise in Euro (Deutschland), nichts Gefährliches. Antworte NUR mit JSON:
{ "fuer": "...", "anlass": "...", "ideen": [5 x { "name": "kurz", "preis": Zahl, "warum": "1 Satz, warum es passt", "wo": "wo man es bekommt, z. B. Drogerie, Online-Shop", "bild": "ENGLISH product photo description" }] }`;
  return normalizeGifts(await generate({ system: 'Du bist JARVIS, ein kreativer Geschenkberater. Deutsch, ehrlich, konkret.', prompt, maxTokens: 1200 }), { budget });
}
