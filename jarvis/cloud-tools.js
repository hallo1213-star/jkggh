// Functions that run in the cloud and work even when the laptop is off.
import { normalizeUrl, searchUrls } from './laptop/tools.js';
import { DIFFICULTIES, GAME_TYPES, encodeGame, sanitizeGame } from './public/game-config.js';
import { describeEmail, gmailConfigured, listEmails, readEmail, sendEmail } from './gmail.js';
import { addItems, listAsText, removeItems, sellLinks, shopLinks } from './shopping.js';
import { OFFER_ALLOWED, STATUSES, findCustomer, summarize, upsertCustomer } from './customers.js';
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
