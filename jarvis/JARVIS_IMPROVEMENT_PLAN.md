# Jarvis – Verbesserungsplan und Fortschritt

Diese Datei hält fest, was analysiert, gebaut und getestet wurde und was noch offen ist. So muss bei späteren Sitzungen nichts doppelt gemacht werden.

## Architektur (Ist-Zustand)

| Baustein | Dateien | Zweck |
|---|---|---|
| Server & Gespräch | `server.js`, `agent-config.js` | Login, WebSocket zum Browser, Deepgram Voice Agent, Werkzeug-Ausführung, Bestätigungen |
| Werkzeuge (Skills) | `cloud-tools.js`, `laptop/tools.js` | Alle Fähigkeiten, die Jarvis selbst aufruft (rund 60 Cloud- und 21 Laptop-Werkzeuge) |
| KI-Kern für Werkzeuge | `llm.js` | Groq / OpenRouter / Gemini / Claude, automatische Modellwahl, Bildanalyse, Werkzeug-Aufrufe |
| Kreativ | `model3d.js`, `projects.js`, `images.js`, `public/model3d.js`, `public/projects.js` | 3D-Modelle, Spiele/Apps/Shops, Bilder |
| Aufgaben | `tasks.js`, `money-agent.js`, `money-state.js` | Aufgabenmodus mit Plan und Abbruch, Geld-Modus |
| Planer & Persönliches | `planner.js`, `scheduler.js`, `personal.js`, `memories.js` | Erinnerungen, Termine, Briefing, Notizen, Ausgaben, Vokabeln, Gedächtnis |
| Telegram | `telegram.js`, `telegram-bot.js`, `voice-message.js`, `mail-watch.js` | Benachrichtigungen, Sprachnachrichten, Sicherung, Chat-Assistent |
| Welt & Wissen | `knowledge.js`, `places.js`, `markets.js`, `webcams.js`, `public/globe.js` | Wetter, Nachrichten, Wikipedia, Orte, Börse, 3D-Erde |
| Telefon & Bestellen | `restaurants.js`, `phone-call.js`, `public/call.js` | Restaurant finden, Speisekarte prüfen, Anruf über Twilio, Testmodus |
| Verkauf | `bauplan-page.js`, `bauplan-content.js` | Verkaufsseite und Produkte „Jarvis-Bauplan“ |
| Oberfläche | `public/index.html`, `public/app.js`, `public/style.css` | Orb- und Iron-Man-Design, Karten, Fenster, Einstellungen |

## Erledigt in „Jarvis Ultimate 2.0“ (diese Runde)

- [x] Analyse aller Bereiche (siehe Tabelle oben).
- [x] **Telegram-Assistent** (`telegram-bot.js`), nur der eigene Chat (`TELEGRAM_CHAT_ID`) wird beantwortet:
  - Text mit Gesprächsverlauf.
  - **Sprachnachrichten**: Deepgram-Spracherkennung, dann Ausführung.
  - **Fotos**: Bildanalyse.
  - **Textdateien/Code**: Zusammenfassung und Erklärung.
  - Jarvis wählt die Werkzeuge selbst: Wetter, Nachrichten, Planer, Notizen, Ausgaben, Gedächtnis, Mails lesen, Börse, Bilder, Aufgaben, Laptop (Programme öffnen usw.).
  - Bestätigungspflichtige Aktionen bleiben in der App.
  - Datei-, Bild- und Mail-Inhalte gelten als Information, nicht als Befehl.
  - Persönlichkeit (Butler/Freund) und Gedächtnis gelten auch hier.
- [x] **Werkzeug-Aufrufe** im KI-Kern (`chatWithTools`, OpenAI-Format für Groq/OpenRouter).
- [x] **Aufgaben abbrechen**: „Stopp die Aufgabe“ (`cancel_task`). Der Status wird ehrlich als „abgebrochen“ gezeigt, nie als „fertig“.
- [x] **Statusmeldungen über Telegram**: fertige Aufgaben als Datei, Fehler als kurze Meldung, keine Meldungen für Kleinigkeiten.
- [x] **Einstellungsmenü** (Zahnrad oben):
  - Persönlichkeit und Anrede, Design.
  - Anzahl der Erinnerungen.
  - Status aller Dienste und Modelle.
  - Schlüssel werden bewusst nur bei Render eingetragen.

## Erledigt: Memory Palace + Jarvis Studio

- [x] **Jarvis Studio**:
  - `studio.js`, `public/studio.js`.
  - Mehrstufige Website-Erzeugung mit eigenem Designsystem und generierten Bildern.
  - Live-Vorschau für Desktop, Tablet, Handy und Vollbild.
  - Automatische Prüfung mit Selbstreparatur: JS-Fehler, leere Seiten, kaputte Bilder, Querscrollen.
  - Gezielte Änderungen (nur betroffene Dateien), Versionen mit Wiederherstellen.
  - Dashboard: öffnen, umbenennen, löschen. Speicherung dauerhaft in IndexedDB auf dem Gerät.
  - ZIP-Export mit README, Hintergrund-Aufträge mit Fortschritt.
