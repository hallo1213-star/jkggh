// TikTok-Modus: "Jarvis, ich nehme gerade ein TikTok auf" – Jarvis stellt
// sich in einer animierten Show vor. The script is built from the functions
// that really exist (nothing invented); the browser plays the scenes and asks
// the server to speak each line when the previous one has finished.
import { buildSystems } from './systems-map.js';

const has = (tools, ...names) => names.every((n) => tools.includes(n));

export function buildShow(info) {
  const tools = info.tools || [];
  const sys = buildSystems(info);
  const total = sys.total;
  const scenes = [];
  scenes.push({ key: 'intro', title: 'J.A.R.V.I.S.', line: 'Hallo TikTok! Ich bin Jarvis – ein persönlicher KI-Assistent. Ich höre zu, denke mit und erledige Dinge, nur mit der Stimme.' });
  scenes.push({ key: 'wesen', title: 'WER BIN ICH?', words: ['SCHNELL', 'FRECH', 'EHRLICH'], line: 'Ich bin schnell, ein bisschen frech und immer ehrlich. Ich erfinde nichts – und wenn ich etwas nicht kann, sage ich es dir.' });
  const control = [has(tools, 'iphone_control') ? 'dein iPhone' : null, info.laptopTools ? 'deinen Laptop' : null].filter(Boolean);
  scenes.push({ key: 'systeme', title: `${total} FUNKTIONEN`, total, modules: sys.modules.map((m) => ({ icon: m.icon, title: m.title, count: m.count })), line: `Unter der Haube stecken ${total} Funktionen in ${sys.modules.length} Modulen – von Wissen und Planung${control.length ? ` bis zur Steuerung für ${control.join(' und ')}` : ''}.` });
  const make = [has(tools, 'studio_website') ? { icon: '🌐', title: 'Websites', sub: 'mit Agentur-Design' } : null, has(tools, 'app_factory') ? { icon: '📱', title: 'Apps & Spiele', sub: 'in 60 Sekunden' } : null, has(tools, 'create_image') ? { icon: '🎨', title: 'Bilder', sub: 'auf Zuruf' } : null].filter(Boolean);
  if (make.length) scenes.push({ key: 'bauen', title: 'ICH BAUE FÜR DICH', cards: make, line: `Ich ${[has(tools, 'studio_website') ? 'baue Websites mit Agentur-Design' : null, has(tools, 'app_factory') ? 'programmiere Apps und Spiele in Sekunden' : null, has(tools, 'create_image') ? 'male Bilder auf Zuruf' : null].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' und $1')}.` });
  const show = [
    has(tools, 'suit_control') && { icon: '🦾', title: 'Iron-Man-Anzug', say: 'einen Iron-Man-Anzug' },
    has(tools, 'effect_control') && { icon: '👁️', title: 'Laser-Augen', say: 'Laser-Augen über die Kamera' },
    has(tools, 'fireworks') && { icon: '🎆', title: 'Feuerwerk', say: 'Feuerwerk' },
    has(tools, 'black_hole') && { icon: '🕳️', title: 'Schwarzes Loch', say: 'ein schwarzes Loch' },
    has(tools, 'globe') && { icon: '🌍', title: '3D-Globus', say: 'einen 3D-Globus' },
    has(tools, 'holo_pet') && { icon: '🐱', title: 'Holo-Katze', say: 'meine eigene Holo-Katze' }
  ].filter(Boolean);
  if (show.length) scenes.push({ key: 'show', title: 'UND ICH KANN SHOW', cards: show.map(({ icon, title }) => ({ icon, title })), line: `Und ich kann Show: ${show.map((s) => s.say).join(', ').replace(/, ([^,]*)$/, ' – und $1')}.` });
  scenes.push({ key: 'outro', title: 'FOLGT FÜR MEHR', line: 'Sag einfach: Jarvis – und ich lege los. Folgt für mehr!' });
  return { scenes: scenes.map((s) => ({ ...s, line: s.line.slice(0, 290) })), total, modules: sys.modules.length };
}
