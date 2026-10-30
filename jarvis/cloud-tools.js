// Functions that run in the cloud and work even when the laptop is off.
import { normalizeUrl, searchUrls } from './laptop/tools.js';

const timeZone = process.env.TZ || 'Europe/Berlin';

export const cloudTools = [
  {
    name: 'get_datetime',
    description: 'Liefert aktuelles Datum, Uhrzeit und Wochentag (deutsche Zeit).',
    parameters: { type: 'object', properties: {} },
    label: () => 'Uhrzeit abgefragt',
    run: async () => {
      const now = new Date();
      return {
        datum: now.toLocaleDateString('de-DE', { timeZone, day: 'numeric', month: 'long', year: 'numeric' }),
        wochentag: now.toLocaleDateString('de-DE', { timeZone, weekday: 'long' }),
        uhrzeit: now.toLocaleTimeString('de-DE', { timeZone, hour: '2-digit', minute: '2-digit' })
      };
    }
  },
  {
    name: 'web_search',
    description: 'Zeigt dem Nutzer auf seinem aktuellen Gerät (z. B. iPhone) einen Link zu einer Suche bei Google, YouTube, Google Maps oder Wikipedia. Nutze das für Wetter, Nachrichten, Videos, Orte und aktuelle Informationen. Du kannst die Ergebnisse selbst nicht lesen.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchbegriff' },
        platform: { type: 'string', enum: Object.keys(searchUrls), description: 'Wo gesucht wird. Standard: google' }
      },
      required: ['query']
    },
    label: (a) => `Suche (${a.platform || 'google'}): ${a.query}`,
    run: async ({ query, platform = 'google' }, context) => {
      const href = (searchUrls[platform] || searchUrls.google)(String(query ?? ''));
      context.showLink(href, `${platform === 'google' ? 'Google' : platform[0].toUpperCase() + platform.slice(1)}: ${query}`);
      return { angezeigt: true, hinweis: 'Der Link wird auf dem Bildschirm angezeigt; der Nutzer tippt ihn an.' };
    }
  },
  {
    name: 'open_link',
    description: 'Zeigt dem Nutzer auf seinem aktuellen Gerät einen Link zu einer Webseite an, z. B. "youtube.com".',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string', description: 'Kurzer Titel für den Link' }
      },
      required: ['url']
    },
    label: (a) => `Link: ${a.title || a.url}`,
    run: async ({ url, title }, context) => {
      const href = normalizeUrl(url);
      context.showLink(href, title || new URL(href).hostname);
      return { angezeigt: true };
    }
  },
  {
    name: 'set_timer',
    description: 'Stellt einen Timer oder eine Erinnerung. Jarvis meldet sich nach Ablauf, solange die Jarvis-App geöffnet ist.',
    parameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Dauer in Minuten (Dezimalzahlen erlaubt, z. B. 0.5 für 30 Sekunden)' },
        message: { type: 'string', description: 'Woran erinnert werden soll' }
      },
      required: ['minutes']
    },
    label: (a) => `Timer: ${a.minutes} min${a.message ? ` – ${a.message}` : ''}`,
    run: async ({ minutes, message }, context) => {
      const ms = Math.round(Number(minutes) * 60000);
      if (!(ms > 0) || ms > 24 * 3600000) throw new Error('Die Dauer muss zwischen ein paar Sekunden und 24 Stunden liegen.');
      context.schedule(ms, String(message || 'Dein Timer ist abgelaufen.'));
      const due = new Date(Date.now() + ms).toLocaleTimeString('de-DE', { timeZone, hour: '2-digit', minute: '2-digit' });
      return { gestellt: true, faelligUm: due };
    }
  },
  {
    name: 'laptop_status',
    description: 'Prüft, ob der Laptop gerade eingeschaltet und mit Jarvis verbunden ist.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Laptop-Status geprüft',
    run: async (args, context) => ({ verbunden: context.laptopConnected() })
  }
];

export function findCloudTool(name) {
  return cloudTools.find((tool) => tool.name === name);
}
