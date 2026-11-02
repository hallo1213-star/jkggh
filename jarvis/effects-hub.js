// The voice AI behind Deepgram (OpenAI) accepts at most 128 functions. All the
// show/animation features therefore share ONE function, "jarvis_effekt": it
// names the feature and passes its arguments; the server runs the real tool.
export const EFFECT_FUNCTION = 'jarvis_effekt';

// feature → when to use it (spoken triggers) – kept short on purpose
export const EFFECTS = {
  business_mode: '„Starte den Business-Modus“, „Erstelle mir ein Business (mit X € Startkapital)“ → args {idea?, budget?}. Danach anbieten, die Website zu bauen (studio_website). Zahlen sind Schätzungen.',
  app_factory: '„Bau mir in 60 Sekunden eine App/ein Spiel für …“ → {description}. Änderungen danach mit create_project edit.',
  suit_design: '„Designe dir einen (Iron-Man-)Anzug …“ → {description?}. Danach IMMER fragen: „Soll ich den für mich benutzen?“',
  suit_control: 'Anzug: {action: uebernehmen (nach „Ja“) | anziehen („Zieh deinen Anzug an“) | rufen („Anzug zu mir!“) | ausziehen | status}. Im Anzug redest du normal weiter.',
  suit_fly: '„Flieg nach …“ (nur im Anzug) → {place}.',
  face_control: 'Gesicht: {action: zeigen („Zeig dein Gesicht“) | verstecken („Gesicht weg“) | neu}.',
  persona_mode: '„Friday-Modus“, „Party-Jarvis“, „Butler-Modus“, „Normaler Modus“ → {mode: friday|party|butler|normal}; danach sprichst du in diesem Stil.',
  digital_reality: 'Digitale Realität: {action: oeffnen („Öffne deine eigene Realität“, „Zeig mir deine Welt“, „Öffne das digitale Universum“) | portal („Öffne das Portal“) | stadt („Aktiviere die Stadt“) | stadt_aus | umgebung („Ändere die Umgebung“) | zurueck („Kehre zurück“)}.',
  effect_control: 'Kamera/Mikro-Effekte: {action: menu („Schalte die Kamera an“ ohne bestimmten Effekt → Auswahl) | klinge („Energieklinge an“) | hologramm („Hologramm-Nachricht aufnehmen“) | stimme („Roboterstimme/Helm-Stimme“) | repulsor („Repulsor an“) | gesten („Gesten an“) | teleport („Teleportier mich“) | zurueck („Zurück!“ nach Teleport) | anzug_ar („Zieh MIR den Anzug an“) | laser („Laser-Augen“) | cyborg („Mach mich zum Cyborg“) | upgrade („Upgrade!“) | malen („In die Luft malen“) | klon („Klon mich“) | zeitlupe („Matrix-Moment!“) | aus („Effekt aus“, „Kamera aus“)}.',
  helmet_mirror: '„Setz mir einen Helm auf“ → {action: an | visier („Visier auf/zu“) | aus („Helm ab“)}.',
  movie_poster: '„Mach ein Kinoplakat von mir“ → {title?, tagline?}.',
  drone_control: 'Drohne: {action: start | news („hol mir die Nachrichten“) | stopp („Drohne lande“)}.',
  appointment_rocket: '„Zeig meinen nächsten Termin als Rakete“ → {title?}.',
  shield: '„Schild hoch/runter“ (Fokus) → {action: hoch|runter, minutes?}.',
  radio_show: '„Starte Jarvis-Radio“ → {action: start|stopp}; danach moderierst du die gelieferten Meldungen.',
  gift_box: '„Was schenke ich …?“ → {recipient?, occasion?, budget?, interests?}.',
  mindmap: 'Gedanken-Karte: {action: neu, topic} („Mach mir eine Gedanken-Karte zu …“) | {action: erweitern, text, branch?} („Füg … hinzu“).',
  fireworks: '„Feuerwerk!“, „Schreib meinen Namen ins Feuerwerk“ → {text?}.',
  gravity: '„Schwerkraft an/aus“ → {action: an|aus}.',
  black_hole: '„Öffne ein schwarzes Loch“ → {}.',
  time_capsule: 'Zeitkapsel: {action: neu, text (wörtlich), days?} („Nachricht für mein zukünftiges Ich …“) | {action: zeigen}.',
  treasure_hunt: '„Starte eine Schatzsuche“ → {action: start|zeigen|stopp}.',
  holo_chess: '„Spiel Schach mit mir“ → {level?: leicht|mittel|schwer}.',
  secret_code: '„Verschlüssel eine Nachricht“ → {action: verschluesseln|entschluesseln, text?}. Codewort tippt er selbst.',
  escape_room: '„Starte einen Escape-Room“ → {action: start|tipp („Gib mir einen Tipp“)|stopp}.',
  self_destruct: 'Spaß-Prank „Selbstzerstörung aktivieren“ → {action: start|abbrechen}. Verrate den Spaß erst am Ende.',
  ufo_prank: 'Spaß-Prank „UFO-Alarm“ → {}. Verrate den Spaß nicht vorher.',
  random_toss: '„Wirf eine Münze“, „Würfel“ → {kind: muenze|wuerfel, count?}; sag das gelieferte Ergebnis.',
  day_recap: '„Was haben wir heute gemacht?“ → {}.',
  satellite_zoom: '„Zoom auf mich“ → {}.',
  level_status: '„Welches Level bist du?“ → {}.'
};
export const EFFECT_TOOLS = new Set(Object.keys(EFFECTS));

