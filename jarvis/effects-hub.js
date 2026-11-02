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
  effect_control: 'Kamera/Mikro-Effekte: {action: klinge („Energieklinge an“) | hologramm („Hologramm-Nachricht aufnehmen“) | stimme („Roboterstimme/Helm-Stimme“) | repulsor („Repulsor an“) | gesten („Gesten an“) | teleport („Teleportier mich“) | zurueck („Zurück!“ nach Teleport) | aus („Effekt aus“, „Kamera aus“)}.',
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
  self_destruct: 'Spaß-Prank „Selbstzerstörung aktivieren“ → {action: start|abbrechen}. Verrate den Spaß erst am Ende.',
  ufo_prank: 'Spaß-Prank „UFO-Alarm“ → {}. Verrate den Spaß nicht vorher.',
  random_toss: '„Wirf eine Münze“, „Würfel“ → {kind: muenze|wuerfel, count?}; sag das gelieferte Ergebnis.',
  day_recap: '„Was haben wir heute gemacht?“ → {}.',
  satellite_zoom: '„Zoom auf mich“ → {}.',
  level_status: '„Welches Level bist du?“ → {}.'
};
export const EFFECT_TOOLS = new Set(Object.keys(EFFECTS));

export function effectFunction(cloudTools) {
  const names = cloudTools.map((t) => t.name).filter((n) => EFFECT_TOOLS.has(n));
  return {
    name: EFFECT_FUNCTION,
    description: `Startet Jarvis' Show-, Anzug-, Kamera-, Spiel- und Animationsfunktionen. Wähle die passende Funktion als "name" und gib ihre Angaben in "args". Funktionen:\n${names.map((n) => `- ${n}: ${EFFECTS[n]}`).join('\n')}`,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: names, description: 'Welche Funktion' },
        args: { type: 'object', description: 'Angaben für diese Funktion (siehe Liste), z. B. {"action":"anziehen"}', additionalProperties: true }
      },
      required: ['name']
    }
  };
}

// Turns a jarvis_effekt call into the real tool name + arguments.
export function unwrapEffect(name, args) {
  if (name !== EFFECT_FUNCTION) return { name, args };
  const inner = String(args?.name || '');
  const innerArgs = args?.args && typeof args.args === 'object' ? args.args : typeof args?.args === 'string' ? (() => { try { return JSON.parse(args.args); } catch { return {}; } })() : {};
  // only the listed show features can be reached this way – never mail, calls etc.
  return EFFECT_TOOLS.has(inner) ? { name: inner, args: innerArgs } : { name: EFFECT_FUNCTION, args: innerArgs, unknown: true };
}
