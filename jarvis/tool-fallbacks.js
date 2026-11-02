// When a tool fails, Jarvis gets a concrete next step instead of guessing:
// which other tool can reach the goal, or what the user has to set up.
// Only tools that really exist are suggested (checked against the tool list).
const BY_TOOL = {
  globe: ['get_weather', 'wiki_lookup', 'find_webcams'],
  weather_show: ['get_weather'],
  get_weather: ['web_search'],
  get_news: ['news_region', 'web_search'],
  news_region: ['get_news'],
  wiki_lookup: ['web_search'],
  transit: ['route_plan', 'web_search'],
  route_plan: ['transit', 'web_search'],
  studio_website: ['create_website', 'create_project'],
  create_project: ['studio_website'],
  create_3d_model: ['create_image'],
  design_graphic: ['create_image'],
  create_image: ['design_graphic'],
  show_chart: ['markets'],
  markets: ['show_chart', 'get_news'],
  summarize_url: ['web_search'],
  football: ['web_search'],
  recipe: ['web_search'],
  translate: [],
  holidays: ['web_search'],
  currency: ['calculate'],
  camera_look: [],
  find_webcams: ['globe']
};

const BY_ERROR = [
  [/Limit erreicht|rate limit|429/i, 'Das kostenlose KI-Kontingent ist kurz ausgelastet. Sag ihm das ehrlich und biete an, es in etwa einer Minute noch einmal zu versuchen.'],
  [/GROQ_API_KEY|KI-Schlüssel|MISSING_KEY|kein Bild-Modell/i, 'Dafür fehlt ein KI-Schlüssel bei Render (GROQ_API_KEY, kostenlos). Erkläre das kurz.'],
  [/nicht eingerichtet|fehlt .*bei Render|TOKEN|API_KEY/i, 'Diese Funktion ist noch nicht eingerichtet. Nenne kurz, was bei Render eingetragen werden muss (steht im Fehler).'],
  [/Laptop/i, 'Der Laptop ist nicht verbunden. Biete an, es zu erledigen, sobald er an ist, oder nutze eine Cloud-Alternative.'],
  [/nicht gefunden|keinen Ort|Ich finde keine/i, 'Frag nach einer genaueren Angabe (z. B. Ort mit Stadt) und versuche es dann erneut.'],
  [/Status 5\d\d|nicht erreichbar|timeout|Zeitlimit|fetch failed/i, 'Der externe Dienst antwortet gerade nicht. Versuche einmal eine Alternative; klappt das auch nicht, sag es ehrlich.']
];

export function fallbackFor(tool, error, available = () => true) {
  const message = String(error || '');
  const advice = BY_ERROR.find(([re]) => re.test(message))?.[1] || '';
  const alternatives = (BY_TOOL[tool] || []).filter((name) => name !== tool && available(name));
  if (!advice && !alternatives.length) return null;
  return {
    alternativen: alternatives.length ? alternatives : undefined,
    naechsterSchritt: advice || `Versuche das Ziel mit ${alternatives.join(' oder ')} zu erreichen, falls das sinnvoll ist. Sag dem Nutzer ehrlich, dass der erste Weg nicht geklappt hat.`
  };
}
