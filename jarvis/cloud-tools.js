// Functions that run in the cloud and work even when the laptop is off.
import { normalizeUrl, searchUrls } from './laptop/tools.js';
import { DIFFICULTIES, GAME_TYPES, encodeGame, sanitizeGame } from './public/game-config.js';
import { describeEmail, gmailConfigured, listEmails, readEmail, sendEmail } from './gmail.js';
import { addItems, listAsText, removeItems, sellLinks, shopLinks } from './shopping.js';
import { OFFER_ALLOWED, STATUSES, findCustomer, summarize, upsertCustomer } from './customers.js';
import { getNews, getWeather, lookupWikipedia, searchNews, topNews } from './knowledge.js';
import { getMarkets } from './markets.js';
import { bauplanConfig, missingSettings } from './bauplan-page.js';
import { gumroadConfigured, gumroadProducts } from './gumroad.js';
import { geocodePlace, placeDetails } from './places.js';
import { MODES as ORDER_MODES, checkOrder, cleanOrderItems, describeItem, findRestaurant, normalizePhone, orderSummary, orderTotal, readMenu, spokenPhone } from './restaurants.js';
import { twilioConfigured } from './phone-call.js';
import { addMemory, forgetMemory, sanitizeMemories } from './memories.js';
import { sendTelegram, telegramConfigured } from './telegram.js';
import { sendVoiceNote } from './voice-message.js';
import { getAutobahnWebcams, normalizeRoad, webcamSearchLinks } from './webcams.js';
import { REPEATS, addAppointment, addReminder, describeReminder, localNow, normalizeTime, removeEntry, sanitizePlanner, upcomingAppointments } from './planner.js';
import { addExpense, addNote, addVocab, findNotes, quizPairs, removeLastExpense, removeNote, removeVocabList, summarizeExpenses } from './personal.js';
import { findTaskByTitle, summarizeMoney } from './money-state.js';
import { MISSING_KEY, llmProvider } from './llm.js';
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
    name: 'memory_save',
    description: 'Merkt sich dauerhaft etwas über den Nutzer (Name, Wohnort, Vorlieben, Familie, Hobbys, wichtige Termine) als kurzen Satz, z. B. "Wohnt in Köln". Niemals Passwörter, PINs oder Bankdaten.',
    parameters: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'Kurzer Satz in der dritten Person' } },
      required: ['fact']
    },
    label: (a) => `Gemerkt: ${a.fact}`,
    run: async ({ fact }, context) => {
      const { list, added } = addMemory(context.getMemories(), fact);
      context.setMemories(list);
      return { gemerkt: added, bereitsBekannt: !added, anzahl: list.length };
    }
  },
  {
    name: 'memory_forget',
    description: 'Vergisst eine gespeicherte Erinnerung über den Nutzer.',
    parameters: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'Die Erinnerung oder ein eindeutiges Stichwort daraus' } },
      required: ['fact']
    },
    label: (a) => `Vergessen: ${a.fact}`,
    run: async ({ fact }, context) => {
      const { list, removed } = forgetMemory(context.getMemories(), fact);
      context.setMemories(list);
      return removed ? { vergessen: removed } : { nichtGefunden: true };
    }
  },
  {
    name: 'memory_list',
    description: 'Zählt auf, was du dir über den Nutzer gemerkt hast, und zeigt es auf dem Bildschirm an.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Gedächtnis angezeigt',
    run: async (args, context) => {
      const list = context.getMemories();
      context.setMemories(list, { show: true });
      return { erinnerungen: list.map((item) => item.text) };
    }
  },
  {
    name: 'get_weather',
    description: 'Echtes aktuelles Wetter und Vorhersage für einen Ort (Temperatur, Wetterlage, Regenwahrscheinlichkeit, Wind) und zeigt eine Wetterkarte an.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'Stadt, z. B. "Köln"' },
        days: { type: 'integer', description: 'Vorhersagetage 1 bis 7, Standard 3' }
      },
      required: ['place']
    },
    label: (a) => `Wetter: ${a.place}`,
    run: async ({ place, days }, context) => {
      const weather = await getWeather(place, { days });
      context.showWeather(weather);
      return weather;
    }
  },
  {
    name: 'get_news',
    description: 'Holt die aktuellen Schlagzeilen (tagesschau.de) und zeigt sie an.',
    parameters: { type: 'object', properties: { limit: { type: 'integer', description: 'Anzahl 1 bis 10, Standard 6' } } },
    label: () => 'Nachrichten abgerufen',
    run: async ({ limit }, context) => {
      const news = await getNews({ limit });
      context.showNews(news);
      return news;
    }
  },
  {
    name: 'wiki_lookup',
    description: 'Schlägt eine Person, einen Ort, ein Ereignis oder einen Begriff in der deutschen Wikipedia nach und liefert eine Zusammenfassung.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Suchbegriff, z. B. "Eiffelturm" oder "Albert Einstein"' } },
      required: ['query']
    },
    label: (a) => `Wikipedia: ${a.query}`,
    run: async ({ query }, context) => {
      const article = await lookupWikipedia(query);
      context.showLink(article.link, `Wikipedia: ${article.titel}`);
      return article;
    }
  },
  {
    name: 'daily_briefing',
    description: 'Tagesüberblick: Datum und Uhrzeit, Wetter am Wohnort, ungelesene E-Mails, offene Punkte der Einkaufsliste und die wichtigsten Nachrichten.',
    parameters: {
      type: 'object',
      properties: { place: { type: 'string', description: 'Wohnort für das Wetter (aus dem Gedächtnis), falls bekannt' } }
    },
    label: () => 'Tagesüberblick',
    run: async ({ place }, context) => {
      const now = new Date();
      const briefing = {
        datum: now.toLocaleDateString('de-DE', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }),
        uhrzeit: now.toLocaleTimeString('de-DE', { timeZone, hour: '2-digit', minute: '2-digit' })
      };
      // Each part is optional: one failing source must not spoil the briefing.
      const parts = await Promise.allSettled([
        place ? getWeather(place, { days: 1 }) : Promise.reject(new Error('Kein Wohnort bekannt')),
        gmailConfigured() ? listEmails({ unreadOnly: true, limit: 5 }) : Promise.reject(new Error('Gmail nicht eingerichtet')),
        getNews({ limit: 3 })
      ]);
      const [weather, mail, news] = parts;
      if (weather.status === 'fulfilled') {
        briefing.wetter = weather.value;
        context.showWeather(weather.value);
      } else briefing.wetter = { nichtVerfuegbar: weather.reason.message };
      briefing.emails = mail.status === 'fulfilled'
        ? { ungelesen: mail.value.treffer, neueste: mail.value.emails.map((email) => `${email.von}: ${email.betreff}`) }
        : { nichtVerfuegbar: mail.reason.message };
      const open = context.getShoppingList().filter((item) => !item.done).map((item) => item.text);
      briefing.einkaufsliste = { offen: open.length, artikel: open.slice(0, 8) };
      if (news.status === 'fulfilled') {
        briefing.nachrichten = news.value.meldungen.map((item) => item.titel);
        context.showNews(news.value);
      } else briefing.nachrichten = { nichtVerfuegbar: news.reason.message };
      return briefing;
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
        footer: { type: 'string', description: 'Kurzer Text für die Fußzeile' },
        customer: { type: 'string', description: 'Nur für das Website-Geschäft: Name des Ladens/Kunden. Dann wird es eine Vorschau für diesen Laden (ohne Jarvis-Logo und ohne Download für Besucher) und sie wird beim Kunden gespeichert.' }
      },
      required: ['title', 'sections']
    },
    label: (a) => `Website erstellen: ${a.title || 'ohne Titel'}${a.customer ? ` (für ${a.customer})` : ''}`,
    run: async (args, context) => {
      const site = sanitizeSite({ ...args, pitch: Boolean(args.customer) });
      if (site.sections.length < 2) throw new Error('Die Website braucht mindestens zwei Abschnitte mit Inhalt (z. B. hero und text). Bitte erneut mit vollständigen Abschnitten aufrufen.');
      const path = `/site.html#${encodeSite(site)}`;
      context.showSite({ title: site.title, emoji: site.logo, url: `${context.origin}${path}` });
      let customer;
      if (args.customer) {
        const result = upsertCustomer(context.getCustomers(), { name: args.customer, site: { path, title: site.title } });
        context.setCustomers(result.list);
        customer = summarize(result.customer);
      }
      return { erstellt: true, titel: site.title, abschnitte: site.sections.map((section) => section.type), kunde: customer, hinweis: customer ? 'Vorschau-Website beim Kunden gespeichert. Der Nutzer kann sie dem Laden auf dem Handy zeigen.' : 'Der Nutzer sieht jetzt die Website und kann sie öffnen, teilen oder als Datei herunterladen.' };
    }
  },
  {
    name: 'customer_add',
    description: 'Website-Geschäft: Legt einen Laden/Kunden in der Kundenliste an (oder ergänzt ihn, falls es ihn schon gibt).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name des Ladens, z. B. "Friseur Haarscharf"' },
        branche: { type: 'string', description: 'z. B. Friseur, Imbiss, Handwerker' },
        ort: { type: 'string', description: 'Ort oder Adresse' },
        email: { type: 'string', description: 'Geschäftliche E-Mail-Adresse, falls bekannt' },
        notiz: { type: 'string' }
      },
      required: ['name']
    },
    label: (a) => `Kunde angelegt: ${a.name}`,
    run: async ({ name, branche, ort, email, notiz }, context) => {
      const result = upsertCustomer(context.getCustomers(), { name, branche, ort, email, notiz });
      context.setCustomers(result.list);
      return { neu: result.created, kunde: summarize(result.customer) };
    }
  },
  {
    name: 'customer_update',
    description: `Website-Geschäft: Ändert einen Kunden, z. B. den Status (${STATUSES.join(', ')}), Preis, E-Mail oder Notiz. "interessiert" bedeutet: Der Laden hat zugestimmt, ein Angebot per E-Mail zu bekommen.`,
    parameters: {
      type: 'object',
      properties: {
        customer: { type: 'string', description: 'Name oder ID des Kunden' },
        status: { type: 'string', enum: STATUSES },
        email: { type: 'string' },
        preis: { type: 'string', description: 'Vereinbarter Preis, z. B. "150 €"' },
        branche: { type: 'string' },
        ort: { type: 'string' },
        notiz: { type: 'string' }
      },
      required: ['customer']
    },
    label: (a) => `Kunde aktualisiert: ${a.customer}${a.status ? ` → ${a.status}` : ''}`,
    run: async ({ customer: ref, ...fields }, context) => {
      const existing = findCustomer(context.getCustomers(), ref);
      if (!existing) throw new Error(`Kunde „${ref}“ nicht gefunden.`);
      const result = upsertCustomer(context.getCustomers(), { ...fields, id: existing.id, name: existing.name });
      context.setCustomers(result.list);
      return { kunde: summarize(result.customer) };
    }
  },
  {
    name: 'customer_list',
    description: 'Website-Geschäft: Zeigt die Kundenliste (optional nach Status gefiltert) und öffnet sie auf dem Bildschirm.',
    parameters: { type: 'object', properties: { status: { type: 'string', enum: STATUSES } } },
    label: () => 'Kundenliste angezeigt',
    run: async ({ status }, context) => {
      const list = context.getCustomers();
      context.setCustomers(list, { show: true });
      const shown = list.filter((customer) => !status || customer.status === status);
      const counts = Object.fromEntries(STATUSES.map((value) => [value, list.filter((customer) => customer.status === value).length]));
      return { anzahl: list.length, nachStatus: counts, kunden: shown.slice(0, 30).map(summarize) };
    }
  },
  {
    name: 'customer_send_offer',
    description: 'Website-Geschäft: Schickt einem Laden eine Angebots-E-Mail mit einem Knopf zu seiner Website-Vorschau. Nur erlaubt, wenn der Laden zugestimmt hat (Status interessiert). Du schreibst Betreff und Text; der Link wird automatisch angehängt. Der Nutzer bestätigt vor dem Senden.',
    parameters: {
      type: 'object',
      properties: {
        customer: { type: 'string', description: 'Name oder ID des Kunden' },
        subject: { type: 'string' },
        text: { type: 'string', description: 'Höflicher Angebotstext auf Deutsch, mit Anrede, wer der Absender ist, Preis falls vereinbart, und Grußformel' }
      },
      required: ['customer', 'subject', 'text']
    },
    label: (a) => `Angebot an ${a.customer}`,
    confirm: async ({ customer: ref, subject, text }, context) => {
      const customer = offerCustomer(context, ref);
      return { title: `Angebot an ${customer.name} senden?`, detail: `An: ${customer.email}\nBetreff: ${String(subject).slice(0, 200)}\n\n${String(text).slice(0, 3000)}\n\n[Knopf: Website-Vorschau ansehen → ${customer.site.title || 'Vorschau'}]` };
    },
    run: async ({ customer: ref, subject, text }, context) => {
      const customer = offerCustomer(context, ref);
      const url = `${context.origin}${customer.site.path}`;
      const body = String(text ?? '').trim();
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${body.split(/\n+/).map((part) => `<p>${escapeHtml(part)}</p>`).join('')}<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 26px;border-radius:999px;background:#4f46e5;color:#ffffff;font-weight:bold;text-decoration:none">Website-Vorschau ansehen</a></p></div>`;
      const sent = await sendEmail({ to: customer.email, subject, body: `${body}\n\nIhre Website-Vorschau: ${url}`, html });
      const result = upsertCustomer(context.getCustomers(), { id: customer.id, name: customer.name, status: customer.status === 'gekauft' ? 'gekauft' : 'angebot_gesendet' });
      context.setCustomers(result.list);
      return { ...sent, kunde: summarize(result.customer) };
    }
  },
  {
    name: 'create_listing',
    description: 'Schreibt eine ehrliche, verkaufsstarke Kleinanzeige für etwas, das der Nutzer verkaufen möchte, und zeigt sie mit Kopier-Knöpfen und Links zum Preisvergleich (Kleinanzeigen, verkaufte Artikel bei eBay) an.',
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Kurzer Suchbegriff für den Preisvergleich, z. B. "PlayStation 4 Pro 1TB"' },
        title: { type: 'string', description: 'Anzeigentitel (max. 65 Zeichen), mit Marke, Modell und wichtigstem Merkmal' },
        description: { type: 'string', description: 'Anzeigentext: Zustand ehrlich (auch Mängel), Lieferumfang, Details, Abholung/Versand, freundlicher Abschluss. Absätze mit Zeilenumbruch.' },
        condition: { type: 'string', description: 'z. B. Neu, Sehr gut, Gut, In Ordnung, Defekt' }
      },
      required: ['item', 'title', 'description']
    },
    label: (a) => `Kleinanzeige: ${a.title || a.item}`,
    run: async ({ item, title, description, condition }, context) => {
      const listing = {
        title: String(title ?? '').trim().slice(0, 65),
        text: `${condition ? `Zustand: ${String(condition).trim().slice(0, 40)}\n\n` : ''}${String(description ?? '').trim().slice(0, 4000)}`,
        links: sellLinks(item)
      };
      if (!listing.title || !listing.text.trim()) throw new Error('Titel und Beschreibung fehlen.');
      context.showListing(listing);
      return { angezeigt: true, hinweis: 'Der Nutzer kann Titel und Text kopieren und Preise vergleichen. Aktuelle Preise kennst du nicht.' };
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
    name: 'shop_search',
    description: 'Zeigt dem Nutzer eine Einkaufskarte mit Such-Links zu Amazon, idealo (Preisvergleich) und Google Shopping für ein Produkt. Du kannst selbst nichts bestellen oder bezahlen – der Nutzer tippt auf einen Link und bestellt in seinem eigenen Konto.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Präziser Suchbegriff, z. B. "Bluetooth Kopfhörer Noise Cancelling"' } },
      required: ['query']
    },
    label: (a) => `Produktsuche: ${a.query}`,
    run: async ({ query }, context) => {
      if (!String(query ?? '').trim()) throw new Error('Kein Suchbegriff angegeben.');
      context.showShop({ query: String(query).trim().slice(0, 80), links: shopLinks(query) });
      return { angezeigt: true, hinweis: 'Der Nutzer sieht Knöpfe für Amazon, idealo und Google Shopping. Preise und Angebote kennst du nicht.' };
    }
  },
  {
    name: 'shopping_list_add',
    description: 'Setzt einen oder mehrere Artikel auf die Einkaufsliste des Nutzers.',
    parameters: {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'string' }, description: 'Artikel, z. B. ["Milch", "2 Packungen Nudeln"]' } },
      required: ['items']
    },
    label: (a) => `Einkaufsliste: + ${(a.items || []).join(', ')}`,
    run: async ({ items }, context) => {
      const { list, added } = addItems(context.getShoppingList(), items);
      context.setShoppingList(list);
      return { hinzugefuegt: added, bereitsDrauf: (Array.isArray(items) ? items : [items]).length - added.length, anzahl: list.length };
    }
  },
  {
    name: 'shopping_list_remove',
    description: 'Streicht Artikel von der Einkaufsliste. Mit clear: true wird die ganze Liste geleert (nur wenn der Nutzer das ausdrücklich will; er muss es bestätigen).',
    parameters: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'Zu streichende Artikel' },
        clear: { type: 'boolean', description: 'Ganze Liste leeren' }
      }
    },
    label: (a) => (a.clear ? 'Einkaufsliste leeren' : `Einkaufsliste: − ${(a.items || []).join(', ')}`),
    confirm: async ({ clear }, context) => (clear ? { title: 'Ganze Einkaufsliste leeren?', detail: listAsText(context.getShoppingList()) || '(Die Liste ist schon leer.)' } : null),
    run: async ({ items, clear }, context) => {
      if (clear) {
        context.setShoppingList([]);
        return { geleert: true };
      }
      const { list, removed, notFound } = removeItems(context.getShoppingList(), items || []);
      context.setShoppingList(list);
      return { gestrichen: removed, nichtGefunden: notFound, anzahl: list.length };
    }
  },
  {
    name: 'shopping_list_show',
    description: 'Liest die Einkaufsliste und zeigt sie dem Nutzer auf dem Bildschirm an.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Einkaufsliste angezeigt',
    run: async (args, context) => {
      const list = context.getShoppingList();
      context.setShoppingList(list, { show: true });
      return { offen: list.filter((item) => !item.done).map((item) => item.text), erledigt: list.filter((item) => item.done).map((item) => item.text) };
    }
  },
  {
    name: 'shopping_list_email',
    description: 'Schickt die Einkaufsliste per E-Mail an die eigene Gmail-Adresse des Nutzers (nach Bestätigung auf dem Bildschirm).',
    parameters: { type: 'object', properties: {} },
    label: () => 'Einkaufsliste per Mail',
    confirm: async (args, context) => {
      if (!gmailConfigured()) return null;
      return { title: 'Einkaufsliste an dich selbst mailen?', detail: `An: ${process.env.GMAIL_ADDRESS.trim()}\n\n${listAsText(context.getShoppingList()) || '(leer)'}` };
    },
    run: async (args, context) => {
      const text = listAsText(context.getShoppingList());
      if (!text) throw new Error('Die Einkaufsliste ist leer.');
      if (!gmailConfigured()) throw new Error('Gmail ist noch nicht eingerichtet, deshalb kann ich die Liste nicht mailen.');
      return sendEmail({ to: process.env.GMAIL_ADDRESS.trim(), subject: 'Einkaufsliste', body: `Deine Einkaufsliste von Jarvis:\n\n${text}` });
    }
  },
  {
    name: 'telegram_send',
    description: 'Schickt dem Nutzer selbst eine Nachricht per Telegram, z. B. eine Notiz, eine Zusammenfassung oder eine Liste zum Mitnehmen – auf Wunsch als Sprachnachricht mit deiner Stimme. Nur an ihn selbst.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Die Nachricht (bei Sprachnachricht so formuliert, wie du sie sprechen würdest)' },
        voice: { type: 'boolean', description: 'Als Sprachnachricht senden (z. B. wenn er „Sprachnachricht“ sagt)' }
      },
      required: ['text']
    },
    label: (a) => (a.voice ? 'Sprachnachricht an dich' : 'Telegram-Nachricht an dich'),
    run: async ({ text, voice }) => {
      const message = String(text ?? '').trim();
      if (!message) throw new Error('Die Nachricht ist leer.');
      return voice ? sendVoiceNote(message, message) : sendTelegram(message);
    }
  },
  {
    name: 'telegram_status',
    description: 'Prüft, ob Telegram-Hinweise eingerichtet sind (Hinweise bei wichtigen Mails wie Paketen und Bestellungen, Erinnerungen auch bei geschlossener App) und schickt bei Bedarf eine Testnachricht.',
    parameters: { type: 'object', properties: { test: { type: 'boolean', description: 'Testnachricht senden' } } },
    label: () => 'Telegram geprüft',
    run: async ({ test }) => {
      const ready = telegramConfigured();
      if (ready && test) await sendTelegram('✅ Jarvis ist mit Telegram verbunden. Hier bekommst du Hinweise zu wichtigen Mails und Erinnerungen.');
      return {
        eingerichtet: ready,
        mailHinweise: ready && gmailConfigured(),
        wichtigeAbsender: String(process.env.TELEGRAM_WICHTIG || '').split(/[,;]/).map((entry) => entry.trim()).filter(Boolean),
        hinweis: ready ? undefined : 'Bei Render fehlen TELEGRAM_BOT_TOKEN und/oder TELEGRAM_CHAT_ID (Anleitung im README).'
      };
    }
  },
  {
    name: 'find_webcams',
    description: 'Zeigt offiziell öffentliche Webcams: Verkehrskameras einer deutschen Autobahn (Autobahn GmbH, mit aktuellen Bildern, optional in der Nähe eines Ortes) oder eine Suche nach öffentlichen Live-Webcams eines Ortes (Stadt, Strand, Berge, Skigebiet). Niemals private oder ungesicherte Kameras.',
    parameters: {
      type: 'object',
      properties: {
        road: { type: 'string', description: 'Autobahn für Verkehrskameras, z. B. "A1"' },
        place: { type: 'string', description: 'Ort, z. B. "Köln" (bei Autobahnen: Kameras in der Nähe dieses Ortes)' }
      }
    },
    label: (a) => `Webcams: ${[a.road, a.place].filter(Boolean).join(' bei ') || '?'}`,
    run: async ({ road, place }, context) => {
      if (normalizeRoad(road)) {
        const result = await getAutobahnWebcams(road, { near: place });
        context.showWebcams({ title: `Verkehrskameras ${result.autobahn}${result.nurInDerNaehe ? ` bei ${place}` : ''}`, cams: result.kameras, links: [] });
        return { ...result, kameras: result.kameras.map(({ titel, ort }) => ({ titel, ort })), hinweis: 'Die Kamerabilder werden dem Nutzer angezeigt.' };
      }
      if (!String(place ?? '').trim()) throw new Error('Für welchen Ort oder welche Autobahn soll ich Webcams suchen?');
      context.showWebcams({ title: `Webcams ${String(place).trim()}`, cams: [], links: webcamSearchLinks(place) });
      return { angezeigt: true, hinweis: 'Der Nutzer bekommt eine Suche nach öffentlichen Live-Webcams. Was darauf zu sehen ist, weißt du nicht.' };
    }
  },
  {
    name: 'briefing_settings',
    description: 'Stellt das automatische Morgen-Briefing ein: Jarvis schickt dann jeden Morgen zur gewünschten Uhrzeit von selbst eine Telegram-Sprachnachricht mit Wetter, Terminen, Mails, Einkaufsliste und Nachrichten. time leer lassen und enabled=false zum Ausschalten.',
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'Uhrzeit, z. B. "07:00"' },
        place: { type: 'string', description: 'Ort für das Wetter (Standard: gespeicherter Wohnort)' },
        enabled: { type: 'boolean', description: 'false schaltet das Briefing aus' }
      }
    },
    label: (a) => (a.enabled === false ? 'Morgen-Briefing aus' : `Morgen-Briefing ${a.time || ''}`),
    run: async ({ time, place, enabled }, context) => {
      const planner = sanitizePlanner(context.getStore('planner'));
      if (enabled === false) {
        context.setStore('planner', { ...planner, briefing: { ...planner.briefing, time: null } });
        return { ausgeschaltet: true };
      }
      const value = normalizeTime(time) || planner.briefing.time;
      if (!value) throw new Error('Um wie viel Uhr soll das Morgen-Briefing kommen?');
      context.setStore('planner', { ...planner, briefing: { time: value, place: String(place ?? planner.briefing.place ?? '').trim().slice(0, 80) } });
      return { uhrzeit: value, ort: place || planner.briefing.place || '(gespeicherter Wohnort)', telegram: telegramConfigured(), hinweis: telegramConfigured() ? undefined : 'Ohne Telegram kommt das Briefing nur in einer geöffneten App an.' };
    }
  },
  {
    name: 'reminder_add',
    description: 'Legt eine Erinnerung an – einmalig an einem Datum oder wiederkehrend (täglich, werktags, wöchentlich an einem Wochentag). Jarvis erinnert per Telegram-Sprachnachricht, auch bei geschlossener App. Für kurze Countdowns („in 10 Minuten“) set_timer nutzen.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Woran erinnert wird, z. B. "Müll rausbringen"' },
        time: { type: 'string', description: 'Uhrzeit, z. B. "19:00"' },
        repeat: { type: 'string', enum: REPEATS, description: 'einmal, taeglich, werktags oder woechentlich' },
        weekday: { type: 'string', description: 'Nur bei woechentlich: Wochentag, z. B. "montag"' },
        date: { type: 'string', description: 'Nur bei einmal: Datum JJJJ-MM-TT' }
      },
      required: ['text', 'time', 'repeat']
    },
    label: (a) => `Erinnerung: ${a.text}`,
    run: async (args, context) => {
      const { planner, reminder, existing } = addReminder(context.getStore('planner'), args);
      context.setStore('planner', planner);
      return { gespeichert: describeReminder(reminder), gabEsSchon: Boolean(existing), telegram: telegramConfigured() };
    }
  },
  {
    name: 'reminder_list',
    description: 'Zählt die gespeicherten Erinnerungen auf und zeigt den Planer an.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Erinnerungen angezeigt',
    run: async (args, context) => {
      const planner = sanitizePlanner(context.getStore('planner'));
      context.setStore('planner', planner, { show: true });
      return { erinnerungen: planner.reminders.map(describeReminder), morgenBriefing: planner.briefing.time };
    }
  },
  {
    name: 'reminder_remove',
    description: 'Löscht eine Erinnerung (Text oder eindeutiges Stichwort).',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    label: (a) => `Erinnerung gelöscht: ${a.text}`,
    run: async ({ text }, context) => {
      const { planner, removed } = removeEntry(context.getStore('planner'), 'reminders', text);
      context.setStore('planner', planner);
      return removed ? { geloescht: removed } : { nichtGefunden: true };
    }
  },
  {
    name: 'appointment_add',
    description: 'Speichert einen Termin. Jarvis erinnert vorher (Standard 60 Minuten, per Telegram) und nennt ihn im Morgen-Briefing. Rechne Angaben wie „Freitag“ oder „morgen“ selbst in ein Datum um (heute siehe oben).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'z. B. "Zahnarzt"' },
        date: { type: 'string', description: 'Datum JJJJ-MM-TT' },
        time: { type: 'string', description: 'Uhrzeit, z. B. "15:00" (optional)' },
        remind_minutes: { type: 'integer', description: 'Wie viele Minuten vorher erinnern (Standard 60)' }
      },
      required: ['title', 'date']
    },
    label: (a) => `Termin: ${a.title} ${a.date}${a.time ? ` ${a.time}` : ''}`,
    run: async ({ title, date, time, remind_minutes: remindMinutes }, context) => {
      const { planner, appointment, existing } = addAppointment(context.getStore('planner'), { title, date, time, remindMinutes });
      context.setStore('planner', planner);
      return { gespeichert: appointment, gabEsSchon: Boolean(existing), telegram: telegramConfigured() };
    }
  },
  {
    name: 'appointment_list',
    description: 'Zählt die kommenden Termine auf (Standard: nächste 14 Tage) und zeigt den Planer an.',
    parameters: { type: 'object', properties: { days: { type: 'integer' } } },
    label: () => 'Termine angezeigt',
    run: async ({ days }, context) => {
      const planner = sanitizePlanner(context.getStore('planner'));
      context.setStore('planner', planner, { show: true });
      return { heute: localNow().date, termine: upcomingAppointments(planner, { days: Math.min(Math.max(Number(days) || 14, 0), 365) }) };
    }
  },
  {
    name: 'appointment_remove',
    description: 'Löscht einen Termin (Titel oder eindeutiges Stichwort).',
    parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    label: (a) => `Termin gelöscht: ${a.title}`,
    run: async ({ title }, context) => {
      const { planner, removed } = removeEntry(context.getStore('planner'), 'appointments', title);
      context.setStore('planner', planner);
      return removed ? { geloescht: removed } : { nichtGefunden: true };
    }
  },
  {
    name: 'note_add',
    description: 'Notiert etwas für den Nutzer (Notiz, Idee, Tagebucheintrag).',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    label: () => 'Notiz gespeichert',
    run: async ({ text }, context) => {
      const { notes, note } = addNote(context.getStore('notes'), text, localNow().date);
      context.setStore('notes', notes);
      return { gespeichert: note.text, anzahl: notes.length };
    }
  },
  {
    name: 'note_find',
    description: 'Sucht in den Notizen (Stichworte) oder liefert die neuesten Notizen, und zeigt sie an.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Stichworte (leer = neueste)' } } },
    label: (a) => (a.query ? `Notizen: ${a.query}` : 'Notizen angezeigt'),
    run: async ({ query }, context) => {
      context.setStore('notes', context.getStore('notes'), { show: true });
      return { notizen: findNotes(context.getStore('notes'), query).map((note) => `${note.date}: ${note.text}`) };
    }
  },
  {
    name: 'note_remove',
    description: 'Löscht eine Notiz (eindeutiges Stichwort daraus).',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    label: () => 'Notiz gelöscht',
    run: async ({ query }, context) => {
      const { notes, removed } = removeNote(context.getStore('notes'), query);
      context.setStore('notes', notes);
      return removed ? { geloescht: removed } : { nichtGefunden: true };
    }
  },
  {
    name: 'expense_add',
    description: 'Trägt eine Ausgabe ins Haushaltsbuch ein (Betrag in Euro, Kategorie wie Essen, Freizeit, Kleidung, Handy, Schule, Transport).',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Betrag in Euro, z. B. 12.5' },
        category: { type: 'string' },
        note: { type: 'string', description: 'Wofür, optional' }
      },
      required: ['amount']
    },
    label: (a) => `Ausgabe: ${a.amount} € ${a.category || ''}`,
    run: async ({ amount, category, note }, context) => {
      const { expenses, expense } = addExpense(context.getStore('expenses'), { amount, category, note, date: localNow().date });
      context.setStore('expenses', expenses);
      return { gespeichert: expense, monat: summarizeExpenses(expenses, localNow().date.slice(0, 7)).gesamt };
    }
  },
  {
    name: 'expense_summary',
    description: 'Überblick über die Ausgaben eines Monats (gesamt, nach Kategorie, letzte Einträge) und zeigt das Haushaltsbuch an.',
    parameters: { type: 'object', properties: { month: { type: 'string', description: 'Monat JJJJ-MM (Standard: aktueller Monat)' } } },
    label: () => 'Ausgaben-Überblick',
    run: async ({ month }, context) => {
      context.setStore('expenses', context.getStore('expenses'), { show: true });
      return summarizeExpenses(context.getStore('expenses'), month || localNow().date.slice(0, 7));
    }
  },
  {
    name: 'expense_remove_last',
    description: 'Löscht die zuletzt eingetragene Ausgabe (z. B. bei einem Versehen).',
    parameters: { type: 'object', properties: {} },
    label: () => 'Letzte Ausgabe gelöscht',
    run: async (args, context) => {
      const { expenses, removed } = removeLastExpense(context.getStore('expenses'));
      context.setStore('expenses', expenses);
      return removed ? { geloescht: removed } : { nichtsDa: true };
    }
  },
  {
    name: 'vocab_add',
    description: 'Speichert Vokabeln in einer Liste (z. B. "Englisch Unit 3"); a = Deutsch, b = Fremdsprache.',
    parameters: {
      type: 'object',
      properties: {
        list: { type: 'string' },
        pairs: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } } }
      },
      required: ['list', 'pairs']
    },
    label: (a) => `Vokabeln: ${a.list}`,
    run: async ({ list, pairs }, context) => {
      const result = addVocab(context.getStore('vocab'), list, pairs);
      context.setStore('vocab', result.vocab);
      return { liste: result.list.name, hinzugefuegt: result.added, insgesamt: result.list.pairs.length };
    }
  },
  {
    name: 'vocab_quiz',
    description: 'Holt zufällige Vokabeln aus einer Liste zum Abfragen. Frag sie dann einzeln im Gespräch ab (Deutsch nennen, Übersetzung erfragen), sag ob richtig, und lobe.',
    parameters: { type: 'object', properties: { list: { type: 'string' }, count: { type: 'integer', description: 'Anzahl, Standard 10' } } },
    label: (a) => `Vokabel-Abfrage ${a.list || ''}`,
    run: async ({ list, count }, context) => quizPairs(context.getStore('vocab'), list, count)
  },
  {
    name: 'vocab_lists',
    description: 'Zeigt die vorhandenen Vokabellisten.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Vokabellisten angezeigt',
    run: async (args, context) => {
      context.setStore('vocab', context.getStore('vocab'), { show: true });
      return { listen: context.getStore('vocab').map((list) => `${list.name} (${list.pairs.length})`) };
    }
  },
  {
    name: 'vocab_remove_list',
    description: 'Löscht eine Vokabelliste.',
    parameters: { type: 'object', properties: { list: { type: 'string' } }, required: ['list'] },
    label: (a) => `Vokabelliste gelöscht: ${a.list}`,
    run: async ({ list }, context) => {
      const result = removeVocabList(context.getStore('vocab'), list);
      context.setStore('vocab', result.vocab);
      return result.removed ? { geloescht: result.removed } : { nichtGefunden: true };
    }
  },
  {
    name: 'set_timer',
    description: 'Stellt einen Timer oder eine Erinnerung. Jarvis meldet sich nach Ablauf in der App und – wenn Telegram eingerichtet ist – auch per Telegram, selbst wenn die App dann geschlossen ist.',
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
    name: 'create_sales_website',
    description: 'Für „Erstelle mir deine Website“: Erstellt und veröffentlicht die professionelle Verkaufswebsite für den „Jarvis-Bauplan“ (der Nutzer verkauft den Bauplan-Text, mit dem man sich einen eigenen Jarvis bauen lässt – Starter und Komplett). Zeigt Link, HTML-Download und die Produktdateien für Gumroad an und sagt, was für die Veröffentlichung noch fehlt.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Verkaufswebsite Jarvis-Bauplan',
    run: async (args, context) => {
      const config = bauplanConfig();
      const missing = missingSettings(config);
      const url = `${context.origin}/bauplan`;
      context.showBauplan({ url, missing, prices: { starter: config.priceStarter, komplett: config.priceKomplett } });
      return {
        erstellt: true,
        adresse: url,
        preise: `Starter ${config.priceStarter}, Komplett ${config.priceKomplett}`,
        status: missing.length ? 'Entwurf – noch nicht veröffentlichen' : 'fertig und online',
        fehlt: missing.map((m) => `${m.key}: ${m.what}`),
        naechsteSchritte: missing.length
          ? 'Erkläre kurz: 1) Die beiden Produktdateien (Knöpfe in der App) bei Gumroad als zwei Produkte hochladen (Starter und Komplett, Preise wie oben). 2) Die Gumroad-Links und die Impressum-Angaben bei Render eintragen (die fehlenden Variablen). Dann ist die Seite automatisch fertig. Hinweis: Gewerbe anmelden; unter 18 nur mit Zustimmung der Eltern.'
          : 'Die Seite ist fertig und kann geteilt werden (Link oder HTML-Datei für eigenes Hosting).'
      };
    }
  },
  {
    name: 'persona_settings',
    description: 'Ändert, wie Jarvis redet: stil butler = eleganter Film-JARVIS, siezt, nennt den Nutzer „Master“ (oder eine andere Anrede), trockener Sarkasmus; stil freund = locker, duzt. Für „Nenn mich Master“, „Sei wie der Jarvis aus Iron Man“, „Sei wieder normal“.',
    parameters: {
      type: 'object',
      properties: {
        stil: { type: 'string', enum: ['butler', 'freund'] },
        anrede: { type: 'string', description: 'Wie er angesprochen werden will, z. B. "Master", "Sir", "Chef", oder sein Name' }
      }
    },
    label: (a) => `Stil: ${a.stil || ''}${a.anrede ? ` (${a.anrede})` : ''}`,
    run: async ({ stil, anrede }, context) => {
      let list = context.getMemories().filter((m) => !(stil && /^Stil:/i.test(m.text)) && !(anrede && /^Anrede:/i.test(m.text)));
      if (stil) list = [...list, { text: `Stil: ${stil === 'butler' ? 'Butler' : 'Freund'}` }];
      const address = String(anrede ?? '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 30);
      if (address) list = [...list, { text: `Anrede: ${address}` }];
      context.setMemories(sanitizeMemories(list));
      context.refreshPrompt?.();
      return { gespeichert: true, hinweis: 'Ab sofort gilt der neue Stil – antworte schon jetzt so.' };
    }
  },
  {
    name: 'news_region',
    description: 'Lagebericht wie im Film: zeigt Nachrichten auf der 3D-Erdkugel. region welt = Weltnachrichten (ganze Erde, dreht sich), deutschland = Nachrichten aus Deutschland, wirtschaft = Wirtschaft, sonst ein Land/eine Stadt/Region (z. B. "Russland", "USA", "Naher Osten") – fliegt dorthin, rechts erscheinen die Meldungen. Für „Mach die Nachrichten an“, „Und wie ist es in Deutschland?“, „Gehen wir nach Russland“.',
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', description: '"welt", "deutschland", "wirtschaft" oder ein Land/Ort' },
        topic: { type: 'string', description: 'Optional ein Thema, z. B. "Krieg", "Wahl"' }
      },
      required: ['region']
    },
    label: (a) => `Nachrichten: ${a.region}${a.topic ? ` – ${a.topic}` : ''}`,
    run: async ({ region, topic }, context) => {
      const wanted = String(region ?? '').trim().toLowerCase();
      const subject = String(topic ?? '').trim().slice(0, 60);
      let news;
      let place = null;
      if (['welt', 'wirtschaft'].includes(wanted) && !subject) {
        news = await topNews(wanted);
        context.showGlobe({ action: 'world_news', title: wanted === 'welt' ? 'Weltlage' : 'Wirtschaft', items: news.meldungen });
      } else {
        place = await geocodePlace(wanted === 'deutschland' ? 'Deutschland' : region);
        if (context.globeMemory) context.globeMemory.place = place;
        context.showGlobe({ action: 'fly', place, topic: subject || 'Nachrichten' });
        news = wanted === 'deutschland' && !subject ? await topNews('deutschland') : await searchNews(subject ? `${subject} ${place.name}` : place.name, { limit: 8, days: 2 });
        const details = await placeDetails(place, '').catch(() => null);
        context.showGlobe({ action: 'panels', place, left: details?.left || { weather: null, info: null }, right: { title: subject ? `${subject} · ${place.name}` : `Nachrichten · ${place.name}`, topic: subject || 'Nachrichten', query: news.suche || (news.rubrik === 'deutschland' ? 'Top-Meldungen Deutschland' : news.rubrik), items: news.meldungen } });
      }
      return {
        region: place?.label || wanted,
        meldungen: news.meldungen.slice(0, 6).map((m) => `${m.titel} (${m.quelle})`),
        hinweis: 'Fasse die zwei bis vier wichtigsten Meldungen zusammen, eine pro Satz, knapp wie ein Lagebericht. Nur was in diesen Meldungen steht – nichts dazuerfinden, keine eigene politische Wertung.'
      };
    }
  },
  {
    name: 'markets',
    description: 'Börsen-Lagebericht mit echten Kursen (DAX, S&P 500, Nasdaq, Öl, Gold, Euro/Dollar, Bitcoin; heute und Woche) und den Börsen-Schlagzeilen des Tages. Für „Was macht der Aktienmarkt?“, „Wie steht der DAX?“.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Börse abgerufen',
    run: async (args, context) => {
      const markets = await getMarkets();
      context.showMarkets(markets);
      return {
        werte: markets.werte.map((w) => `${w.name}: ${w.kurs} ${w.unit}, heute ${w.heuteProzent ?? '?'} %, Woche ${w.wocheProzent ?? '?'} %`),
        schlagzeilen: markets.schlagzeilen.map((m) => m.titel),
        hinweis: 'Nenne die zwei, drei auffälligsten Bewegungen. Gründe nur, wenn sie in den Schlagzeilen stehen. Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlungen. Kurse sind ca. 15 Minuten verzögert.'
      };
    }
  },
  {
    name: 'weekly_numbers',
    description: '„Zahlen der Woche“: echte Zahlen aus seinem Jarvis – Einnahmen (eingetragen und Gumroad-Verkäufe), Geld-Modus-Fortschritt, Ausgaben, Termine der nächsten 7 Tage, ungelesene Mails, offene Einkäufe. Zeigt eine Übersicht an.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Zahlen der Woche',
    run: async (args, context) => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const { state } = context.getMoney();
      const incomeWeek = state.income.filter((e) => e.date >= weekAgo).reduce((sum, e) => sum + e.amount, 0);
      const incomeTotal = state.income.reduce((sum, e) => sum + e.amount, 0);
      const doneWeek = state.projects.flatMap((p) => p.tasks).filter((t) => t.status === 'erledigt' && t.doneAt && t.doneAt.slice(0, 10) >= weekAgo).length;
      const productsWeek = state.products.filter((p) => p.createdAt.slice(0, 10) >= weekAgo).length;
      const expenses = (context.getStore('expenses') || []).filter((e) => e.date >= weekAgo);
      const appointments = upcomingAppointments(context.getStore('planner'), { days: 7 });
      const [gumroad, mail] = await Promise.allSettled([
        gumroadConfigured() ? gumroadProducts() : Promise.resolve(null),
        gmailConfigured() ? listEmails({ unreadOnly: true, limit: 1 }) : Promise.resolve(null)
      ]);
      const euro = (v) => `${v.toFixed(2).replace('.', ',')} €`;
      const numbers = [
        { label: 'Einnahmen diese Woche', value: euro(incomeWeek), sub: `insgesamt ${euro(incomeTotal)} · von dir eingetragen` },
        gumroad.status === 'fulfilled' && gumroad.value ? { label: 'Gumroad', value: `${gumroad.value.totalSales} Verkäufe`, sub: `${gumroad.value.totalUsd.toFixed(2)} $ Umsatz insgesamt` } : null,
        { label: 'Geld-Modus', value: `${doneWeek} Aufgaben`, sub: `${productsWeek} neue Produkte/Texte diese Woche · Modus ${state.enabled ? 'an' : 'aus'}` },
        { label: 'Ausgaben diese Woche', value: euro(expenses.reduce((sum, e) => sum + e.amount, 0)), sub: `${expenses.length} Einträge im Haushaltsbuch` },
        { label: 'Termine (7 Tage)', value: String(appointments.length), sub: appointments.slice(0, 2).map((a) => a.title).join(', ') || 'keine' },
        mail.status === 'fulfilled' && mail.value ? { label: 'Ungelesene Mails', value: String(mail.value.treffer), sub: 'Gmail' } : null,
        { label: 'Einkaufsliste', value: String(context.getShoppingList().filter((i) => !i.done).length), sub: 'offene Sachen' }
      ].filter(Boolean);
      context.showWeekly(numbers);
      return {
        zahlen: numbers.map((n) => `${n.label}: ${n.value} (${n.sub})`),
        hinweis: 'Das sind alle echten Zahlen, die Jarvis hat. Trag sie knapp vor. Erfinde keine weiteren Zahlen (keine Reichweite, Follower oder Newsletter – dafür gibt es keine Daten). Sind es kleine Zahlen, sag es ehrlich, gern mit trockenem Humor.'
      };
    }
  },
  {
    name: 'order_find_restaurant',
    description: 'Essen bestellen, Schritt 1: Sucht das Restaurant (Telefonnummer, Adresse, Website, Öffnungszeiten) und liest wenn möglich die Speisekarte. Aufrufen, sobald der Nutzer sagt „Bestell bei … etwas für mich/uns“. Danach fragst du, was alle essen möchten.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name des Restaurants, z. B. "Qusys Pizza"' },
        town: { type: 'string', description: 'Stadt/Ort; leer = Wohnort aus dem Gedächtnis' },
        phone: { type: 'string', description: 'Nur wenn der Nutzer die Nummer selbst nennt' },
        website: { type: 'string', description: 'Nur wenn der Nutzer die Website/Speisekarte nennt' },
        test: { type: 'boolean', description: 'true, wenn seine Nachricht mit „Test:“ beginnt – dann ist es eine Probebestellung, bei der niemand angerufen wird' }
      },
      required: ['name']
    },
    label: (a) => `${a.test ? 'TEST – ' : ''}Restaurant suchen: ${a.name}`,
    run: async ({ name, town, phone, website, test }, context) => {
      const place = String(town ?? '').trim() || context.homeTown?.() || '';
      const hits = await findRestaurant(name, place).catch(() => []);
      const hit = hits[0] || null;
      const restaurant = {
        name: hit?.name || String(name).trim().slice(0, 80),
        phone: normalizePhone(phone) || hit?.phone || '',
        address: hit?.address || '',
        website: String(website ?? '').trim() || hit?.website || '',
        openingHours: hit?.openingHours || ''
      };
      const draft = context.orderDraft;
      for (const key of Object.keys(draft)) delete draft[key];
      if (test && !restaurant.phone) restaurant.phone = '+49301234567'; // test: any number, nobody is called
      draft.restaurant = restaurant;
      draft.test = test === true;
      let menuNote;
      if (restaurant.website) {
        try {
          draft.menu = await readMenu(restaurant.website);
          menuNote = `Speisekarte gelesen: ${draft.menu.items.length} Gerichte, z. B. ${draft.menu.items.slice(0, 8).map((i) => `${i.name} ${i.price}`).join(', ')}`;
        } catch (error) {
          menuNote = `Speisekarte nicht lesbar: ${error.message}`;
        }
      } else menuNote = 'Keine Website bekannt – die Speisekarte kann ich nicht prüfen.';
      return {
        restaurant: restaurant.name,
        adresse: restaurant.address || (hit ? undefined : `Nicht in OpenStreetMap gefunden${place ? ` (gesucht in ${place})` : ''}.`),
        telefon: restaurant.phone ? spokenPhone(restaurant.phone) : 'unbekannt – frag den Nutzer nach der Telefonnummer und rufe order_find_restaurant mit phone erneut auf',
        oeffnungszeiten: restaurant.openingHours || undefined,
        speisekarte: menuNote,
        weitereTreffer: hits.slice(1).map((h) => `${h.name}, ${h.address}`),
        naechsterSchritt: 'Frag jetzt, was er und seine Familie essen möchten (Gericht, Größe, Extras, für wen), ob Lieferung oder Abholung (bei Lieferung die Adresse), den Namen für die Bestellung und eine Rückrufnummer. Dann order_prepare.',
        anrufMoeglich: test ? 'TESTMODUS: Mach alle Schritte ganz normal (fragen, prüfen, vorlesen, bestätigen lassen). Beim Anruf wird niemand angerufen – ein simuliertes Restaurant antwortet. Sag am Anfang kurz, dass es ein Test ist.' : twilioConfigured() ? 'ja' : 'Twilio ist noch nicht eingerichtet – Jarvis kann dann nicht selbst anrufen, aber einen Spickzettel und einen Anrufen-Knopf zeigen.'
      };
    }
  },
  {
    name: 'order_prepare',
    description: 'Essen bestellen, Schritt 2: Prüft die Wünsche gegen die Speisekarte und stellt die Bestellung zusammen. Danach liest du die Zusammenfassung vollständig vor und fragst „Stimmt alles so?“. Bei Änderungswünschen erneut aufrufen.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Gericht, z. B. "Pizza Salami"' },
              quantity: { type: 'number' },
              size: { type: 'string', description: 'z. B. "groß", "30 cm"' },
              extras: { type: 'string', description: 'z. B. "ohne Zwiebeln, extra Käse"' },
              for: { type: 'string', description: 'Für wen, z. B. "Mama"' }
            },
            required: ['name']
          }
        },
        mode: { type: 'string', enum: ORDER_MODES },
        address: { type: 'string', description: 'Lieferadresse (nur bei Lieferung)' },
        customer_name: { type: 'string', description: 'Name für die Bestellung' },
        callback_phone: { type: 'string', description: 'Rückrufnummer des Nutzers' },
        payment: { type: 'string', description: 'z. B. "bar", "Karte"' },
        time: { type: 'string', description: 'z. B. "so schnell wie möglich", "19 Uhr"' },
        notes: { type: 'string' }
      },
      required: ['items', 'mode', 'customer_name']
    },
    label: (a) => `Bestellung zusammenstellen (${(a.items || []).length} Positionen)`,
    run: async (args, context) => {
      const draft = context.orderDraft;
      if (!draft.restaurant) throw new Error('Zuerst das Restaurant mit order_find_restaurant suchen.');
      const items = cleanOrderItems(args.items);
      if (!items.length) throw new Error('Was soll bestellt werden?');
      const mode = ORDER_MODES.includes(args.mode) ? args.mode : 'abholung';
      const address = String(args.address ?? '').trim().slice(0, 160);
      if (mode === 'lieferung' && address.length < 6) throw new Error('Für die Lieferung brauche ich die Adresse (Straße, Hausnummer, Ort).');
      const customerName = String(args.customer_name ?? '').trim().slice(0, 60);
      if (!customerName) throw new Error('Auf welchen Namen soll bestellt werden?');
      const callbackPhone = args.callback_phone ? normalizePhone(args.callback_phone) : null;
      if (args.callback_phone && !callbackPhone) throw new Error('Die Rückrufnummer sieht nicht gültig aus.');
      let checked = items.map((item) => ({ ...item, available: null, menuName: '', price: '', note: '' }));
      let menuChecked = false;
      if (draft.menu) {
        try {
          checked = await checkOrder(draft.menu, items);
          menuChecked = true;
        } catch (error) {
          checked = checked.map((item) => ({ ...item, note: `Nicht geprüft: ${error.message}` }));
        }
      }
      const missing = checked.filter((item) => menuChecked && !item.available);
      const order = {
        restaurant: draft.restaurant,
        items: checked,
        total: menuChecked && !missing.length ? orderTotal(checked) : null,
        mode,
        address,
        customerName,
        callbackPhone,
        payment: String(args.payment ?? '').trim().slice(0, 40),
        time: String(args.time ?? '').trim().slice(0, 60),
        notes: String(args.notes ?? '').trim().slice(0, 200)
      };
      draft.order = order;
      draft.ready = missing.length === 0 && Boolean(order.restaurant.phone);
      context.showOrder?.({ summary: orderSummary(order), phone: order.restaurant.phone, missing: missing.map((i) => `${i.name}${i.note ? ` (${i.note})` : ''}`), checked: menuChecked });
      return {
        zusammenfassung: orderSummary(order),
        speisekarteGeprueft: menuChecked ? 'ja' : 'nein (Speisekarte nicht verfügbar – sag ihm, dass du nicht prüfen konntest, ob es alles gibt)',
        nichtAufDerKarte: missing.length ? missing.map((i) => `${i.name}${i.note ? `: ${i.note}` : ''}`) : undefined,
        telefonFehlt: order.restaurant.phone ? undefined : 'Die Telefonnummer des Restaurants fehlt – frag danach.',
        naechsterSchritt: missing.length
          ? 'Sag ihm, was es nicht gibt (und ähnliche Gerichte, falls in note), und frag, was stattdessen; dann order_prepare erneut.'
          : 'Lies die komplette Zusammenfassung vor (Gerichte, Preis, Lieferung/Abholung, Name) und frag: „Stimmt alles so? Soll ich anrufen?“ Erst nach einem klaren Ja order_call.'
      };
    }
  },
  {
    name: 'order_call',
    description: 'Essen bestellen, Schritt 3: Ruft das Restaurant an und gibt die vorgelesene, bestätigte Bestellung auf (Jarvis sagt dabei, dass er ein KI-Assistent ist). Nur nach einem klaren Ja des Nutzers zur vorgelesenen Zusammenfassung.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Restaurant anrufen und bestellen',
    confirm: async (args, context) => {
      const order = context.orderDraft?.order;
      if (!order || !context.orderDraft.ready) return null;
      if (context.orderDraft.test) return { title: `TEST: Probeanruf bei ${order.restaurant.name} starten?`, detail: `${orderSummary(order)}\n\n🧪 Das ist nur ein Test – es wird NIEMAND angerufen. Ein simuliertes Restaurant antwortet.` };
      if (!twilioConfigured()) return null;
      return { title: `${order.restaurant.name} jetzt anrufen und bestellen?`, detail: `${orderSummary(order)}

Jarvis ruft ${spokenPhone(order.restaurant.phone)} an und sagt, dass er ein KI-Assistent ist, der für dich bestellt. Der Anruf läuft über dein Twilio-Konto (kostet ein paar Cent pro Minute).` };
    },
    run: async (args, context) => {
      const draft = context.orderDraft;
      if (!draft?.order) throw new Error('Es gibt noch keine Bestellung. Zuerst order_find_restaurant und order_prepare.');
      if (!draft.ready) throw new Error('Die Bestellung ist noch nicht fertig (Gericht nicht auf der Karte oder Telefonnummer fehlt).');
      if (draft.test) {
        context.simulatePhoneCall(draft.order);
        draft.ready = false;
        return { angerufen: false, test: true, hinweis: 'TEST: Es wird niemand angerufen, ein simuliertes Restaurant antwortet. Sag kurz: „Ich starte den Probeanruf.“ Das Ergebnis kommt gleich automatisch.' };
      }
      if (!twilioConfigured()) {
        context.showOrder?.({ summary: orderSummary(draft.order), phone: draft.order.restaurant.phone, manual: true });
        return { angerufen: false, hinweis: 'Twilio ist nicht eingerichtet, deshalb kann Jarvis nicht selbst anrufen. Der Nutzer sieht jetzt einen Anrufen-Knopf und den Spickzettel. Erkläre kurz, dass er für automatische Anrufe Twilio einrichten kann (README).' };
      }
      await context.startPhoneCall(draft.order);
      draft.ready = false; // never call twice for the same order by accident
      return { angerufen: true, hinweis: 'Der Anruf läuft. Sag kurz: „Ich rufe jetzt an.“ Das Ergebnis (Preis, Wartezeit) kommt automatisch, sobald das Gespräch vorbei ist – der Nutzer kann live mitlesen.' };
    }
  },
  {
    name: 'globe',
    description: 'Steuert Jarvis\' eigene interaktive 3D-Erdkugel („Erdbeobachtung“) mit echten Satellitenbildern – sie öffnet sich automatisch in der App. IMMER verwenden, wenn der Nutzer einen Ort sehen will („Zeig mir Frankreich“, „Zeig mir Paris“, „Zeig mir den Eiffelturm“, „Wie sieht es in Berlin Neukölln aus?“), ohne nachzufragen. Will er wissen, was an einem Ort los ist („Zeig mir die Proteste in Paris“, „Wie ist die Lage in Kiew?“, „Unwetter in Spanien“), zusätzlich topic setzen: Dann erscheinen links die Lage vor Ort (Wetter, Uhrzeit, Ortsinfo) und rechts aktuelle Meldungen zum Thema. Aktionen: ort (fliegen und zoomen), ganze_erde, drehen, stopp, nacht, tag, standort („Wo bin ich?“), schliessen.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['ort', 'ganze_erde', 'drehen', 'stopp', 'nacht', 'tag', 'standort', 'schliessen'] },
        place: { type: 'string', description: 'Bei ort: der Ort, möglichst eindeutig, z. B. "Paris", "Frankreich", "Neukölln, Berlin", "Eiffelturm, Paris". Leer lassen, wenn sich die Frage auf den zuletzt gezeigten Ort bezieht.' },
        topic: { type: 'string', description: 'Optional: worüber er aktuelle Meldungen will, z. B. "Proteste", "Streik", "Unwetter", "Wahl", "Verkehr". Ohne topic werden allgemeine Meldungen zum Ort angezeigt.' }
      },
      required: ['action']
    },
    label: (a) => (a.action === 'ort' ? `Erdkugel: ${[a.place, a.topic].filter(Boolean).join(' – ')}` : `Erdkugel: ${a.action.replace('_', ' ')}`),
    run: async ({ action, place, topic }, context) => {
      if (action !== 'ort') {
        context.showGlobe({ action });
        const notes = {
          standort: 'Der Standort wird gerade auf dem Gerät abgefragt (der Browser fragt eventuell um Erlaubnis). Sag noch keinen Ort – die Antwort kommt gleich automatisch als Nachricht.',
          nacht: 'Zeigt die Erde bei Nacht (NASA Black Marble, Lichter der Städte – ein Gesamtbild, keine Live-Aufnahme).',
          ganze_erde: 'Die ganze Erde wird angezeigt.',
          drehen: 'Die Erde dreht sich.',
          stopp: 'Die Drehung ist gestoppt.',
          tag: 'Normale Satellitenansicht.',
          schliessen: 'Die Erdkugel ist geschlossen.'
        };
        return { ok: true, hinweis: notes[action] };
      }
      const memory = context.globeMemory || {};
      const wanted = String(place ?? '').trim();
      if (!wanted && !memory.place) throw new Error('Welchen Ort soll ich zeigen?');
      const target = wanted ? await geocodePlace(wanted) : memory.place;
      memory.place = target;
      const subject = String(topic ?? '').trim().slice(0, 60);
      context.showGlobe({ action: 'fly', place: target, topic: subject || null });
      const details = await placeDetails(target, subject);
      const { weather: now, summary, items } = details;
      context.showGlobe({ action: 'panels', place: target, left: details.left, right: details.right });
      return {
        ort: target.label,
        art: target.kind || undefined,
        koordinaten: `${target.lat}, ${target.lon}`,
        aktuell: now || 'Wetterdaten gerade nicht verfügbar',
        info: summary ? summary.zusammenfassung.slice(0, 500) : undefined,
        meldungen: items.length ? items.slice(0, 6).map((m) => `${m.titel} (${m.quelle}${m.zeit ? `, ${new Date(m.zeit).toLocaleString('de-DE', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''})`) : (subject ? `Keine aktuellen Meldungen zu „${subject}“ gefunden.` : undefined),
        anzeige: 'Der Nutzer sieht jetzt die Erdkugel: links Lage vor Ort (Wetter, Uhrzeit, Ortsinfo), rechts die Meldungen.',
        hinweis: subject
          ? 'Beschreibe kurz und sachlich die Lage zum Thema anhand der Meldungen (was, wo, wann, wer berichtet) – nichts dazuerfinden, Widersprüche erwähnen. Die Satellitenbilder sind Archivbilder und zeigen das Ereignis nicht; sag das kurz.'
          : 'Satellitenbild: Esri World Imagery – ein Archivbild (Monate bis wenige Jahre alt), KEINE Live-Aufnahme. Aktuell sind nur Wetter, Uhrzeit, Tag/Nacht und die Meldungen.'
      };
    }
  },
  {
    name: 'money_mode',
    description: 'Autonomer Geld-Modus: start = Jarvis arbeitet ab jetzt selbstständig im Hintergrund an einer echten, legalen Einnahmequelle (analysiert Möglichkeiten, wählt eine aus, plant, erstellt digitale Produkte, Verkaufsseiten und Marketingtexte, wertet aus). Schritte, die Konten, Geld oder Veröffentlichungen brauchen, übernimmt der Nutzer selbst. stop = ausschalten. Für „Verdien Geld für mich“ → start (goal = sein Wunsch, falls er etwas Bestimmtes will).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'stop'] },
        goal: { type: 'string', description: 'Optional: konkreter Auftrag, z. B. "digitale Vorlagen für Studenten" oder "Websites für Läden". Leer lassen für das bestehende Projekt.' }
      },
      required: ['action']
    },
    label: (a) => (a.action === 'stop' ? 'Geld-Modus aus' : `Geld-Modus an${a.goal ? `: ${a.goal}` : ''}`),
    run: async ({ action, goal }, context) => {
      if (action === 'start' && !llmProvider()) throw new Error(MISSING_KEY);
      const result = context.moneyCommand({ action: action === 'stop' ? 'stop' : 'start', goal });
      context.showMoney();
      return { ...result, hinweis: action === 'stop' ? 'Ausgeschaltet. Bisherige Ergebnisse bleiben im Geld-Dashboard.' : 'Läuft jetzt im Hintergrund, auch wenn die App zu ist (solange der Server wach ist). Fortschritt im Geld-Dashboard und per Telegram. Er verspricht keine Einnahmen – echte Zahlen kommen nur aus Gumroad oder seinen Einträgen.' };
    }
  },
  {
    name: 'money_status',
    description: 'Zeigt den Stand des Geld-Modus: aktuelles Projekt, erledigte und offene Aufgaben, was auf den Nutzer wartet, erstellte Produkte und die echten Einnahmen. Öffnet das Geld-Dashboard.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Geld-Modus: Stand',
    run: async (args, context) => {
      const { state, waitingForDevice } = context.getMoney();
      context.showMoney();
      return { ...summarizeMoney(state), ...(waitingForDevice ? { hinweis: 'Daten werden gerade vom Gerät geladen.' } : {}) };
    }
  },
  {
    name: 'money_income_add',
    description: 'Trägt eine echte Einnahme ein, die der Nutzer erhalten hat (z. B. Verkauf, bezahlter Auftrag). Nur auf seine Aussage hin, nie erfinden.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Betrag in Euro' },
        source: { type: 'string', description: 'Woher, z. B. "Etsy", "Website für Bäckerei"' },
        note: { type: 'string' }
      },
      required: ['amount']
    },
    label: (a) => `Einnahme: ${a.amount} €${a.source ? ` (${a.source})` : ''}`,
    run: async (args, context) => {
      const { income } = context.moneyCommand({ action: 'income_add', ...args });
      return { eingetragen: `${income.amount.toFixed(2).replace('.', ',')} €`, quelle: income.source };
    }
  },
  {
    name: 'money_task_done',
    description: 'Markiert eine Aufgabe des Geld-Modus, die auf den Nutzer gewartet hat, als erledigt (z. B. „Gumroad-Konto angelegt“, „Produkt hochgeladen“). Wenn er einen Shop-Link nennt, mitgeben: Er wird zum Kauf-Knopf der Verkaufsseiten.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Teil des Aufgabentitels; leer, wenn nur eine Aufgabe wartet' },
        link: { type: 'string', description: 'Optional: https-Link zum Produkt im Shop' }
      }
    },
    label: (a) => `Geld-Modus: erledigt${a.task ? ` – ${a.task}` : ''}`,
    run: async ({ task, link }, context) => {
      const { state } = context.getMoney();
      const hit = findTaskByTitle(state, task);
      if (!hit) {
        const waiting = state.projects.flatMap((p) => p.tasks.filter((t) => t.status === 'wartet').map((t) => t.title));
        throw new Error(waiting.length ? `Welche Aufgabe genau? Offen für dich: ${waiting.join(' / ')}` : 'Gerade wartet keine Aufgabe auf dich.');
      }
      const result = context.moneyCommand({ action: 'task_done', id: hit.task.id, link });
      return { erledigt: result.task, shopLink: result.buyLink, hinweis: 'Jarvis arbeitet jetzt mit den nächsten Schritten weiter.' };
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

// Checks that an offer may be sent: known shop, e-mail, preview site and consent.
function offerCustomer(context, ref) {
  const customer = findCustomer(context.getCustomers(), ref);
  if (!customer) throw new Error(`Kunde „${ref}“ nicht gefunden.`);
  if (!OFFER_ALLOWED.includes(customer.status)) {
    throw new Error(`Werbe-E-Mails sind in Deutschland ohne Einverständnis nicht erlaubt (auch an Firmen). ${customer.name} hat den Status „${customer.status}“. Sprich den Laden zuerst persönlich oder telefonisch an; wenn er einverstanden ist, setze den Status auf „interessiert“.`);
  }
  if (!customer.email) throw new Error(`Für ${customer.name} ist keine E-Mail-Adresse gespeichert.`);
  if (!customer.site) throw new Error(`Für ${customer.name} gibt es noch keine Website-Vorschau. Erstelle zuerst eine mit create_website und customer.`);
  if (!gmailConfigured()) throw new Error('Gmail ist noch nicht eingerichtet.');
  return customer;
}
