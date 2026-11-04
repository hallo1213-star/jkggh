// TikTok-Modus: "Jarvis, ich nehme gerade ein TikTok/Video auf (Part 2 …)" –
// Jarvis stellt sich in einer animierten Show vor, als Serie in 5 Teilen.
// Every script is built from the functions that really exist (nothing
// invented); the browser plays the scenes and asks the server to speak each
// line when the previous one has finished.
import { buildSystems } from './systems-map.js';

export const PARTS = 5;
const has = (tools, ...names) => names.every((n) => tools.includes(n));
const list = (items, last = ' und ') => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')}${last}${items[items.length - 1]}`);
// only features that exist: [tool(s), icon, title, spoken phrase]
const pick = (tools, rows) => rows.filter(([need]) => has(tools, ...[].concat(need))).map(([, icon, title, say]) => ({ icon, title, say }));
const cards = (items) => items.map(({ icon, title, sub }) => ({ icon, title, ...(sub ? { sub } : {}) }));

function outro(part) {
  return part < PARTS
    ? { key: 'outro', title: `PART ${part + 1} KOMMT`, next: `PART ${part + 1}`, line: `Das war Part ${part}. In Part ${part + 1} zeige ich euch noch mehr – folgt, damit ihr ihn nicht verpasst!` }
    : { key: 'outro', title: 'DANKE FÜRS ZUSCHAUEN', line: 'Das war Part fünf – das große Finale. Sag einfach: Jarvis – und ich lege los. Folgt für mehr!' };
}
const intro = (part, line) => ({ key: 'intro', title: part > 1 ? `PART ${part}` : 'J.A.R.V.I.S.', part, line });

