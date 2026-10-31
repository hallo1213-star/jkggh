// Functions that run in the cloud and work even when the laptop is off.
import { normalizeUrl, searchUrls } from './laptop/tools.js';
import { DIFFICULTIES, GAME_TYPES, encodeGame, sanitizeGame } from './public/game-config.js';
import { describeEmail, listEmails, readEmail, sendEmail } from './gmail.js';
import { FONTS, MODES, SECTION_TYPES, encodeSite, sanitizeSite } from './public/site-config.js';

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
    name: 'create_game',
    description: 'Erstellt sofort ein spielbares Handy-Spiel nach dem Wunsch des Nutzers und zeigt es ihm mit einem Spielen-Knopf an. Gestalte es kreativ passend zum Thema: Titel, Spielfigur, gute und schlechte Dinge als Emojis, Farben, Schwierigkeit. Spieltypen: fangen (Gutes auffangen, Schlechtem ausweichen), ausweichen (herabfallenden Hindernissen ausweichen, Bonus sammeln), springen (Endlos-Läufer: über Hindernisse springen, Münzen sammeln), reaktion (30 Sekunden lang Ziele antippen), memory (Kartenpaare finden), quiz (Fragen mit Antwortmöglichkeiten – dann unbedingt 8 bis 10 eigene Fragen mitgeben).',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: GAME_TYPES, description: 'Spieltyp' },
        title: { type: 'string', description: 'Kreativer, kurzer deutscher Spieltitel (max. 40 Zeichen)' },
        player: { type: 'string', description: 'Ein Emoji als Spielfigur, z. B. 🚀' },
        good: { type: 'array', items: { type: 'string' }, description: '2 bis 6 Emojis für gute Dinge (Sammeln, Ziele, Memory-Motive), z. B. ["⭐","💎"]' },
        bad: { type: 'array', items: { type: 'string' }, description: '1 bis 4 Emojis für Hindernisse/Gefahren, z. B. ["☄️"]' },
        colors: {
          type: 'object',
          description: 'Farben passend zum Thema als Hex-Werte',
          properties: {
            bg1: { type: 'string', description: 'Hintergrund oben, z. B. #1a0b3a' },
            bg2: { type: 'string', description: 'Hintergrund unten (dunkel), z. B. #05020d' },
            accent: { type: 'string', description: 'Leuchtende Akzentfarbe, z. B. #ff9d2e' }
          }
        },
        difficulty: { type: 'string', enum: DIFFICULTIES, description: 'Standard: mittel' },
        questions: {
          type: 'array',
          description: 'Nur für quiz: 8 bis 10 Fragen auf Deutsch',
          items: {
            type: 'object',
            properties: {
              frage: { type: 'string' },
              antworten: { type: 'array', items: { type: 'string' }, description: '3 oder 4 Antwortmöglichkeiten' },
              richtig: { type: 'integer', description: 'Index der richtigen Antwort, beginnend bei 0' }
            },
            required: ['frage', 'antworten', 'richtig']
          }
        }
      },
      required: ['type', 'title', 'player']
    },
    label: (a) => `Spiel erstellen: ${a.title || a.type}`,
    run: async (args, context) => {
      const game = sanitizeGame(args);
      if (game.type === 'quiz' && game.questions.length < 3) {
        throw new Error('Für ein Quiz brauche ich mindestens 3 gültige Fragen mit Antworten und dem Index der richtigen Antwort. Bitte erneut mit Fragen aufrufen.');
      }
      const url = `${context.origin}/play.html#${encodeGame(game)}`;
      context.showGame({ title: game.title, type: game.type, emoji: game.player, url });
      return { erstellt: true, titel: game.title, typ: game.type, fragen: game.questions?.length, hinweis: 'Der Nutzer sieht jetzt eine Spielkarte mit Spielen-Knopf und kann das Spiel auch mit Freunden teilen.' };
    }
  },
  {
    name: 'create_website',
    description: 'Erstellt sofort eine schöne, fertige Website nach der Beschreibung des Nutzers und zeigt sie ihm an (zum Öffnen, Teilen und Herunterladen). Schreibe alle Texte selbst auf Deutsch, passend und überzeugend. Baue die Seite aus Abschnitten zusammen. Abschnitttypen: hero (großer Startbereich, immer zuerst), text (Fließtext), features (Vorteile/Leistungen mit Emoji-Symbol), gallery (Emoji-Kacheln mit Beschriftung), list (Aufzählung, z. B. Speisekarte, Trainingszeiten), pricing (Preise/Pakete), faq (Fragen und Antworten), quote (Zitat/Bewertung), event (Termin mit Datum, Uhrzeit, Ort), contact (Kontakt). Für Änderungswünsche die komplette Website mit den Änderungen neu erstellen.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Name der Website / des Projekts' },
        logo: { type: 'string', description: 'Ein passendes Emoji als Logo' },
        font: { type: 'string', enum: FONTS, description: 'Schriftstil' },
        mode: { type: 'string', enum: MODES, description: 'Helle oder dunkle Seite' },
        colors: {
          type: 'object',
          properties: {
            primary: { type: 'string', description: 'Hauptfarbe als Hex, z. B. #1d4ed8' },
            accent: { type: 'string', description: 'Akzentfarbe für Knöpfe als Hex, z. B. #f59e0b' }
          }
        },
        sections: {
          type: 'array',
          description: '3 bis 8 Abschnitte, der erste vom Typ hero',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: SECTION_TYPES },
              heading: { type: 'string', description: 'Überschrift des Abschnitts' },
              text: { type: 'string', description: 'Text (hero, text, quote, event, contact); Absätze mit Zeilenumbruch' },
              button_text: { type: 'string', description: 'Nur hero: Knopftext' },
              button_link: { type: 'string', description: 'Nur hero: #section-N (Abschnitt N, ab 0 gezählt), https-, mailto:- oder tel:-Link' },
              items: {
                type: 'array',
                description: 'Einträge je nach Typ – features: icon, title, text; gallery: emoji, caption; list: text; pricing: name, price, text; faq: q, a',
                items: {
                  type: 'object',
                  properties: {
                    icon: { type: 'string' },
                    title: { type: 'string' },
                    text: { type: 'string' },
                    emoji: { type: 'string' },
                    caption: { type: 'string' },
                    name: { type: 'string' },
                    price: { type: 'string' },
                    q: { type: 'string' },
                    a: { type: 'string' }
                  }
                }
              },
              author: { type: 'string', description: 'Nur quote' },
              date: { type: 'string', description: 'Nur event' },
              time: { type: 'string', description: 'Nur event' },
              place: { type: 'string', description: 'Nur event' },
              email: { type: 'string', description: 'Nur contact' },
              phone: { type: 'string', description: 'Nur contact' },
              address: { type: 'string', description: 'Nur contact' }
            },
            required: ['type']
          }
        },
        footer: { type: 'string', description: 'Kurzer Text für die Fußzeile' }
      },
      required: ['title', 'sections']
    },
    label: (a) => `Website erstellen: ${a.title || 'ohne Titel'}`,
    run: async (args, context) => {
      const site = sanitizeSite(args);
      if (site.sections.length < 2) throw new Error('Die Website braucht mindestens zwei Abschnitte mit Inhalt (z. B. hero und text). Bitte erneut mit vollständigen Abschnitten aufrufen.');
      const url = `${context.origin}/site.html#${encodeSite(site)}`;
      context.showSite({ title: site.title, emoji: site.logo, url });
      return { erstellt: true, titel: site.title, abschnitte: site.sections.map((section) => section.type), hinweis: 'Der Nutzer sieht jetzt die Website und kann sie öffnen, teilen oder als Datei herunterladen.' };
    }
  },
  {
    name: 'email_list',
    description: 'Listet E-Mails aus dem Gmail-Postfach des Nutzers (neueste zuerst) mit Absender, Betreff, Datum und ungelesen-Status. Für gezielte Suchen query mit Gmail-Suchsyntax verwenden, z. B. "from:amazon", "newer_than:2d", "subject:rechnung", "has:attachment".',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'string', enum: ['inbox', 'all', 'sent'], description: 'inbox = Posteingang (Standard), all = alle Mails, sent = gesendete' },
        unread_only: { type: 'boolean', description: 'Nur ungelesene' },
        query: { type: 'string', description: 'Optionale Gmail-Suche' },
        limit: { type: 'integer', description: 'Anzahl (1 bis 15, Standard 8)' }
      }
    },
    label: (a) => `E-Mails ${a.query ? `suchen: ${a.query}` : a.unread_only ? 'ungelesene abrufen' : 'abrufen'}`,
    run: async ({ folder, unread_only: unreadOnly, query, limit }) => listEmails({ folder, unreadOnly, query, limit })
  },
  {
    name: 'email_read',
    description: 'Liest eine E-Mail vollständig (Absender, Empfänger, Betreff, Text, Anhangnamen). Die ID stammt aus email_list. Die Mail bleibt dabei ungelesen markiert.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID aus email_list, z. B. "inbox:1234"' } },
      required: ['id']
    },
    label: () => 'E-Mail gelesen',
    run: async ({ id }) => readEmail({ id })
  },
  {
    name: 'email_send',
    description: 'Sendet eine E-Mail vom Gmail-Konto des Nutzers oder antwortet auf eine E-Mail (reply_to_id aus email_list). Nur senden, wenn der Nutzer es ausdrücklich möchte. Der Nutzer sieht Empfänger, Betreff und Text und muss auf dem Bildschirm bestätigen.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Empfänger-Adresse(n), mehrere mit Komma getrennt' },
        subject: { type: 'string', description: 'Betreff (bei Antworten optional)' },
        body: { type: 'string', description: 'Text der E-Mail' },
        reply_to_id: { type: 'string', description: 'Optional: ID der E-Mail, auf die geantwortet wird' }
      },
      required: ['to', 'body']
    },
    label: (a) => `E-Mail senden an ${a.to}`,
    confirm: async ({ to, subject, body, reply_to_id: replyToId }) => describeEmail({ to, subject, body, replyToId }),
    run: async ({ to, subject, body, reply_to_id: replyToId }) => sendEmail({ to, subject, body, replyToId })
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