// Three bundles, each with its own short list (function descriptions ≤ 1024 chars).
export const GROUPS = {
  jarvis_anzug_welt: { title: 'Anzug, Gesicht, Modi, eigene Welt, Business, App-Fabrik, Level', tools: ['suit_design', 'suit_control', 'suit_fly', 'face_control', 'persona_mode', 'digital_reality', 'business_mode', 'app_factory', 'level_status', 'day_recap'] },
  jarvis_kamera: { title: 'Kamera-/Mikrofon-Effekte, Helm, Kinoplakat, Drohne, Satellit, Schatzsuche', tools: ['effect_control', 'helmet_mirror', 'movie_poster', 'drone_control', 'satellite_zoom', 'treasure_hunt'] },
  jarvis_show: { title: 'Show, Spiele und Spaß', tools: ['fireworks', 'gravity', 'black_hole', 'mindmap', 'time_capsule', 'holo_chess', 'secret_code', 'escape_room', 'appointment_rocket', 'shield', 'radio_show', 'gift_box', 'random_toss', 'self_destruct', 'ufo_prank'] }
};
export const GROUP_NAMES = new Set(Object.keys(GROUPS));

export function effectFunctions(cloudTools) {
  const have = new Set(cloudTools.map((t) => t.name));
  return Object.entries(GROUPS).map(([fn, g]) => {
    const names = g.tools.filter((n) => have.has(n));
    return {
      name: fn,
      description: `${g.title}. name = Funktion, args = Angaben:\n${names.map((n) => `${n}: ${SHORT_LIST[n]}`).join('\n')}`,
      parameters: { type: 'object', properties: { name: { type: 'string', enum: names }, args: { type: 'object', description: 'Angaben laut Liste, z. B. {"action":"anziehen"}', additionalProperties: true } }, required: ['name'] }
    };
  });
}
export const effectFunction = (cloudTools) => effectFunctions(cloudTools)[0];

// Turns a bundle call into the real tool name + arguments. Forgiving: the AI
// sometimes picks the wrong bundle or names the effect instead of the tool
// ("malen" instead of effect_control) – any listed show feature is accepted,
// but never anything else (mail, calls etc. stay unreachable).
const CAMERA_ACTIONS = ['menu', 'repulsor', 'gesten', 'teleport', 'zurueck', 'klinge', 'hologramm', 'stimme', 'anzug_ar', 'laser', 'cyborg', 'upgrade', 'malen', 'klon', 'zeitlupe'];
const ALIASES = {
  luft_malen: ['effect_control', { action: 'malen' }], luftmalen: ['effect_control', { action: 'malen' }], air_draw: ['effect_control', { action: 'malen' }], zeichnen: ['effect_control', { action: 'malen' }],
  laser_augen: ['effect_control', { action: 'laser' }], laseraugen: ['effect_control', { action: 'laser' }],
  matrix: ['effect_control', { action: 'zeitlupe' }], matrix_moment: ['effect_control', { action: 'zeitlupe' }], slowmo: ['effect_control', { action: 'zeitlupe' }],
  klone: ['effect_control', { action: 'klon' }], klonen: ['effect_control', { action: 'klon' }],
  anzug: ['effect_control', { action: 'anzug_ar' }], anzug_auf_mir: ['effect_control', { action: 'anzug_ar' }], energieklinge: ['effect_control', { action: 'klinge' }],
  geheimcode: ['secret_code', { action: 'verschluesseln' }], geheimagent: ['secret_code', { action: 'verschluesseln' }], verschluesseln: ['secret_code', { action: 'verschluesseln' }], entschluesseln: ['secret_code', { action: 'entschluesseln' }],
  escape: ['escape_room', { action: 'start' }], escaperoom: ['escape_room', { action: 'start' }], tipp: ['escape_room', { action: 'tipp' }],
  kamera: ['effect_control', { action: 'menu' }], kamera_an: ['effect_control', { action: 'menu' }], camera: ['effect_control', { action: 'menu' }], kamera_effekte: ['effect_control', { action: 'menu' }], effekte: ['effect_control', { action: 'menu' }], auswahl: ['effect_control', { action: 'menu' }],
  schach: ['holo_chess', {}], feuerwerk: ['fireworks', {}], schwarzes_loch: ['black_hole', {}], schatzsuche: ['treasure_hunt', { action: 'start' }]
};
const norm = (x) => String(x || '').trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[\s-]+/g, '_');
export function unwrapEffect(name, args) {
  if (name !== EFFECT_FUNCTION && !GROUP_NAMES.has(name)) return { name, args };
  let innerArgs = args?.args && typeof args.args === 'object' ? args.args : typeof args?.args === 'string' ? (() => { try { return JSON.parse(args.args); } catch { return {}; } })() : null;
  if (!innerArgs) { const { name: _n, args: _a, ...rest } = args || {}; innerArgs = rest; }
  const inner = norm(args?.name);
  if (EFFECT_TOOLS.has(inner)) return { name: inner, args: innerArgs };
  if (CAMERA_ACTIONS.includes(inner)) return { name: 'effect_control', args: { ...innerArgs, action: inner } };
  if (ALIASES[inner]) return { name: ALIASES[inner][0], args: { ...ALIASES[inner][1], ...innerArgs } };
  const act = norm(innerArgs.action);
  if (!inner && CAMERA_ACTIONS.includes(act)) return { name: 'effect_control', args: { ...innerArgs, action: act } };
  // camera bundle with nothing recognisable ("Schalte die Kamera an") → effect picker
  if (name === 'jarvis_kamera' && !EFFECT_TOOLS.has(inner)) return { name: 'effect_control', args: { action: 'menu' }, guessed: true };
  return { name, args: innerArgs, unknown: true };
}