export function buildShow(info, partInput = 1) {
  const part = Math.max(1, Math.min(PARTS, Math.round(Number(partInput) || 1)));
  const tools = info.tools || [];
  const sys = buildSystems(info);
  const scenes = [];

  if (part === 1) {
    scenes.push(intro(1, 'Hallo TikTok! Ich bin Jarvis – ein persönlicher KI-Assistent. Ich höre zu, denke mit und erledige Dinge, nur mit der Stimme.'));
    scenes.push({ key: 'wesen', title: 'WER BIN ICH?', words: ['SCHNELL', 'FRECH', 'EHRLICH'], line: 'Ich bin schnell, ein bisschen frech und immer ehrlich. Ich erfinde nichts – und wenn ich etwas nicht kann, sage ich es dir.' });
    const control = [has(tools, 'iphone_control') ? 'dein iPhone' : null, info.laptopTools ? 'deinen Laptop' : null].filter(Boolean);
    scenes.push({ key: 'systeme', title: `${sys.total} FUNKTIONEN`, total: sys.total, modules: sys.modules.map((m) => ({ icon: m.icon, title: m.title, count: m.count })), line: `Unter der Haube stecken ${sys.total} Funktionen in ${sys.modules.length} Modulen – von Wissen und Planung${control.length ? ` bis zur Steuerung für ${list(control)}` : ''}.` });
    const make = pick(tools, [['studio_website', '🌐', 'Websites', 'baue Websites mit Agentur-Design'], ['app_factory', '📱', 'Apps & Spiele', 'programmiere Apps und Spiele in Sekunden'], ['create_image', '🎨', 'Bilder', 'male Bilder auf Zuruf']]);
    if (make.length) scenes.push({ key: 'bauen', title: 'ICH BAUE FÜR DICH', cards: cards(make.map((m, i) => ({ ...m, sub: ['mit Agentur-Design', 'in 60 Sekunden', 'auf Zuruf'][i] }))), line: `Ich ${list(make.map((m) => m.say))}.` });
    const show = pick(tools, [['suit_control', '🦾', 'Iron-Man-Anzug', 'einen Iron-Man-Anzug'], ['effect_control', '👁️', 'Laser-Augen', 'Laser-Augen über die Kamera'], ['fireworks', '🎆', 'Feuerwerk', 'Feuerwerk'], ['black_hole', '🕳️', 'Schwarzes Loch', 'ein schwarzes Loch'], ['globe', '🌍', '3D-Globus', 'einen 3D-Globus'], ['holo_pet', '🐱', 'Holo-Katze', 'meine eigene Holo-Katze']]);
    if (show.length) scenes.push({ key: 'show', title: 'UND ICH KANN SHOW', cards: cards(show), line: `Und ich kann Show: ${list(show.map((s) => s.say), ' – und ')}.` });
  }

  if (part === 2) {
    scenes.push(intro(2, `Willkommen zu Part zwei! Heute wird es filmreif: ${[has(tools, 'suit_control') ? 'mein Anzug' : null, has(tools, 'effect_control') ? 'meine Kamera-Effekte' : null].filter(Boolean).join(' und ') || 'meine Show-Effekte'}.`));
    const suit = pick(tools, [['suit_design', '🎨', 'Anzug-Design', 'ich entwerfe dir einen eigenen Anzug'], ['suit_control', '🦾', 'Anzug anziehen', 'ich ziehe ihn an oder rufe ihn zu mir'], ['suit_fly', '🚀', 'Flugmodus', 'im Anzug fliege ich los'], ['helmet_mirror', '🪖', 'Helm auf dich', 'ich setze dir den Helm auf']]);
    if (suit.length) scenes.push({ key: 'bauen', title: 'MEIN ANZUG', cards: cards(suit.slice(0, 3)), line: `${list(suit.map((s) => s.say)).replace(/^./, (c) => c.toUpperCase())}.` });
    const fx = has(tools, 'effect_control') ? [{ icon: '👁️', title: 'Laser-Augen', say: 'Laser-Augen' }, { icon: '🤖', title: 'Cyborg-Gesicht', say: 'ein Cyborg-Gesicht' }, { icon: '👥', title: 'Klone', say: 'Klone von dir' }, { icon: '⏱️', title: 'Matrix-Moment', say: 'einen Matrix-Moment in Zeitlupe' }, { icon: '⚔️', title: 'Energieklinge', say: 'eine Energieklinge in deiner Faust' }, { icon: '✨', title: 'Teleport', say: 'und einen Teleport' }] : [];
    if (fx.length) scenes.push({ key: 'show', title: 'KAMERA-EFFEKTE', cards: cards(fx), line: `Mit deiner Kamera gibt es ${list(fx.map((f) => f.say), ' ')} – alles läuft nur auf deinem Gerät.` });
    const extra = pick(tools, [['movie_poster', '🎬', 'Kinoplakat', 'ein Kinoplakat mit dir in der Hauptrolle'], ['name_hologram', '✨', '3D-Hologramm', 'deinen Namen als 3D-Hologramm'], ['digital_reality', '🌌', 'Eigene Welt', 'meine eigene digitale Welt']]);
    if (extra.length) scenes.push({ key: 'wesen', title: 'UND DAZU', words: extra.slice(0, 3).map((e) => e.title.toUpperCase()), line: `Dazu ${list(extra.map((e) => e.say))}.` });
  }

  if (part === 3) {
    scenes.push(intro(3, 'Part drei! Jetzt zeige ich, wie ich deinen Alltag erledige – ganz ohne Tippen.'));
    const plan = pick(tools, [['memory_save', '🧠', 'Gedächtnis', 'ich merke mir, was dir wichtig ist'], ['reminder_add', '⏰', 'Erinnerungen', 'erinnere dich an alles'], ['appointment_add', '🗓️', 'Termine', 'trage Termine ein'], ['shopping_list_add', '🛒', 'Einkaufsliste', 'führe deine Einkaufsliste']]);
    if (plan.length) scenes.push({ key: 'show', title: 'ICH ORGANISIERE', cards: cards(plan), line: `${list(plan.map((p) => p.say)).replace(/^./, (c) => c.toUpperCase())}.` });
    const info2 = pick(tools, [['get_weather', '🌦️', 'Wetter', 'dem Wetter'], ['get_news', '📰', 'Nachrichten', 'den Nachrichten'], ['translate', '🌐', 'Übersetzen', 'Übersetzungen'], ['route_plan', '🗺️', 'Routen', 'Routen']]);
    if (info2.length) scenes.push({ key: 'wesen', title: 'ICH WEISS BESCHEID', words: info2.slice(0, 3).map((i) => i.title.toUpperCase()), line: `Frag mich nach ${list(info2.map((i) => i.say))} – ich antworte sofort.` });
    const ctrl = pick(tools, [['email_send', '✉️', 'E-Mails', 'E-Mails'], ['telegram_send', '💬', 'Telegram', 'Telegram-Nachrichten'], ['iphone_control', '📱', 'iPhone', 'Apps auf deinem iPhone']]);
    if (info.laptopTools) ctrl.push({ icon: '💻', title: 'Laptop', say: 'deinen Laptop' });
    if (ctrl.length) scenes.push({ key: 'bauen', title: 'ICH STEUERE', cards: cards(ctrl.slice(0, 3)), line: `Und ich steuere ${list(ctrl.map((c) => c.say))} – Wichtiges bestätigst du natürlich selbst.` });
  }

  if (part === 4) {
    scenes.push(intro(4, 'Part vier – jetzt wird gebaut! Ich erschaffe Dinge, für die andere Tage brauchen.'));
    const web = pick(tools, [['studio_website', '🌐', 'Websites', 'baue komplette Websites und Online-Shops'], ['app_factory', '📱', 'App-Fabrik', 'programmiere Apps in sechzig Sekunden'], ['create_game', '🎮', 'Spiele', 'erfinde spielbare Spiele']]);
    if (web.length) scenes.push({ key: 'bauen', title: 'ICH PROGRAMMIERE', cards: cards(web.map((w, i) => ({ ...w, sub: ['mit Qualitäts-Test', 'in 60 Sekunden', 'sofort spielbar'][i] }))), line: `Ich ${list(web.map((w) => w.say))}.` });
    const art = pick(tools, [['create_image', '🎨', 'Bilder', 'Bilder'], ['design_graphic', '🖼️', 'Logos', 'Logos'], ['create_video', '🎥', 'Videos', 'Videos'], ['create_3d_model', '🧊', '3D-Modelle', '3D-Modelle']]);
    if (art.length) scenes.push({ key: 'show', title: 'ICH ERSCHAFFE', cards: cards(art), line: `Dazu erschaffe ich ${list(art.map((a) => a.say))}.` });
    if (has(tools, 'business_mode')) scenes.push({ key: 'wesen', title: 'BUSINESS-MODUS', words: ['IDEE', 'MARKE', 'PLAN'], line: 'Und im Business-Modus entwickle ich mit dir eine Geschäftsidee – mit Marke, Produkten und Plan.' });
  }

  if (part === 5) {
    scenes.push(intro(5, 'Part fünf – das große Finale! Willkommen in meiner Welt.'));
    const world = pick(tools, [['digital_reality', '🌌', 'Digitale Welt', 'meine eigene digitale Welt'], ['globe', '🌍', '3D-Globus', 'einen 3D-Globus mit echten Satellitenbildern'], ['iss_live', '🛰️', 'ISS live', 'die Raumstation live']]);
    if (world.length) scenes.push({ key: 'bauen', title: 'MEINE WELT', cards: cards(world), line: `Ich zeige dir ${list(world.map((w) => w.say))}.` });
    const games = pick(tools, [['holo_chess', '♟️', 'Holo-Schach', 'Holo-Schach'], ['escape_room', '🔐', 'Escape-Room', 'einen Escape-Room'], ['secret_code', '🕵️', 'Geheimcode', 'Geheimcodes für deine Freunde'], ['quiz', '❓', 'Quiz', 'Quizze']]);
    if (games.length) scenes.push({ key: 'show', title: 'SPIEL MIT MIR', cards: cards(games), line: `Wir spielen ${list(games.map((g) => g.say))}.` });
    const finale = pick(tools, [['holo_pet', '🐱', 'Holo-Katze', 'meine Holo-Katze'], ['fireworks', '🎆', 'Feuerwerk', 'ein Feuerwerk'], ['black_hole', '🕳️', 'Schwarzes Loch', 'ein schwarzes Loch']]);
    if (finale.length) scenes.push({ key: 'show', title: 'GROSSES FINALE', cards: cards(finale), line: `Und zum Schluss: ${list(finale.map((f) => f.say), ' – und ')}!` });
    scenes.push({ key: 'systeme', title: `${sys.total} FUNKTIONEN`, total: sys.total, modules: sys.modules.map((m) => ({ icon: m.icon, title: m.title, count: m.count })), line: `${sys.total} Funktionen – und jeden Tag werden es mehr.` });
  }

  scenes.push(outro(part));
  return { part, scenes: scenes.map((s) => ({ ...s, line: s.line.slice(0, 290) })), total: sys.total, modules: sys.modules.length };
}
