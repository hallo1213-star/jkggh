// Holo-Katze – state only (pure functions, also used by the tests).
export const STAGES = [{ key: 'baby', name: 'Kätzchen', xp: 0 }, { key: 'kind', name: 'Junge Katze', xp: 60 }, { key: 'gross', name: 'Erwachsene Katze', xp: 180 }];
export const FURS = {
  rot: { name: 'Rot getigert', base: '#d9822b', light: '#f3b46a', dark: '#9a4e14', stripes: true, belly: '#f6e2c4' },
  grau: { name: 'Grau getigert', base: '#8d8a86', light: '#c4c0ba', dark: '#4d4a47', stripes: true, belly: '#ece8e2' },
  schwarz: { name: 'Schwarz-weiß', base: '#2b2725', light: '#4a4441', dark: '#121010', stripes: false, belly: '#f4f1ec' }
};
export const FOODS = {
  milch: { name: 'Milch', hunger: 20, fun: 3, xp: 4 },
  trocken: { name: 'Trockenfutter', hunger: 35, fun: 0, xp: 6 },
  fisch: { name: 'Fisch-Leckerli', hunger: 15, fun: 10, xp: 8 }
};
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
export const isNight = (d = new Date()) => d.getHours() >= 22 || d.getHours() < 7;
export function newPet(now = Date.now()) { return { kind: 'katze', name: '', born: now, hatched: false, fur: 'rot', xp: 0, hunger: 20, fun: 80, energy: 90, last: now, wokeAt: 0, catches: 0, pets: 0 }; }
// older pets (robot version) keep name and progress, but become a cat
export function migrate(p) { return p && p.kind !== 'katze' ? { ...newPet(p.born), ...p, kind: 'katze', fur: p.fur || 'rot' } : p; }
export function stageOf(p) { return [...STAGES].reverse().find((s) => p.xp >= s.xp) || STAGES[0]; }
// time passes: hunger +1 every 12 min, fun −1 every 15 min; sleeping refills energy
export function tick(p, now = Date.now()) {
  const min = Math.max(0, (now - p.last) / 60000);
  const asleep = isNight(new Date(now)) && now - (p.wokeAt || 0) > 30 * 60000;
  return { ...p, hunger: clamp(p.hunger + min / 12), fun: clamp(p.fun - min / 15), energy: clamp(p.energy + (asleep ? min / 4 : -min / 30)), last: now };
}
export function act(p, action, { name = '', food = 'trocken', fur = '', now = Date.now() } = {}) {
  const q = tick(p, now);
  if (action === 'fuettern') { const f = FOODS[food] || FOODS.trocken; return { ...q, hunger: clamp(q.hunger - f.hunger), fun: clamp(q.fun + f.fun), xp: q.xp + (q.hunger > 15 ? f.xp : 1) }; }
  if (action === 'treffer') return q.energy < 8 ? q : { ...q, fun: clamp(q.fun + 4), energy: clamp(q.energy - 2), hunger: clamp(q.hunger + 0.5), xp: q.xp + 2, catches: (q.catches || 0) + 1 };
  if (action === 'spielen') return q.energy < 15 ? q : { ...q, fun: clamp(q.fun + 25), energy: clamp(q.energy - 10), hunger: clamp(q.hunger + 4), xp: q.xp + 8 };
  if (action === 'strich') return { ...q, fun: clamp(q.fun + 1.5), xp: q.xp + 0.5, pets: (q.pets || 0) + 1 };
  if (action === 'streicheln') return { ...q, fun: clamp(q.fun + 12), xp: q.xp + 4 };
  if (action === 'aufwecken') return { ...q, wokeAt: now };
  if (action === 'schlafen') return { ...q, wokeAt: 0, energy: clamp(q.energy + 10) };
  if (action === 'name' && name) return { ...q, name: String(name).replace(/[<>]/g, '').trim().slice(0, 20) };
  if (action === 'fell' && FURS[fur]) return { ...q, fur };
  return q;
}
export function asleep(p, now = Date.now()) { return isNight(new Date(now)) && now - (p.wokeAt || 0) > 30 * 60000; }
export function mood(p, now = Date.now()) {
  if (asleep(p, now)) return 'schlaeft';
  if (p.hunger >= 70) return 'hungrig';
  if (p.energy <= 15) return 'muede';
  if (p.fun <= 30) return 'langweilig';
  return 'gluecklich';
}
export const MOODS = { schlaeft: 'schläft 💤', hungrig: 'hat Hunger', muede: 'ist müde', langweilig: 'langweilt sich', gluecklich: 'ist glücklich' };
export function summary(p, now = Date.now()) {
  const s = stageOf(p); const next = STAGES[STAGES.indexOf(s) + 1];
  return { type: 'pet_state', exists: true, art: 'Katze', hatched: p.hatched, name: p.name || null, fell: FURS[p.fur]?.name || null, stufe: s.name, xp: Math.round(p.xp), naechsteStufeBei: next ? next.xp : null, hunger: Math.round(p.hunger), spass: Math.round(p.fun), energie: Math.round(p.energy), stimmung: MOODS[mood(p, now)], tage: Math.floor((now - p.born) / 86400000) };
}
