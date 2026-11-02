// Gedanken-Karte: Jarvis baut zu einem Thema eine Mindmap (Thema → 4–6 Äste →
// je 2–4 Unterpunkte). Erweitern: neuer Ast oder Unterpunkt.
import { generateJson } from './llm.js';

const str = (v, max = 60) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeMap(raw, topic = '') {
  const branches = (Array.isArray(raw?.aeste) ? raw.aeste : []).slice(0, 7).map((b) => ({
    text: str(b?.text || b?.name, 40),
    kinder: (Array.isArray(b?.punkte || b?.kinder) ? (b.punkte || b.kinder) : []).slice(0, 5).map((k) => str(typeof k === 'string' ? k : k?.text, 48)).filter(Boolean)
  })).filter((b) => b.text);
  if (!branches.length) throw new Error('Mir ist zu dem Thema keine Gliederung eingefallen. Versuch es nochmal.');
  return { thema: str(raw?.thema || topic, 50) || 'Thema', aeste: branches };
}

export async function buildMindmap(topic, { generate = generateJson } = {}) {
  const prompt = `Erstelle eine Mindmap für einen Schüler zum Thema „${str(topic, 120)}“. 4–6 Hauptäste, je 2–4 kurze Unterpunkte (max. 5 Wörter), sachlich richtig, auf Deutsch.
Antworte NUR mit JSON: { "thema": "kurz", "aeste": [ { "text": "Ast", "punkte": ["…", "…"] } ] }`;
  return normalizeMap(await generate({ system: 'Du bist JARVIS und hilfst beim Lernen. Kurz, korrekt, gut gegliedert.', prompt, maxTokens: 900 }), topic);
}

// Adds a point: to the branch whose name matches, otherwise as a new branch.
export function extendMap(map, text, branch = '') {
  const m = normalizeMap(map, map?.thema);
  const t = str(text, 48);
  if (!t) return m;
  const target = branch && m.aeste.find((b) => b.text.toLowerCase().includes(String(branch).toLowerCase()));
  if (target) { if (target.kinder.length < 6) target.kinder.push(t); }
  else if (m.aeste.length < 8) m.aeste.push({ text: t, kinder: [] });
  return m;
}
