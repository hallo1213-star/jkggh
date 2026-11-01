// Realistic responses in the documented formats of Open-Meteo, Wikipedia and tagesschau RSS.
export const calls = [];
const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
export async function fakeFetch(url) {
  url = String(url); calls.push(url);
  if (url.startsWith('https://geocoding-api.open-meteo.com/')) {
    if (/name=Nirgendwo/.test(url)) return json({ generationtime_ms: 0.3 });
    return json({ results: [{ id: 2886242, name: 'Köln', latitude: 50.93333, longitude: 6.95, country: 'Deutschland', admin1: 'Nordrhein-Westfalen' }] });
  }
  if (url.startsWith('https://api.open-meteo.com/v1/forecast')) return json({
    latitude: 50.94, longitude: 6.96, timezone: 'Europe/Berlin',
    current_units: { temperature_2m: '°C' },
    current: { time: '2026-10-31T09:00', interval: 900, temperature_2m: 11.4, apparent_temperature: 9.1, weather_code: 61, wind_speed_10m: 14.2, precipitation: 0.3 },
    daily: { time: ['2026-10-31', '2026-11-01', '2026-11-02'], weather_code: [61, 3, 0], temperature_2m_max: [12.6, 13.1, 10.4], temperature_2m_min: [7.2, 8.0, 3.9], precipitation_probability_max: [80, 25, 5] }
  });
  if (url.startsWith('https://de.wikipedia.org/w/api.php')) {
    if (/srsearch=Quatschwort/.test(url)) return json({ query: { searchinfo: { totalhits: 0 }, search: [] } });
    return json({ batchcomplete: '', query: { search: [{ ns: 0, title: 'Eiffelturm', pageid: 1, snippet: 'Der <span>Eiffelturm</span> ist …' }] } });
  }
  if (url.startsWith('https://de.wikipedia.org/api/rest_v1/page/summary/')) return json({
    type: 'standard', title: 'Eiffelturm', extract: 'Der Eiffelturm ist ein 330 Meter hoher Eisenfachwerkturm in Paris.',
    content_urls: { desktop: { page: 'https://de.wikipedia.org/wiki/Eiffelturm' } }
  });
  if (url.includes('tagesschau.de')) {
    if (url.includes('alle-meldungen')) return { ok: false, status: 503, text: async () => '' };
    return { ok: true, status: 200, text: async () => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>tagesschau.de</title>
<item><title><![CDATA[Bundestag beschließt neues Gesetz]]></title><link>https://www.tagesschau.de/inland/gesetz-100.html</link><description><![CDATA[<p>Mehr Geld für Schulen &amp; Kitas.</p>]]></description></item>
<item><title>Wetter: Sturm &quot;Xaver&quot; zieht auf</title><link>https://www.tagesschau.de/wetter-200.html</link><description>Warnung f&#252;r die K&#xFC;ste</description></item>
<item><title>Fußball: Köln gewinnt 3:1</title><link>javascript:alert(1)</link></item>
</channel></rss>` };
  }
  throw new Error('fetch failed (blocked in test)');
}
