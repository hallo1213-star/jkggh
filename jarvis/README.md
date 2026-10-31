# J.A.R.V.I.S. – dein persönlicher Sprachassistent

Jarvis läuft in der Cloud und ist als App auf deinem **iPhone** nutzbar – zu Hause und unterwegs, **auch wenn dein Laptop aus ist**. Er versteht Deutsch, antwortet mit der ElevenLabs-Stimme **Robert Ranger – Cool Storyteller** und kann – sobald dein Laptop an ist – auch deinen Windows-Laptop steuern. Wichtige Aktionen führt er erst aus, nachdem du sie auf dem Bildschirm bestätigt hast.

## Schnellstart in 3 Schritten

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hallo1213-star/jarvis)

1. **Auf den Knopf oben klicken** und bei Render anmelden.
2. Zwei Felder ausfüllen und **Apply** klicken:
   - `DEEPGRAM_API_KEY` – dein Schlüssel von https://console.deepgram.com
   - `JARVIS_PASSWORD` – ein Passwort, das du dir ausdenkst (mindestens 8 Zeichen)
3. Nach ca. 3 Minuten zeigt Render eine Adresse wie `https://jarvis-xxxx.onrender.com`. Öffne sie auf dem iPhone in **Safari**, gib dein Passwort ein und tippe **Teilen → Zum Home-Bildschirm**. Fertig!

Jarvis spricht zunächst mit einer eingebauten deutschen Stimme. **Robert Ranger nachrüsten:** Render → dein Dienst → **Environment** → `ELEVENLABS_API_KEY` und `ELEVENLABS_VOICE_ID` hinzufügen → **Save Changes**. Render startet Jarvis dann automatisch neu.

Alles Weitere unten ist optional.

## So funktioniert es

```
iPhone / Browser ──► Jarvis in der Cloud (Render)  ◄── Laptop-Verbinder (nur wenn der Laptop an ist)
   (Login)            ├─ hält deine API-Schlüssel          └─ führt PC-Aktionen aus
                      ├─ Uhrzeit, Timer, Suchen, Links
                      ▼
              Deepgram Voice Agent
              ├─ Spracherkennung Deutsch (nova-3)
              ├─ KI-Antworten + Funktionsaufrufe
              └─ Stimme: ElevenLabs (Robert Ranger)
```

- **Immer verfügbar:** Gespräch, Uhrzeit, Timer/Erinnerungen, Websuchen und Links (erscheinen zum Antippen in der App).
- **Nur wenn der Laptop an ist:** Programme, Dateien, Lautstärke, Software installieren, PowerShell usw. Der Laptop verbindet sich von selbst nach außen zu Jarvis – am Router musst du nichts einstellen.

## Hinweise zum iPhone

Öffne Jarvis nach dem Hinzufügen über das neue Symbol und melde dich dort **einmal** an (die App hat eigene Cookies). Tippe **Jarvis aktivieren** und erlaube das Mikrofon.

Optional bei Render → Environment: `USER_NAME` (wie Jarvis dich nennt), `DEEPGRAM_VOICE` (andere eingebaute Stimme, z. B. `aura-2-fabian-de`).

## Laptop verbinden (optional)