- [x] **Vorschau-Fix (alle Vorschauen):** Ersatzspeicher für `localStorage` in der Sandbox. Links wie `#/seite` bleiben in der Vorschau, statt zur Jarvis-Adresse zu springen.
- [x] **Memory Palace**:
  - `public/palace.js`, `memories.js`, `/api/memories`.
  - Erinnerungen mit Bereich, Verknüpfungen, ID und Änderungsdatum (Altbestand automatisch eingeordnet).
  - 3D-Netzwerk aus Bereichen, Erinnerungen, Themen, Linien und Partikeln.
  - Antippen, Bearbeiten, Löschen, Hinzufügen, Suche mit Hervorhebung und Kameraflug.

## Früher erledigt (Auszug)

3D-Studio (GLB-Export), Projekt-Werkstatt (Sandbox-Vorschau, ZIP), Bilder erschaffen/verstehen, Aufgabenmodus, Orb-Design, Film-Modus (Butler, Lagebericht, Börse, Wochenzahlen), Verkaufsseite, Essen bestellen per Telefon mit Testmodus, 3D-Erde, Geld-Modus, Planer, Gmail, Telegram-Benachrichtigungen, Laptop-Verbinder.

## Bewusst nicht umgesetzt

- **Maus, Tastatur und Bildschirm des Computers fernsteuern** sowie fremde Apps auf dem Handy bedienen.
- **Menschen auf Kamerabildern erfassen oder erkennen.**
- Programme öffnen, Dateien verwalten, Software installieren (mit Bestätigung) usw. bleibt über den Laptop-Verbinder möglich.

## Offen / nächste sinnvolle Schritte

- [ ] Aktivierungswort „Jarvis“: Im Browser nur mit dauerhaft offenem Mikrofon möglich. Das kostet Akku und Deepgram-Minuten, und iOS-Safari erlaubt es im Hintergrund nicht. Eine Lösung wäre ein lokales Wake-Word-Modell (z. B. openWakeWord als kleines Zusatzprogramm auf dem Laptop). Noch nicht gebaut.
- [ ] Bestätigungen per Telegram-Knopf (inline keyboard), damit z. B. Mails auch aus Telegram gesendet werden können.
- [ ] Projekte und 3D-Modelle per Telegram als Datei zurückschicken.
- [ ] Größere Projekte in mehreren KI-Schritten erzeugen (Datei für Datei), damit das kostenlose Kontingent reicht.
- [ ] Gedächtnis auf dem Server dauerhaft sichern. Bisher liegt es auf den Geräten und ist zusätzlich über Telegram gesichert (nur der Planer).

## Notwendige Schlüssel (Render → Environment)

| Variable | Pflicht | Wofür |
|---|---|---|
| `DEEPGRAM_API_KEY`, `JARVIS_PASSWORD`, `SESSION_SECRET` | ja | Gespräch, Login |
| `GROQ_API_KEY` | empfohlen | 3D, Werkstatt, Bilder verstehen, Aufgaben, Geld-Modus, Telegram-Assistent |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | empfohlen | Benachrichtigungen und Telegram-Assistent (`TELEGRAM_ASSISTANT=false` schaltet nur den Chat-Assistenten ab) |
| `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` | optional | Mails |
| `LAPTOP_TOKEN` | optional | Laptop-Verbinder |
| `TWILIO_*` | optional, kostenpflichtig | echte Anrufe |
| `GUMROAD_ACCESS_TOKEN`, `CESIUM_ION_TOKEN`, `ELEVENLABS_*` | optional | Verkaufszahlen, schärfere Erde, andere Stimme |

## Testergebnisse (Memory Palace + Studio)

- **Studio im Browser:** Shop gebaut (4 KI-Schritte). Der eingebaute Fehler wurde von der Prüfung gefunden und automatisch repariert, danach „keine Fehler“. Navigation, Warenkorb, Handy-Ansicht, Änderung „dunkler“, Versionen, ZIP, Dashboard und Neuladen funktionieren.
- **Memory Palace im Browser:** 8 Erinnerungen dargestellt, Suche „Jarvis Studio“ findet 3. Hinzufügen, Bereich antippen, Erinnerung bearbeiten und speichern funktionieren. Passwort-Erinnerung abgelehnt.
- **Unit-Test Gedächtnis:** 7 von 7 bestanden.
- **Nicht getestet:** echte Groq-Antworten (Designqualität hängt vom Modell ab) und echte Pollinations-Bilder.

## Testergebnisse (Runde davor)

- **Unit-Tests:** auth, customers, game-config, gmail, knowledge, laptop-tools, planner, shopping, site-config, telegram, voice, webcams, money, llm-free, places, projects und model3d sind alle bestanden.
- **Telegram-Assistent im Ablauf mit simulierten Diensten:**
  - Text mit Werkzeug (Wetter) beantwortet.
  - Sprachnachricht erkannt und Erinnerung angelegt.
  - Foto analysiert.
  - Code-Datei erklärt, eine eingeschleuste Anweisung darin ignoriert.
  - Laptop-Befehl weitergeleitet.
  - Nachrichten aus fremdem Chat ignoriert.
- **Einstellungsmenü im Browser:** Status angezeigt, Butler-Stil umgeschaltet.
- **Nicht getestet** (von hier aus nicht erreichbar): echte Server von Telegram, Deepgram, Groq, Twilio und Pollinations. Die Formate entsprechen den offiziellen APIs, müssen aber beim Nutzer einmal live ausprobiert werden.