// The detailed list goes into the system prompt (function descriptions may
// have at most 1024 characters).
const SHORT_LIST = {
  business_mode: 'Business erstellen {idea?, budget?} – danach Website anbieten',
  app_factory: 'App in 60 s bauen {description}',
  suit_design: 'Anzug entwerfen {description?} – danach fragen, ob du ihn benutzen sollst',
  suit_control: 'Anzug {action: uebernehmen|anziehen|rufen („Anzug zu mir“)|ausziehen|status}',
  suit_fly: 'im Anzug fliegen {place}',
  face_control: 'Gesicht {action: zeigen|verstecken|neu}',
  persona_mode: 'Modus {mode: friday|party|butler|normal}',
  digital_reality: 'Digitale Realität/eigene Welt {action: oeffnen|portal|stadt|stadt_aus|umgebung|zurueck}',
  effect_control: 'Kamera/Mikro {action: menu (Auswahl, z. B. „Kamera an“)|klinge|hologramm|stimme (Roboterstimme)|repulsor|gesten|teleport|zurueck|anzug_ar (Anzug auf MEINEN Körper)|laser (Laser-Augen)|cyborg|upgrade|malen (Luft-Malen)|klon|zeitlupe (Matrix-Moment)|aus}',
  helmet_mirror: 'Helm auf meinen Kopf {action: an|visier|aus}',
  movie_poster: 'Kinoplakat von mir {title?}',
  drone_control: 'Drohne {action: start|news|stopp}',
  appointment_rocket: 'nächster Termin als Rakete {}',
  shield: 'Schutzschild/Fokus {action: hoch|runter, minutes?}',
  radio_show: 'Jarvis-Radio {action: start|stopp} – danach Meldungen moderieren',
  gift_box: 'Geschenkideen {recipient?, occasion?, budget?}',
  mindmap: 'Gedanken-Karte {action: neu, topic} | {action: erweitern, text, branch?}',
  fireworks: 'Feuerwerk {text? = Name im Finale}',
  gravity: 'Schwerkraft {action: an|aus}',
  black_hole: 'schwarzes Loch {}',
  time_capsule: 'Zeitkapsel {action: neu, text, days?} | {action: zeigen}',
  treasure_hunt: 'Schatzsuche {action: start|zeigen|stopp}',
  holo_chess: 'Schach {level?: leicht|mittel|schwer}',
  secret_code: 'Geheimcode {action: verschluesseln|entschluesseln, text?} – Codewort NIE erfragen',
  escape_room: 'Escape-Room {action: start|tipp|stopp}',
  self_destruct: 'Prank Selbstzerstörung {action: start|abbrechen}',
  ufo_prank: 'Prank UFO-Alarm {}',
  random_toss: 'Münze/Würfel {kind: muenze|wuerfel, count?} – Ergebnis sagen',
  day_recap: 'Tagesrückblick {}',
  satellite_zoom: 'Satellit zoomt auf mich {}',
  level_status: 'Jarvis-Level {}'
};
export function effectsGuide() {
  return `Effekte (über jarvis_effekt, name {args}):\n${Object.keys(EFFECTS).map((n) => `- ${n}: ${SHORT_LIST[n] || EFFECTS[n]}`).join('\n')}`;
}
