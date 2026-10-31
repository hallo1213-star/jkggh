// Live information from free public sources without API keys: weather
// (Open-Meteo), news headlines (tagesschau RSS) and encyclopedia summaries
// (Wikipedia). `fetchImpl` can be replaced in tests.
const TIMEOUT_MS = 8000;
const USER_AGENT = 'Jarvis-Assistant/1.0 (private voice assistant)';

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Der Dienst antwortet mit Status ${response.status}.`);
  return response.json();
}

// --- Weather -----------------------------------------------------------------

const WEATHER_CODES = {
  0: ['klar', '☀️'], 1: ['überwiegend klar', '🌤️'], 2: ['teilweise bewölkt', '⛅'], 3: ['bedeckt', '☁️'],
  45: ['neblig', '🌫️'], 48: ['neblig mit Reif', '🌫️'],
  51: ['leichter Nieselregen', '🌦️'], 53: ['Nieselregen', '🌦️'], 55: ['starker Nieselregen', '🌧️'],
  56: ['gefrierender Nieselregen', '🌧️'], 57: ['gefrierender Nieselregen', '🌧️'],
  61: ['leichter Regen', '🌦️'], 63: ['Regen', '🌧️'], 65: ['starker Regen', '🌧️'],
  66: ['gefrierender Regen', '🌧️'], 67: ['gefrierender Regen', '🌧️'],
  71: ['leichter Schneefall', '🌨️'], 73: ['Schneefall', '🌨️'], 75: ['starker Schneefall', '❄️'], 77: ['Schneegriesel', '🌨️'],
  80: ['leichte Regenschauer', '🌦️'], 81: ['Regenschauer', '🌧️'], 82: ['heftige Regenschauer', '⛈️'],
  85: ['Schneeschauer', '🌨️'], 86: ['starke Schneeschauer', '❄️'],
  95: ['Gewitter', '⛈️'], 96: ['Gewitter mit Hagel', '⛈️'], 99: ['schweres Gewitter mit Hagel', '⛈️']
};

export function describeWeather(code) {
  const [text, icon] = WEATHER_CODES[code] || ['wechselhaft', '🌡️'];
  return { text, icon };
}

export async function getWeather(place, { fetchImpl = fetch, days = 3 } = {}) {
  const name = String(place ?? '').trim().slice(0, 80);
  if (!name) throw new Error('Für welchen Ort? Sag mir die Stadt (oder ich merke mir deinen Wohnort).');
  const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=de&format=json`, fetchImpl);
  const location = geo.results?.[0];
  if (!location) throw new Error(`Ich habe keinen Ort namens „${name}“ gefunden.`);
  const count = Math.min(Math.max(Number(days) || 3, 1), 7);
  const forecast = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    `&timezone=Europe%2FBerlin&forecast_days=${count}`,
    fetchImpl
  );
  const current = forecast.current || {};
  const daily = forecast.daily || {};
  const round = (value) => (typeof value === 'number' ? Math.round(value) : null);
  return {
    ort: [location.name, location.admin1, location.country].filter(Boolean).filter((part, i, all) => all.indexOf(part) === i).join(', '),
    jetzt: {
      temperatur: round(current.temperature_2m),
      gefuehlt: round(current.apparent_temperature),
      wetter: describeWeather(current.weather_code).text,
      symbol: describeWeather(current.weather_code).icon,
      windKmh: round(current.wind_speed_10m),
      niederschlagMm: current.precipitation ?? null
    },
    tage: (daily.time || []).slice(0, count).map((date, i) => ({
      datum: date,
      tag: new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' }),
      wetter: describeWeather(daily.weather_code?.[i]).text,
      symbol: describeWeather(daily.weather_code?.[i]).icon,
      max: round(daily.temperature_2m_max?.[i]),
      min: round(daily.temperature_2m_min?.[i]),
      regenWahrscheinlichkeit: round(daily.precipitation_probability_max?.[i])
    })),
    quelle: 'Open-Meteo'
  };
}

// --- News --------------------------------------------------------------------

const NEWS_FEEDS = [
  'https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml',
  'https://www.tagesschau.de/xml/rss2/'
];

function decodeEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseRss(xml, limit = 8) {
  const items = [];
  for (const match of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const field = (name) => {
      const found = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(match[1]);
      return found ? decodeEntities(found[1]) : '';
    };
    const title = field('title');
    const link = field('link');
    if (!title) continue;
    items.push({ titel: title.slice(0, 200), kurz: field('description').slice(0, 300), link: /^https:\/\//.test(link) ? link : '' });
    if (items.length >= limit) break;
  }
  return items;
}

export async function getNews({ fetchImpl = fetch, limit = 6 } = {}) {
  let lastError;
  for (const url of NEWS_FEEDS) {
    try {
      const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const items = parseRss(await response.text(), Math.min(Math.max(Number(limit) || 6, 1), 10));
      if (items.length) return { quelle: 'tagesschau.de', meldungen: items };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Die Nachrichten sind gerade nicht erreichbar${lastError ? ` (${lastError.message})` : ''}.`);
}

// --- Wikipedia ---------------------------------------------------------------

export async function lookupWikipedia(query, { fetchImpl = fetch } = {}) {
  const q = String(query ?? '').trim().slice(0, 120);
  if (!q) throw new Error('Wonach soll ich suchen?');
  const search = await getJson(`https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&utf8=1`, fetchImpl);
  const title = search.query?.search?.[0]?.title;
  if (!title) throw new Error(`Zu „${q}“ habe ich bei Wikipedia nichts gefunden.`);
  const summary = await getJson(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, fetchImpl);
  const link = summary.content_urls?.desktop?.page;
  return {
    titel: summary.title || title,
    zusammenfassung: String(summary.extract || '').slice(0, 1500),
    mehrdeutig: summary.type === 'disambiguation',
    link: typeof link === 'string' && link.startsWith('https://de.wikipedia.org/') ? link : `https://de.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    quelle: 'Wikipedia'
  };
}