Dafür brauchst du **Node.js 20.12 oder neuer** auf dem Laptop (https://nodejs.org, LTS).

1. Kopiere den Ordner `laptop` auf deinen Laptop (z. B. nach `C:\Jarvis-Laptop`).
2. In Render: dein Dienst → **Environment** → Wert von `LAPTOP_TOKEN` kopieren.
3. Doppelklicke **`Laptop-verbinden.bat`**. Beim ersten Start öffnet sich die `.env`:
   - `JARVIS_URL=https://jarvis-xxxx.onrender.com`
   - `LAPTOP_TOKEN=` den kopierten Wert
4. Speichern, Editor schließen. Im Fenster steht „Verbunden“, in der App leuchtet **Laptop an**.

Tipp: Lege eine Verknüpfung zu `Laptop-verbinden.bat` in den Autostart-Ordner (`Win + R` → `shell:startup`), dann verbindet sich der Laptop bei jedem Start automatisch.

## Voice-ID von Robert Ranger finden

1. In ElevenLabs die **Voice Library** öffnen und „Robert Ranger – Cool Storyteller“ suchen.
2. Zu **My Voices** hinzufügen (nur eigene/hinzugefügte Stimmen funktionieren über die API).
3. Unter **My Voices** die Stimme öffnen und die **Voice ID** kopieren.

## Was Jarvis kann

| Bereich | Beispiele | Laptop nötig? |
|---|---|---|
| Gespräch | Fragen, Erklärungen, Ideen, Texte formulieren | nein |
| **Gedächtnis** | „Ich wohne in Köln“, „Merk dir, dass ich Pizza liebe“, „Was weißt du über mich?“, „Vergiss das mit der Pizza“ | nein |
| **Wetter** | „Wie wird das Wetter?“, „Regnet es morgen in Hamburg?“ | nein |
| **Nachrichten & Wissen** | „Was gibt es Neues?“, „Wer war Albert Einstein?“, „Wie hoch ist der Eiffelturm?“ | nein |
| **Telegram** | Automatische Sprachnachrichten bei Paketen, Bestellungen und wichtigen Mails · „Schick mir eine Sprachnachricht mit der Einkaufsliste“ · Erinnerungen auch bei geschlossener App | nein |
| **Tagesüberblick** | „Guten Morgen!“ – Wetter, ungelesene Mails, Einkaufsliste und Nachrichten | nein |
| **E-Mails** | „Hab ich neue Mails?“, „Was schreibt Amazon?“, „Lies mir die Mail von Oma vor“, „Antworte ihr, dass ich Sonntag komme“* | nein |
| **Geld verdienen** | „Mach eine Website-Vorschau für den Friseur Haarscharf in der Bahnhofstraße“, „Der Laden ist interessiert, schick das Angebot“, „Zeig meine Kunden“, „Schreib eine Anzeige für meine PS4“ | nein |
| **Einkaufen** | „Such mir günstige Bluetooth-Kopfhörer“, „Setz Milch und Batterien auf die Einkaufsliste“, „Was steht drauf?“, „Schick mir die Liste per Mail“* | nein |
| **Websites** | „Erstelle eine Website für meinen Fußballverein“, „Eine Seite für meine Geburtstagsparty am Samstag“, „Mach sie dunkler und füg Preise hinzu“ | nein |
| **Spiele** | „Mach mir ein Weltraum-Spiel“, „Ein Quiz über Fußball“, „Ein Memory mit Tieren“, „Mach es schwerer“ | nein |
| Zeit | „Wie spät ist es?“, „Erinnere mich in 20 Minuten an die Wäsche“ | nein |
| Web | „Wie wird das Wetter morgen?“, „Zeig mir Pizzerien in der Nähe“, „Öffne YouTube“ | nein (Link in der App) |
| Programme | „Öffne Spotify auf dem Laptop“, „Schließ Chrome“ | ja |
| Medien | „Nächstes Lied“, „Lauter“, „Lautstärke auf 30 Prozent“ | ja |
| Dateien | „Was liegt in meinen Downloads?“, „Erstelle eine Einkaufsliste auf dem Desktop“, „Lösche test.txt“* | ja |
| Software | „Installiere VLC“* | ja |
| System | „Wie voll ist mein Akku?“, „Sperr den Laptop“, „Fahr den Laptop herunter“* | ja |
| Alles andere | PowerShell-Befehl, den du siehst und bestätigst* | ja |

\* = erfordert deine Bestätigung in der App.

## Telegram einrichten (einmalig, ca. 3 Minuten)

Jarvis schickt dir dann kostenlos Nachrichten aufs Handy – **nur bei Wichtigem**: Pakete und Bestellungen (Versand, Zustellung, DHL, Hermes, DPD …), Mails, die Gmail als wichtig markiert, und Absender, die du festlegst. Dazu Erinnerungen und Timer, auch wenn die App zu ist.

1. **Telegram** aus dem App Store installieren und anmelden.
2. In Telegram **@BotFather** suchen und öffnen → **/newbot** schicken → einen Namen (z. B. „Mein Jarvis“) und einen Benutzernamen, der auf `bot` endet (z. B. `maxjarvis_bot`), eingeben. BotFather antwortet mit einem **Token** (sieht aus wie `123456789:AAH…`) – kopieren.
3. **Bei Render** → dein Dienst → **Environment** → `TELEGRAM_BOT_TOKEN` = das Token → **Save Changes**. Warten, bis Jarvis wieder **Live** ist.
4. In Telegram deinen neuen Bot öffnen und **/start** schicken. Er antwortet mit deiner **Chat-ID** (eine Zahl).
5. **Bei Render** `TELEGRAM_CHAT_ID` = diese Zahl eintragen → **Save Changes**.
6. In Jarvis sagen: „Teste Telegram“ – du bekommst eine Testnachricht. Fertig!

**Sprachnachrichten:** Hinweise und Erinnerungen kommen als **Sprachnachricht mit Jarvis' Standardstimme** (Deepgram, auch wenn eine ElevenLabs-Stimme eingestellt ist), der Text steht darunter. Klappt die Stimme einmal nicht, kommt automatisch eine Textnachricht. Sag „Schick mir eine Sprachnachricht mit …“, um selbst eine zu bekommen. Die Sprachnachrichten zählen zu deiner Deepgram-Nutzung.

**Tipp:** Für den Jarvis-Chat in Telegram einen eigenen, lauten Ton einstellen (Chat öffnen → oben auf den Namen → Benachrichtigungen → Ton).

**Optional:**
- `TELEGRAM_VOICE` = `false` – nur Textnachrichten statt Sprachnachrichten.
- `TELEGRAM_WICHTIG` – Absender, bei denen du immer Bescheid bekommen willst, mit Komma getrennt, z. B. `oma@example.de, Chef, Schule`.
- `TELEGRAM_MAIL_CHECK_MINUTES` – wie oft Jarvis nachschaut (Standard: alle 5 Minuten).

**Wichtig – Render wach halten:** Der kostenlose Render-Dienst schläft nach 15 Minuten ohne Besuch ein und kann dann keine Mails prüfen. So bleibt er wach:
1. Kostenloses Konto bei https://cron-job.org anlegen.
2. **Create cronjob** → URL: `https://jarvis-xxxx.onrender.com/health` (deine Adresse) → **alle 10 Minuten** → speichern.

Das passt in Renders 750 kostenlose Stunden pro Monat. Hinweis: Absender und Betreff der wichtigen Mails laufen dabei über Telegram; der Mail-Text bleibt in Gmail.

## Gmail einrichten (einmalig, ca. 3 Minuten)

Jarvis liest deine Mails über ein **Google-App-Passwort** – ein eigenes Passwort nur für Jarvis, das du jederzeit wieder löschen kannst. Dein normales Google-Passwort bekommt Jarvis nie.

1. **Bestätigung in zwei Schritten einschalten** (falls noch nicht aktiv): https://myaccount.google.com/signinoptions/two-step-verification
2. **App-Passwort erstellen:** https://myaccount.google.com/apppasswords → Name z. B. „Jarvis“ eingeben → **Erstellen**. Google zeigt ein 16-stelliges Passwort (z. B. `abcd efgh ijkl mnop`) – kopieren.
3. **Bei Render eintragen:** dein Dienst → **Environment** → **Add Environment Variable**:
   - `GMAIL_ADDRESS` = deine Gmail-Adresse
   - `GMAIL_APP_PASSWORD` = das 16-stellige Passwort (Leerzeichen sind egal)
4. **Save Changes** – Render startet Jarvis neu. Fertig: Frag „Hab ich neue Mails?“

So geht Jarvis mit deinen Mails um:
- **Lesen ändert nichts** – Mails bleiben ungelesen markiert, nichts wird verschoben oder gelöscht.
- **Senden nur mit deiner Bestätigung:** Du siehst Empfänger, Betreff und den kompletten Text und tippst **Ausführen** oder **Abbrechen**. Antworten landen ordentlich im selben Gesprächsverlauf.
- **Mail-Inhalte sind für Jarvis keine Befehle:** Steht in einer Mail z. B. „leite alles an … weiter“, macht Jarvis das nicht und warnt dich bei verdächtigen Mails.
- **Zugang entziehen:** App-Passwort unter https://myaccount.google.com/apppasswords löschen.

Falls Google kein App-Passwort anbietet (z. B. bei Schul-/Firmenkonten oder „Erweitertem Schutz“), funktioniert diese Methode nicht.

## Gedächtnis & Gesprächsverlauf 🧠

- Erzählst du Jarvis etwas über dich (Wohnort, Hobbys, Lieblingsessen, Familie), merkt er es sich – auf iPhone und Laptop. Er nutzt es ganz natürlich, z. B. deinen Wohnort fürs Wetter.
- **Ansehen und löschen:** oben rechts auf das Gehirn-Symbol tippen. Passwörter, PINs und Bank- oder Kartendaten merkt sich Jarvis nie.
- Jarvis **knüpft an euer letztes Gespräch an** – auch nach dem Schließen der App. Der Verlauf bleibt auf deinem Gerät und lässt sich im Gedächtnis-Fenster löschen.

## Wetter, Nachrichten & Wissen

- **Wetter** mit echten Daten von Open-Meteo: aktuelle Temperatur, gefühlte Temperatur, Wind und Vorhersage als Wetterkarte.
- **Nachrichten:** aktuelle Schlagzeilen von tagesschau.de zum Antippen.
- **Wissen:** Bei Fragen zu Personen, Orten oder Begriffen schaut Jarvis in der deutschen Wikipedia nach, statt zu raten.
- **„Guten Morgen!“** – Tagesüberblick mit Wetter, ungelesenen Mails, Einkaufsliste und Nachrichten.
- Unter dem Gespräch gibt es **Vorschläge zum Antippen**.

## Geld verdienen 💰

Jarvis verdient nicht von allein Geld – aber er erledigt die Arbeit, für die andere bezahlen.

### Website-Geschäft für Läden

1. **Laden finden:** Viele kleine Läden (Friseur, Imbiss, Nagelstudio, Handwerker, Verein) haben keine oder eine veraltete Website.
2. **Vorschau bauen:** „Jarvis, mach eine Website-Vorschau für den Friseur Haarscharf in der Bahnhofstraße.“ Jarvis legt den Laden in deiner **Kundenliste** an und baut eine animierte Website mit Leistungen, Öffnungszeiten (heute wird hervorgehoben), Aktions-Banner, Anrufen-/Route-Knöpfen und Impressum-Bereich.
3. **Hingehen und zeigen:** Besuch den Laden und zeig die Vorschau auf deinem Handy (Kunden → ↗ Vorschau). Der Laden sieht **kein Jarvis-Logo und keinen Download-Knopf**, nur ein Band „Vorschau – ein Website-Entwurf für …“.
4. **Angebot per Mail – erst nach Zustimmung:** Sagt der Laden „Schicken Sie mir das mal“, sag Jarvis: „Haarscharf ist interessiert, die Mail ist info@… , Preis 150 €“ und dann „Schick das Angebot“. Du siehst die Mail vorher und bestätigst sie; sie enthält einen Knopf zur Vorschau.
5. **Verkauft?** Status auf „Gekauft“ setzen und die Website in Jarvis **herunterladen** (Datei ohne Vorschau-Band) – die kann der Laden bei seinem Webhoster hochladen.

**Wichtig – damit du keinen Ärger bekommst:**
- **Keine Werbe-Mails ohne Einverständnis.** In Deutschland sind unerwünschte Werbe-E-Mails auch an Firmen nicht erlaubt und können teure Abmahnungen bringen. Jarvis sperrt Angebots-Mails deshalb, bis ein Kunde auf „Interessiert“ steht.
- **Nichts erfinden:** Jarvis schreibt keine erfundenen Bewertungen, Preise oder Öffnungszeiten. Frag den Laden nach den echten Angaben.
- **Impressum & Datenschutz:** Geschäftliche Websites brauchen ein Impressum (und meist eine Datenschutzerklärung). Die Angaben muss der Inhaber liefern.
- **Gewerbe:** Wer regelmäßig Geld verdient, muss in Deutschland in der Regel ein Gewerbe anmelden. Bist du unter 18, brauchst du die Zustimmung deiner Eltern.

### Kleinanzeigen

„Ich will meine alte PlayStation verkaufen“ – Jarvis fragt kurz nach Zustand und Zubehör und schreibt eine ehrliche, ansprechende Anzeige mit **Titel kopieren / Text kopieren** und Links zum Preisvergleich (ähnliche Angebote bei Kleinanzeigen, **verkaufte** Preise bei eBay). Die Anzeige landet auch unter **Meine Projekte**.

## Einkaufen

- **Produktsuche:** Jarvis zeigt eine Karte mit Knöpfen zu **Amazon**, **idealo** (Preisvergleich) und **Google Shopping**. Du tippst drauf und bestellst selbst in deinem Konto – Jarvis bestellt und bezahlt bewusst nie selbst (keine gespeicherten Zahlungsdaten, keine versehentlichen Bestellungen durch Verhörer).
- **Einkaufsliste:** Jarvis fügt hinzu, streicht, liest vor und mailt dir die Liste (mit Bestätigung). Über den Knopf **Einkaufsliste** kannst du selbst abhaken, hinzufügen und Erledigtes entfernen. Die ganze Liste leert Jarvis nur nach deiner Bestätigung.
- **Eine Liste für alle Geräte:** iPhone und Laptop sehen dieselbe Liste, Änderungen erscheinen sofort auf dem anderen Gerät. Jedes Gerät hebt zusätzlich eine Kopie auf – schläft der kostenlose Server ein, stellt das nächste Gerät die Liste wieder her.
- **Pakete:** „Wo ist mein Amazon-Paket?“ – Jarvis sucht die Versandmail in deinem Gmail.

## Websites

Beschreib Jarvis einfach, was du brauchst – er schreibt die Texte, wählt Farben, Schrift und Logo und baut die Seite aus fertigen Bausteinen: Startbereich, Text, Vorteile, Galerie, Listen (z. B. Speisekarte, Trainingszeiten), Preise, Öffnungszeiten, Fragen & Antworten, Zitat, Termin, Aktions-Banner, Kontakt und Impressum – mit Animationen (bewegter Farbverlauf, einfliegende Elemente, Glanz-Knöpfe, Scroll-Fortschritt).

- **↗ Öffnen** zeigt die Website direkt in der App. Während sie offen ist, kannst du Änderungen sagen („mach die Überschrift größer“, „andere Farben“) – die Seite aktualisiert sich von selbst.
- **Teilen:** Die ganze Website steckt im Link; jeder kann sie ohne dein Passwort ansehen.
- **Herunterladen:** speichert die Website als fertige HTML-Datei (ohne Skripte), die du überall hochladen kannst. Teilen und Herunterladen gibt es nur in Jarvis – wer den Link öffnet, sieht nur die Website.
- **Meine Projekte** listet alle Spiele und Websites.
- Jarvis erfindet keine Kontaktdaten, Preise oder Termine – die übernimmt er nur von dir.
- Bilder hochladen geht (noch) nicht; die Seiten nutzen Emojis und Farbverläufe.

## Spiele

Jarvis baut auf Zuruf eigene Handy-Spiele und gestaltet Titel, Figuren, Farben und Schwierigkeit passend zu deinem Wunsch. Sechs Spieltypen:

| Typ | So geht's |
|---|---|
| Fangen | Gutes auffangen, Gefahren ausweichen |
| Ausweichen | Herabfallenden Hindernissen ausweichen, Bonus sammeln |
| Springen | Endlos-Lauf: über Hindernisse springen (Doppelsprung!), Münzen sammeln |
| Reaktion | 30 Sekunden lang so schnell wie möglich Ziele antippen |
| Memory | Kartenpaare finden |
| Quiz | Jarvis denkt sich die Fragen selbst aus |

- **▶ Spielen** öffnet das Spiel direkt in der App; **Meine Projekte** listet alle bisherigen Spiele und Websites.
- Steuerung: Finger ziehen/tippen am iPhone, Pfeiltasten/Leertaste am PC. Bestwerte werden gespeichert.
- **Teilen:** Das ganze Spiel steckt im Link – Freunde können es ohne dein Passwort spielen, und es geht auch nach Render-Neustarts nicht verloren.
- Während du spielst, ist Jarvis' Mikrofon stumm.

## Sicherheit

- **Login:** Ohne Passwort ist nichts erreichbar – weder die Oberfläche noch die Sprachverbindung. Nach 5 falschen Versuchen wird für 15 Minuten gesperrt. Die Anmeldung gilt 30 Tage; **Abmelden** oben rechts.
- **Bestätigung bei wichtigen Aktionen:** Löschen, Verschieben, Überschreiben, Installieren, Deinstallieren, Herunterfahren/Neustart, Energiesparmodus, Programmdateien öffnen und jeder PowerShell-Befehl erscheinen als Dialog. Ohne Antwort innerhalb von 90 Sekunden wird abgebrochen. Bewusst keine Bestätigung per Sprache.
- **Löschen = Papierkorb**, geschützte Ordner (Laufwerke, Benutzerordner, Desktop/Dokumente/Downloads selbst, Windows- und Programmordner) werden nie verschoben oder gelöscht.
- **Laptop-Zugang** nur mit dem geheimen `LAPTOP_TOKEN`. Gib ihn niemandem.
- **Schlüssel** liegen nur bei Render bzw. in deinen lokalen `.env`-Dateien und erreichen nie den Browser.

## Gut zu wissen

- **Aufwachzeit:** Der kostenlose Render-Dienst schläft nach 15 Minuten ohne Nutzung ein; das erste Öffnen danach dauert etwa eine Minute. Solange der Laptop-Verbinder läuft, bleibt Jarvis wach. Ohne Laptop kannst du ihn mit einem kostenlosen Dienst wie https://cron-job.org alle 10 Minuten `https://jarvis-xxxx.onrender.com/health` aufrufen lassen (das passt in Renders 750 Gratis-Stunden pro Monat).
- **iPhone gesperrt / App im Hintergrund:** iOS stoppt dann das Mikrofon. Nach dem Zurückkehren auf **Neu verbinden** tippen.
- **Timer** erinnern dich in der App – und mit eingerichtetem Telegram auch, wenn die App geschlossen ist.
- **Mehrere Geräte** können gleichzeitig angemeldet sein; der Laptop ist für alle erreichbar.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| Login: „JARVIS_PASSWORD ist nicht gesetzt“ | In Render → Environment ein Passwort mit mindestens 8 Zeichen eintragen. |
| „Bei Render fehlt: …“ | Den genannten Schlüssel in Render → Environment eintragen. |
| Fehler mit „401“ von Deepgram | Deepgram-Schlüssel prüfen. |
| Text erscheint, aber man hört nichts | ElevenLabs-Schlüssel/Voice-ID prüfen; Stimme unter **My Voices**? Plan erlaubt API-Zugriff? Details in Render → **Logs**. Am iPhone: Lautstärke hoch, ggf. Stummschalter aus. |
| „Gmail hat die Anmeldung abgelehnt“ | App-Passwort neu erstellen und in Render bei `GMAIL_APP_PASSWORD` eintragen; `GMAIL_ADDRESS` prüfen. |
| Jarvis unterbricht sich selbst | Kopfhörer verwenden oder „Mikro stumm, während Jarvis spricht“ einschalten. |
| Laptop-Fenster: „LAPTOP_TOKEN stimmt nicht“ | Wert erneut aus Render kopieren (ohne Leerzeichen). |
| Laptop-Fenster: „Status 502/503“ | Render wacht gerade auf – der Verbinder versucht es automatisch erneut. |
| „Laptop aus“, obwohl er an ist | `Laptop-verbinden.bat` starten bzw. Fenster offen lassen. |

## Lokal testen (optional)

`.env.example` nach `.env` kopieren, Werte eintragen, `npm install` und `npm start` → `http://localhost:3000`. Für den Laptop-Verbinder dann `JARVIS_URL=http://localhost:3000`.

## Technische Notizen

- Deepgram Voice Agent über das offizielle SDK `@deepgram/sdk` v5 (`client.agent.v1.connect()`, `sendSettings`, `sendMedia`, `sendFunctionCallResponse`).
- Cloud-Funktionen: `cloud-tools.js`. Laptop-Funktionen: `laptop/tools.js` (die Cloud liest nur deren Beschreibungen, ausgeführt wird auf dem Laptop durch `laptop/connector.js`).
- Irreversible Funktionen sind mit `defer_until_eot` markiert: Der Agent ruft sie erst auf, wenn dein Satz wirklich zu Ende ist.
- Doku: https://developers.deepgram.com
